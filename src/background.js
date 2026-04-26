// Background service worker. Runs as an ES module (see manifest.json).
// MV3 service workers are *not* persistent — Chrome spins this down when
// idle. All durable state lives in chrome.storage.local; transient state
// (like refresh progress and the in-flight refresh tab id) lives in
// module-scoped variables which MAY survive between short events but
// MUST NOT be relied on across a worker restart.

import { getAuthors, makeAuthorMap } from "./authors.js";

const STORAGE_KEY = "xradar_posts";
const LAST_REFRESH_KEY = "xradar_last_refresh";

// Timing knobs for the "Refresh All" flow. Sized so that 29 authors take
// ~90s end-to-end with enough variance that the pattern doesn't look like
// a fixed-cadence bot. Tune here, not in the caller.
const DWELL_MS = 3500;         // how long we sit on each profile letting the content script scrape
const JITTER_MIN_MS = 600;     // min gap after closing one profile before opening the next
const JITTER_MAX_MS = 1200;    // max gap
const PER_AUTHOR_TIMEOUT_MS = 8000;  // hard ceiling per author, in case a tab hangs

// Single-flight lock. Only one refresh can be in flight at a time; a second
// click is a no-op while refreshing. This state lives in the worker and
// resets if the worker restarts — acceptable because a restart means any
// prior refresh tab was also torn down.
let refreshInFlight = false;

chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL("src/dashboard.html") });
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "SAVE_POSTS") {
    handleSave(msg.posts)
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true; // async
  }

  if (msg?.type === "REFRESH_ALL") {
    if (refreshInFlight) {
      sendResponse({ ok: false, error: "refresh_already_in_flight" });
      return false;
    }
    runRefreshAll()
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true; // async
  }

  return false;
});

// ─── SAVE_POSTS handler ───────────────────────────────────────────────

async function handleSave(incoming) {
  if (!Array.isArray(incoming) || incoming.length === 0) {
    return { added: 0, total: 0 };
  }

  // Drop anything not in the curated list. The content script is
  // promiscuous (it sends every profile the user visits); filtering here
  // means the authors store stays the only place that decides who's tracked.
  // We re-read on every save because the user may edit the list at any
  // time via the options page; chrome.storage.sync.get is fast enough.
  const authorMap = makeAuthorMap(await getAuthors());
  const curated = incoming.filter((p) => authorMap.has(p.handle));
  if (curated.length === 0) {
    return { added: 0, total: await countStored() };
  }

  const { [STORAGE_KEY]: existing = {} } = await chrome.storage.local.get(STORAGE_KEY);
  let added = 0;
  let upgraded = 0;
  for (const post of curated) {
    const prior = existing[post.id];
    if (!prior) {
      existing[post.id] = post;
      added++;
      continue;
    }
    // We already have this tweet — but the content script often sends a
    // thin version first (truncated text, no-media-yet) followed by richer
    // versions as the DOM fills in. Upgrade if any of:
    //   (a) text grew (truncated → expanded by Show-more click)
    //   (b) media grew (images / video posters lazy-loaded after first scan)
    // Either signal means we have strictly more signal than before.
    const richer =
      post.text.length > prior.text.length ||
      (post.media?.length ?? 0) > (prior.media?.length ?? 0);
    if (richer) {
      existing[post.id] = { ...prior, ...post };
      upgraded++;
    }
  }
  if (added === 0 && upgraded === 0) {
    return { added, upgraded, total: Object.keys(existing).length };
  }
  await chrome.storage.local.set({ [STORAGE_KEY]: existing });
  return { added, upgraded, total: Object.keys(existing).length };
}

async function countStored() {
  const { [STORAGE_KEY]: existing = {} } = await chrome.storage.local.get(STORAGE_KEY);
  return Object.keys(existing).length;
}

// ─── REFRESH_ALL: single-tab cycling through every curated profile ────
//
// UX goal: the user clicks one button and, ~60-90s later, the dashboard
// shows fresh posts for every curated author.
//
// Implementation: we open ONE pinned+inactive tab, navigate it through
// every profile URL in sequence with chrome.tabs.update. The existing
// content.js runs on each load, scrapes the initial render, and fires
// SAVE_POSTS via the normal path above. We don't need a "done" signal
// from the content script — we just dwell for DWELL_MS, which is long
// enough for the first paint + MutationObserver debounce to land.
//
// We broadcast REFRESH_PROGRESS messages so the dashboard can render a
// live counter. The dashboard listens but is not required to be open —
// if it's closed, the messages just have no listeners.

async function runRefreshAll() {
  refreshInFlight = true;
  let tabId = null;
  const startedAt = Date.now();
  let completed = 0;
  let failed = 0;

  // Snapshot the curated list once at the start so the loop sees a stable
  // set of authors. Edits made via the options page mid-refresh won't
  // re-route the in-flight loop — they take effect on the next refresh.
  const authors = await getAuthors();

  try {
    broadcastProgress({ phase: "starting", total: authors.length });

    if (authors.length === 0) {
      // Empty curated list: nothing to refresh. We still go through the
      // finally block so a "done" progress message is emitted with totals 0.
      return { completed: 0, failed: 0, durationMs: 0 };
    }

    // Open the shuttle tab pointed at the first profile. Subsequent
    // authors will reuse this same tab via chrome.tabs.update.
    const first = authors[0];
    const tab = await chrome.tabs.create({
      url: `https://x.com/${first.handle}`,
      active: false,
      pinned: true,
    });
    tabId = tab.id;

    for (let i = 0; i < authors.length; i++) {
      const author = authors[i];

      // For the first iteration the tab already points at author #0, so
      // skip the update. Every later author needs a navigation.
      if (i > 0) {
        try {
          await chrome.tabs.update(tabId, { url: `https://x.com/${author.handle}` });
        } catch (err) {
          // Tab was closed externally (user clicked X on it) — bail cleanly.
          console.warn("[xRadar] refresh tab gone, aborting:", err);
          tabId = null;
          break;
        }
      }

      broadcastProgress({
        phase: "fetching",
        index: i,
        total: authors.length,
        handle: author.handle,
        name: author.name,
      });

      // Dwell. Capped by PER_AUTHOR_TIMEOUT_MS in case something hangs —
      // in practice DWELL_MS is the common path.
      await sleep(Math.min(DWELL_MS, PER_AUTHOR_TIMEOUT_MS));
      completed++;

      // Jitter before moving to the next author so the navigation cadence
      // isn't metronomic. Skipped after the last author.
      if (i < authors.length - 1) {
        await sleep(JITTER_MIN_MS + Math.random() * (JITTER_MAX_MS - JITTER_MIN_MS));
      }
    }
  } catch (err) {
    failed++;
    console.error("[xRadar] refresh failed:", err);
    throw err;
  } finally {
    if (tabId !== null) {
      try { await chrome.tabs.remove(tabId); } catch { /* already gone */ }
    }
    await chrome.storage.local.set({ [LAST_REFRESH_KEY]: Date.now() });
    refreshInFlight = false;
    broadcastProgress({
      phase: "done",
      total: authors.length,
      completed,
      failed,
      durationMs: Date.now() - startedAt,
    });
  }

  return { completed, failed, durationMs: Date.now() - startedAt };
}

function broadcastProgress(payload) {
  // No receivers? runtime.sendMessage rejects — we don't care. Fire and forget.
  chrome.runtime
    .sendMessage({ type: "REFRESH_PROGRESS", ...payload })
    .catch(() => {});
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
