// Runs in every x.com / twitter.com tab (see manifest.json content_scripts).
// Isolated world: cannot import ES modules, cannot read page JS state
// directly, but CAN read the rendered DOM. We use that to extract tweets
// (and their media) from profile pages the user is actively viewing.
//
// Design notes:
//   - We only act on single-handle profile URLs (x.com/{handle}). Home,
//     search, notifications, etc. are skipped because the DOM shape differs
//     and we'd pull in noise.
//   - X renders tweets async and keeps appending on scroll. A MutationObserver
//     on <body> rescans whenever the DOM changes.
//   - Dedup is by a *fingerprint* (text-length | media-count), not by tweet
//     id alone. This lets us re-send when:
//       (a) a truncated tweet gets expanded by us clicking "Show more"; OR
//       (b) lazy-loaded images / video posters finish loading.
//     The background de-dupes again and keeps the richer copy.
//   - Posts flush to background in debounced batches so scroll-bursts
//     produce one message instead of twenty.

(() => {
  const NOT_HANDLES = new Set([
    "home", "explore", "notifications", "messages", "i", "search",
    "settings", "compose", "bookmarks", "lists", "communities", "jobs",
    "privacy", "tos", "about", "login", "signup", "flow",
  ]);

  function currentProfileHandle() {
    const m = location.pathname.match(/^\/([A-Za-z0-9_]{1,15})\/?$/);
    if (!m) return null;
    const handle = m[1].toLowerCase();
    if (NOT_HANDLES.has(handle)) return null;
    return handle;
  }

  let profileHandle = currentProfileHandle();
  if (!profileHandle) return;

  // seen            = id → last-sent fingerprint. We re-send when fingerprint
  //                   changes (text grew, media loaded, etc.).
  // expandRequested = ids we've already clicked "Show more" on, so we don't
  //                   repeatedly click the same tweet on every mutation.
  const seen = new Map();
  const expandRequested = new Set();

  let flushTimer = null;
  const pending = [];

  // Once the extension is reloaded/uninstalled, *this* content script keeps
  // running on whatever x.com tab the user has open, but any chrome.runtime.*
  // call throws "Extension context invalidated". Without a tripwire, every
  // MutationObserver fire after that point re-throws into the page. We track
  // an "alive" flag and shut down cleanly the first time we detect the
  // invalidated context — the user has to refresh the tab to start
  // collecting again, which is correct.
  let alive = true;

  function isContextInvalidated(err) {
    return /Extension context invalidated/i.test(String(err));
  }

  function shutdown() {
    if (!alive) return;
    alive = false;
    try { observer.disconnect(); } catch { /* observer may not exist yet */ }
    if (flushTimer !== null) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
  }

  function fingerprint(post) {
    return `t${post.text.length}|m${post.media.length}`;
  }

  // Normalize pbs.twimg.com photo URLs to a reasonable display size. X serves
  // a size-switcher via the `name` param: thumb | small | medium | large | orig.
  // `medium` is a good default for a dashboard card (~600px long edge).
  function normalizePhotoUrl(raw) {
    if (!raw) return raw;
    if (/[?&]name=/.test(raw)) return raw.replace(/([?&])name=\w+/, "$1name=medium");
    return raw + (raw.includes("?") ? "&" : "?") + "name=medium";
  }

  function extractMedia(article) {
    const media = [];

    // Photos: x.com wraps each image in [data-testid="tweetPhoto"]. There's
    // one wrapper per image (tweets allow up to 4). The <img> inside has a
    // pbs.twimg.com/media/... src.
    const photoWrappers = article.querySelectorAll('[data-testid="tweetPhoto"]');
    for (const w of photoWrappers) {
      const img = w.querySelector("img");
      const src = img?.getAttribute("src");
      if (!src) continue;
      // Skip profile avatars / emoji art — real tweet photos are on /media/.
      if (!src.includes("/media/")) continue;
      media.push({ type: "photo", url: normalizePhotoUrl(src) });
    }

    // Videos & animated GIFs: x.com renders both via <video> elements. The
    // poster attribute is a still frame we can show in the dashboard. The
    // actual stream is HLS behind Twitter's player and not trivially
    // embeddable outside x.com — so we link back to the tweet for playback.
    const videos = article.querySelectorAll("video");
    for (const v of videos) {
      const poster = v.getAttribute("poster");
      if (!poster) continue;
      media.push({ type: "video", poster });
    }

    return media;
  }

  function extractPost(article, expectedHandle) {
    const timeEl = article.querySelector("time");
    if (!timeEl) return null;
    const timestamp = timeEl.getAttribute("datetime");
    if (!timestamp) return null;

    // The timestamp is wrapped in an <a> whose href is the canonical tweet URL:
    //   /{authorHandle}/status/{tweetId}
    const linkEl = timeEl.closest("a[href*='/status/']");
    if (!linkEl) return null;
    const href = linkEl.getAttribute("href");
    const m = href.match(/^\/([^/]+)\/status\/(\d+)/);
    if (!m) return null;
    const [, authorFromUrl, id] = m;

    // A profile page shows the owner's tweets AND the owner's retweets of
    // others. We only keep posts authored by the profile owner to avoid
    // duplicates from retweets captured across multiple profiles.
    if (authorFromUrl.toLowerCase() !== expectedHandle) return null;

    const textEl = article.querySelector('[data-testid="tweetText"]');
    const text = textEl ? textEl.innerText : "";

    return {
      id,
      handle: authorFromUrl.toLowerCase(),
      text,
      timestamp,
      url: `https://x.com${href}`,
      media: extractMedia(article),
      capturedAt: Date.now(),
    };
  }

  // Using the data-testid keeps Show-more detection language-independent:
  // "Show more" / "Ver más" / "더 보기" all share the same testid.
  function findShowMore(article) {
    return article.querySelector('[data-testid="tweet-text-show-more-link"]');
  }

  function scan() {
    if (!alive) return;
    // Re-read the handle each scan in case the user SPA-navigated to a
    // different profile without a full page reload (x.com does this a lot).
    const handle = currentProfileHandle();
    if (!handle) return;
    if (handle !== profileHandle) {
      profileHandle = handle;
      seen.clear();
      expandRequested.clear();
    }

    const articles = document.querySelectorAll('article[data-testid="tweet"]');
    for (const art of articles) {
      const post = extractPost(art, profileHandle);
      if (!post) continue;

      const fp = fingerprint(post);
      if (seen.get(post.id) === fp) continue;

      seen.set(post.id, fp);
      pending.push(post);

      // If the tweet is still truncated (Show more visible), click it so a
      // future mutation scan gets the expanded text. One click per tweet.
      const showMore = findShowMore(art);
      if (showMore && !expandRequested.has(post.id)) {
        expandRequested.add(post.id);
        try { showMore.click(); } catch { /* extremely rare */ }
      }
    }
    scheduleFlush();
  }

  function scheduleFlush() {
    if (!alive) return;
    if (flushTimer !== null) return;
    if (pending.length === 0) return;
    // Debounce: wait a beat after the last mutation so a scroll-burst
    // produces one message instead of twenty.
    flushTimer = setTimeout(() => {
      flushTimer = null;
      if (!alive || pending.length === 0) return;
      const batch = pending.splice(0, pending.length);
      // sendMessage can fail two ways depending on Chrome version:
      //   - synchronous throw (older / context fully torn down)
      //   - rejected Promise (newer / runtime still partially alive)
      // We need both a try/catch AND a .catch() to cover the matrix.
      try {
        const result = chrome.runtime.sendMessage({ type: "SAVE_POSTS", posts: batch });
        if (result && typeof result.catch === "function") {
          result.catch((err) => {
            if (isContextInvalidated(err)) shutdown();
            // Other rejections (SW asleep, transient): next scan re-sends.
          });
        }
      } catch (err) {
        if (isContextInvalidated(err)) shutdown();
        // For any other sync throw we just drop the batch; the next scan
        // will re-derive pending from the DOM via fingerprint dedup.
      }
    }, 500);
  }

  const observer = new MutationObserver(() => scan());
  observer.observe(document.body, { childList: true, subtree: true });
  scan();
})();
