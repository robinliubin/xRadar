import {
  getAuthors,
  makeAuthorMap,
  AUTHORS_STORAGE_KEY,
} from "./authors.js";

const STORAGE_KEY = "xradar_posts";
const LAST_REFRESH_KEY = "xradar_last_refresh";
const LAST_LOGIN_WALL_KEY = "xradar_last_login_wall";

let currentFilter = "all";
let allPosts = [];
let refreshing = false;          // local UI lock; does not gate background
let lastRefreshAt = null;        // ms epoch
let lastLoginWallAt = null;      // ms epoch — set when content script saw an x.com login wall during the most recent refresh
let authors = [];                // current curated list (from sync storage)
let authorMap = new Map();       // lowercase-handle → author object

async function load() {
  const [
    {
      [STORAGE_KEY]: stored = {},
      [LAST_REFRESH_KEY]: lastAt = null,
      [LAST_LOGIN_WALL_KEY]: loginWallAt = null,
    },
    fetchedAuthors,
  ] = await Promise.all([
    chrome.storage.local.get([STORAGE_KEY, LAST_REFRESH_KEY, LAST_LOGIN_WALL_KEY]),
    getAuthors(),
  ]);

  authors = fetchedAuthors;
  authorMap = makeAuthorMap(authors);

  // Drop any post whose handle is no longer in the curated list. Removing
  // someone from the options page effectively hides their history without
  // a separate migration step.
  allPosts = Object.values(stored)
    .filter((p) => authorMap.has(p.handle))
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  lastRefreshAt = lastAt;
  lastLoginWallAt = loginWallAt;
  render();

  // Note: we deliberately do NOT auto-trigger a refresh on first open.
  // For brand-new users, surprise background-tab activity feels broken;
  // the empty state's CTA makes the action explicit instead.
}

function render() {
  const posts = currentFilter === "all"
    ? allPosts
    : allPosts.filter((p) => authorMap.get(p.handle)?.category === currentFilter);

  const feed = document.getElementById("feed");
  while (feed.firstChild) feed.removeChild(feed.firstChild);

  // If the most recent refresh hit an x.com login wall, show a banner at
  // the top of the feed even if some old posts are still cached. Reviewers
  // and first-run users especially need this signal.
  if (loginWallActive()) {
    feed.appendChild(buildLoginWallBanner());
  }

  if (posts.length === 0) {
    feed.appendChild(buildEmptyState());
  } else {
    for (const p of posts) feed.appendChild(buildPost(p));
  }

  renderMeta(posts);
}

function loginWallActive() {
  // Treat a login-wall flag as "active" only if it was set *after* the last
  // successful refresh — otherwise an old flag from a prior session would
  // confusingly persist after the user logs in and refreshes.
  if (!lastLoginWallAt) return false;
  if (lastRefreshAt && lastLoginWallAt < lastRefreshAt - 60_000) return false;
  return true;
}

function buildLoginWallBanner() {
  const banner = document.createElement("div");
  banner.className = "login-wall-banner";

  const title = document.createElement("p");
  title.className = "lw-title";
  title.textContent = "Looks like you're not signed in to x.com.";

  const body = document.createElement("p");
  body.className = "lw-body";
  body.textContent =
    "xRadar reads tweets from x.com profile pages using your browser session. " +
    "It can't see anything until you sign in. Open x.com, sign in, then click Refresh again.";

  const action = document.createElement("a");
  action.className = "lw-action";
  action.href = "https://x.com/login";
  action.target = "_blank";
  action.rel = "noopener noreferrer";
  action.textContent = "Open x.com to sign in →";

  banner.append(title, body, action);
  return banner;
}

function renderMeta(posts) {
  const uniqueAuthors = new Set(posts.map((p) => p.handle)).size;
  const parts = [
    `${posts.length} post${posts.length === 1 ? "" : "s"}`,
    `${uniqueAuthors} author${uniqueAuthors === 1 ? "" : "s"}`,
  ];
  if (lastRefreshAt) parts.push(`refreshed ${formatAgo(lastRefreshAt)}`);
  document.getElementById("meta").textContent = parts.join(" · ");
}

function setRefreshButton({ running, text }) {
  const btn = document.getElementById("refresh");
  btn.disabled = running;
  btn.classList.toggle("running", running);
  btn.textContent = text;
}

async function triggerRefresh() {
  if (refreshing) return;
  refreshing = true;
  setRefreshButton({ running: true, text: "Starting…" });
  // Re-render so the empty-state copy switches to "Collecting posts…"
  render();
  try {
    const res = await chrome.runtime.sendMessage({ type: "REFRESH_ALL" });
    if (res === undefined) {
      // chrome.runtime.sendMessage resolves to undefined specifically when a
      // listener received the message but didn't acknowledge it. In this
      // extension, that almost always means the service worker is running
      // stale code. Reload the extension at chrome://extensions to fix.
      console.error(
        "[xRadar] refresh got no response from the background service worker. " +
        "Most likely cause: stale SW. Reload the extension at chrome://extensions."
      );
      refreshing = false;
      setRefreshButton({ running: false, text: "Reload extension" });
      return;
    }
    if (!res.ok && res.error !== "refresh_already_in_flight") {
      console.error("[xRadar] refresh rejected:", res);
      refreshing = false;
      setRefreshButton({ running: false, text: "Refresh failed" });
      return;
    }
    // Success path: progress messages (fetching/done) drive the button
    // label and reset `refreshing` from here.
  } catch (err) {
    console.error("[xRadar] refresh send failed:", err);
    refreshing = false;
    setRefreshButton({ running: false, text: "Refresh all" });
  }
}

// ─── DOM construction (safe: createElement + textContent only) ─────────

function buildPost(p) {
  const author = authorMap.get(p.handle);

  const article = document.createElement("article");
  article.className = "post";

  const head = document.createElement("header");
  head.className = "post-head";

  const name = document.createElement("span");
  name.className = "name";
  name.textContent = author.name;

  const handle = document.createElement("span");
  handle.className = "handle";
  handle.textContent = `@${p.handle}`;

  const cat = document.createElement("span");
  cat.className = `cat cat-${author.category}`;
  cat.textContent = author.category;

  const when = document.createElement("a");
  when.className = "when";
  when.href = p.url;
  when.target = "_blank";
  when.rel = "noopener noreferrer";
  when.textContent = formatWhen(p.timestamp);

  head.append(name, handle, cat, when);

  const body = document.createElement("div");
  body.className = "post-text";
  body.textContent = p.text;

  article.append(head, body);

  // Media grid (photos + video posters). Rendered only when present so
  // text-only tweets don't get an empty container.
  if (Array.isArray(p.media) && p.media.length > 0) {
    article.appendChild(buildMedia(p.media, p.url));
  }

  return article;
}

function buildMedia(media, tweetUrl) {
  const grid = document.createElement("div");
  grid.className = `post-media count-${Math.min(media.length, 4)}`;

  for (const m of media) {
    if (m.type === "photo") {
      const link = document.createElement("a");
      link.href = tweetUrl;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.className = "media-item media-photo";

      const img = document.createElement("img");
      img.src = m.url;
      img.loading = "lazy";
      img.decoding = "async";
      img.alt = "";
      link.appendChild(img);
      grid.appendChild(link);
    } else if (m.type === "video") {
      const link = document.createElement("a");
      link.href = tweetUrl;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.className = "media-item media-video";

      const img = document.createElement("img");
      img.src = m.poster;
      img.loading = "lazy";
      img.decoding = "async";
      img.alt = "";
      link.appendChild(img);

      const play = document.createElement("span");
      play.className = "play-badge";
      play.textContent = "▶";
      play.setAttribute("aria-hidden", "true");
      link.appendChild(play);

      grid.appendChild(link);
    }
  }

  return grid;
}

function buildEmptyState() {
  const wrap = document.createElement("div");
  wrap.className = "empty";

  const title = document.createElement("p");
  title.className = "empty-title";
  if (refreshing) {
    title.textContent = "Collecting posts…";
  } else if (authors.length === 0) {
    title.textContent = "No authors curated.";
  } else {
    title.textContent = "Welcome to xRadar.";
  }

  const body = document.createElement("p");
  body.className = "empty-body";
  if (refreshing) {
    body.textContent = "xRadar is opening each curated profile in a pinned background tab and scraping recent posts. This takes ~60-90 seconds.";
  } else if (authors.length === 0) {
    body.textContent = "Open Settings and add some X handles to start collecting posts.";
  } else {
    body.textContent = `Click "Refresh all" above to fetch recent posts from your ${authors.length} curated authors. The first run takes ~60-90 seconds.`;
  }

  wrap.append(title, body);

  // Prerequisite checklist — only shown when the user hasn't started
  // collecting yet. The login requirement is FIRST so reviewers don't miss
  // it. This is the fix for the "Inaccurate Description" Web Store rejection
  // — the listing now stipulates this prerequisite, and so does the UI.
  if (!refreshing && authors.length > 0) {
    const checklist = document.createElement("div");
    checklist.className = "empty-checklist";

    const checklistTitle = document.createElement("p");
    checklistTitle.className = "checklist-title";
    checklistTitle.textContent = "Before you click Refresh:";
    checklist.appendChild(checklistTitle);

    const items = [
      {
        text: "Sign in to x.com in this Chrome profile.",
        action: { href: "https://x.com/login", label: "Open x.com" },
      },
      {
        text: "(Optional) Customize the curated list in Settings.",
        action: { href: "options.html", label: "Open Settings" },
      },
    ];
    const list = document.createElement("ol");
    list.className = "checklist";
    for (const it of items) {
      const li = document.createElement("li");
      const span = document.createElement("span");
      span.textContent = it.text + " ";
      li.appendChild(span);
      const a = document.createElement("a");
      a.href = it.action.href;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = it.action.label + " →";
      li.appendChild(a);
      list.appendChild(li);
    }
    checklist.appendChild(list);
    wrap.appendChild(checklist);
  }

  // No-authors case: just an "Open Settings" CTA. The checklist above is
  // skipped (it's only for the user-with-authors case), so this footer
  // gives them an obvious next step.
  if (!refreshing && authors.length === 0) {
    const settings = document.createElement("p");
    settings.className = "empty-settings";
    const link = document.createElement("a");
    link.href = "options.html";
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = "Open Settings →";
    settings.appendChild(link);
    wrap.appendChild(settings);
  }

  return wrap;
}

// ─── Time formatting ──────────────────────────────────────────────────

function formatWhen(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const diffMs = Date.now() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d`;
  return d.toLocaleDateString();
}

function formatAgo(epochMs) {
  const diffSec = Math.floor((Date.now() - epochMs) / 1000);
  if (diffSec < 10) return "just now";
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return new Date(epochMs).toLocaleDateString();
}

// ─── Wiring ───────────────────────────────────────────────────────────

document.querySelectorAll("nav.filters button").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelector("nav.filters button.active")?.classList.remove("active");
    btn.classList.add("active");
    currentFilter = btn.dataset.filter;
    render();
  });
});

document.getElementById("refresh").addEventListener("click", triggerRefresh);

// Reload when local storage changes (posts arriving) OR when the user
// edits the authors list in the options page (lives in sync storage).
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && (changes[STORAGE_KEY] || changes[LAST_REFRESH_KEY])) {
    load();
  } else if (area === "sync" && changes[AUTHORS_STORAGE_KEY]) {
    load();
  }
});

// Progress messages from the background refresh.
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type !== "REFRESH_PROGRESS") return;

  if (msg.phase === "starting") {
    refreshing = true;
    setRefreshButton({ running: true, text: `Starting… 0/${msg.total}` });
    render();
    return;
  }
  if (msg.phase === "fetching") {
    setRefreshButton({
      running: true,
      text: `${msg.index + 1}/${msg.total} · @${msg.handle}`,
    });
    return;
  }
  if (msg.phase === "done") {
    refreshing = false;
    setRefreshButton({ running: false, text: "Refresh all" });
    load();
  }
});

load();
