# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project concept

xRadar is a **Chrome extension** (Manifest V3) that surfaces recent X (Twitter) posts from a user-curated list of accounts. It uses **DOM scraping** of x.com pages — two collection paths: passive (posts captured when the user visits a profile naturally) and a **user-triggered "Refresh all"** that cycles one pinned background tab through every curated profile. No API keys, no server, no session cookies leave the user's browser.

The curated author list is **per-user** and stored in `chrome.storage.sync` so it follows the user across signed-in Chromes. A factory-default list of ~29 prominent AI researchers and tool builders ships in code (`DEFAULT_AUTHORS` in `src/authors.js`) and is used until the user makes their first edit via the options page.

## Architecture

The extension has three runtime components that communicate exclusively through `chrome.runtime.sendMessage` and `chrome.storage.local`:

```
┌────────────────────────┐      SAVE_POSTS       ┌──────────────────────┐
│ src/content.js         │ ────────────────────► │ src/background.js    │
│ (content script,       │                       │ (service worker,     │
│  isolated world,       │                       │  ES module)          │
│  runs on x.com/*)      │                       │                      │
└────────────────────────┘                       └──────────┬───────────┘
                                                            │ write
                                                            ▼
                                                   chrome.storage.local
                                                     key: xradar_posts
                                                            ▲
                                                            │ read + onChanged
                                                ┌───────────┴──────────┐
                                                │ src/dashboard.html + │
                                                │ src/dashboard.js     │
                                                │ (extension page)     │
                                                └──────────────────────┘
```

- **`src/authors.js`** is the authors store: `DEFAULT_AUTHORS` constant + async API (`getAuthors`, `saveAuthors`, `resetAuthors`) backed by `chrome.storage.sync`. `background.js` calls `getAuthors()` per-message to filter incoming posts; `dashboard.js` calls it on load and re-renders when `storage.onChanged` fires for the authors key; the options page reads/writes via this same module. `content.js` **cannot import it** (content scripts don't support ES modules) — that's why filtering happens in the service worker, not at the scrape site.
- **`src/content.js`** runs in the isolated-world sandbox on every x.com / twitter.com tab. It detects profile URLs (`x.com/{handle}`), installs a `MutationObserver` (x.com renders tweets async), extracts posts from `article[data-testid="tweet"]`, and batches them to the background via debounced (500ms) `chrome.runtime.sendMessage`.
  - **Media extraction.** Photos are pulled from `[data-testid="tweetPhoto"] img` (filtered to `pbs.twimg.com/media/` URLs so avatars/emoji aren't captured) and normalized to `?name=medium` for dashboard display. Videos/GIFs are captured as `{type: "video", poster}` — we do NOT try to play HLS video in the dashboard; the card links back to x.com.
  - **Fingerprint dedup.** The per-handle `seen` map keys by tweet id but stores a *fingerprint* (`t{textLen}|m{mediaCount}`). We only skip a tweet if the fingerprint is unchanged, which lets us re-send when text expands (Show-more click) or media finishes lazy-loading.
  - **Show-more click.** For long tweets rendered truncated, the content script clicks `[data-testid="tweet-text-show-more-link"]` once per tweet so the DOM mutation fires a re-scan with full text. The `expandRequested` set prevents re-clicking the same tweet on subsequent mutations.
- **`src/background.js`** is an MV3 service worker (non-persistent). Three responsibilities: (1) filter+dedupe+persist incoming `SAVE_POSTS` messages, (2) open the dashboard on action click, (3) service `REFRESH_ALL` — open ONE pinned+inactive shuttle tab and `chrome.tabs.update` it through every curated handle, dwelling ~3.5s per profile with 600-1200ms jitter so the existing content-script scraper does the work. Broadcasts `REFRESH_PROGRESS` messages (`starting` / `fetching` / `done`) for the dashboard to render a live counter. A single-flight lock (`refreshInFlight`) prevents concurrent refreshes. `LAST_REFRESH_KEY` in storage powers the "refreshed 2m ago" meta label.
- **`src/dashboard.{html,js,css}`** is the viewer. It reads from storage, sorts reverse-chronological, live-updates via `chrome.storage.onChanged` (both local for posts AND sync for authors-list edits from the options page), and exposes a "Refresh all" button that sends `REFRESH_ALL`. **First-open behavior is explicit**: empty state shows a CTA panel with a "Customize this list in Settings" link — we do NOT auto-trigger a refresh, because surprise background-tab activity feels broken to brand-new users. Layout is **CSS multi-column** (`column-width: 420px`) so the feed packs as many columns as the viewport supports; empty-state spans all columns (`column-span: all`). Media renders in a per-card grid below the text — photos inline (click to open tweet), videos as poster + ▶ badge (click to play on x.com).
- **`src/options.{html,js,css}`** is the settings page (registered as `options_ui` in the manifest, opens in its own tab). UI for adding new authors (handle + name + category form), changing category via inline dropdown, removing authors, and resetting to factory defaults. Validates handle format via `normalizeHandle` (1-15 chars, `[a-z0-9_]`, normalized to lowercase) and rejects duplicates. All writes go through `saveAuthors`, which fires `chrome.storage.onChanged` so the dashboard reactively updates.

## Key design constraints

- **User-triggered collection only.** The only automation is the "Refresh all" button. We do NOT auto-poll on a timer, auto-refresh periodically, run scheduled alarms, or auto-refresh on first open. Every batch of x.com hits is caused by an explicit click, which keeps the traffic pattern close to "one human browsing attentively" rather than "bot." Any feature that schedules refreshes (e.g. `chrome.alarms`-based periodic sync) must be a deliberate, clearly-flagged escalation.
- **Single source of truth for authors.** All decisions about "is this handle tracked?" route through `getAuthors()` in `authors.js`. Do not hardcode handle checks anywhere else, and do not access `chrome.storage.sync` directly for the authors key from outside `authors.js`.
- **`chrome.storage.sync` quotas are real.** 100KB total, 8KB per item, ~1.8K writes/hour. The current default list is ~2.3KB; well within bounds. The options page must NOT save on every keystroke — `saveAuthors()` is called once per discrete edit (add, remove, category change), which is fine.
- **Handles are stored lowercase.** `content.js` lowercases the URL-derived handle, and `AUTHOR_BY_HANDLE` lowercases keys on build. `authors.js` entries must be lowercase too — a mixed-case handle works today but quietly breaks any future code that does case-sensitive equality on `a.handle`.
- **Single-flight refresh.** `background.js` has a `refreshInFlight` boolean — a second `REFRESH_ALL` while one is running is rejected with `refresh_already_in_flight`. Don't reintroduce concurrent refreshes without replacing that state with something storage-backed (the service worker can be killed mid-refresh).
- **No framework, no build step.** Plain ES2022, no TypeScript, no bundler. Edit → reload extension → done. Introducing a build step must be justified; it's not free for a personal tool.
- **DOM-safe rendering.** Tweet bodies are arbitrary user content. `dashboard.js` builds every node with `createElement` + `textContent` — never `innerHTML`. A PreToolUse security hook will block `innerHTML` writes in this repo.
- **Content script can't import modules.** If `content.js` needs shared logic, either duplicate it or move the logic to the background and talk over messages. Do not try to add a bundler just for sharing a file.

## Why not GraphQL (yet)

The obvious "faster" path is calling x.com's internal GraphQL API (`/i/api/graphql/{hash}/UserTweets`) directly from the service worker using the user's session cookies. That drops refresh time from ~90s to ~5s. It was rejected for v2 because:

1. **Hash rotation.** The `{hash}` in the URL changes every few weeks. Keeping up requires scraping x.com's main JS bundle for the current hash — more moving parts that can silently break.
2. **Detection surface.** 29 rapid authenticated GraphQL calls from a non-browser context is arguably *more* suspicious than 29 real browser-tab navigations, which are indistinguishable from fast human browsing.
3. **Two sources of truth.** We'd have both DOM scraping and API parsing to maintain. One path is better than two.

Upgrade path is open if tab-cycling ever feels too slow in practice. Don't do it prophylactically.

## Running it

There is no `npm`, no dev server, and no tests. The "build" is "Chrome reads the files directly."

```
# 1. Open chrome://extensions
# 2. Enable "Developer mode" (top right)
# 3. Click "Load unpacked", select this repo root (the folder containing manifest.json)
# 4. Make sure you are logged into x.com in the same Chrome profile
# 5. Click the xRadar toolbar icon → dashboard opens and auto-triggers a refresh on first open
# 6. Subsequent refreshes: click "Refresh all" in the dashboard header
```

Iterating on code: after saving any file, go to `chrome://extensions` and click the reload icon on the xRadar card. Changes to `content.js` also require refreshing any already-open x.com tabs.

## Known fragility

- **X's DOM selectors change.** The scraper keys off `article[data-testid="tweet"]`, `[data-testid="tweetText"]`, and the `time` element inside the permalink anchor. If posts stop appearing after an x.com update, check these selectors first.
- **Retweets are filtered out.** `content.js` drops any article whose canonical URL author differs from the profile being viewed. If you want retweets back, relax the check in `extractPost`.
- **Refresh captures "top of feed" only.** The shuttle tab dwells on each profile for ~3.5s without scrolling, so only the initially-rendered tweets (usually 5-10) are captured per author. Enough for a "what's fresh" feed, not enough for deep history. Scrolling the tab programmatically would improve yield but looks more bot-like.
- **Truncation expansion is best-effort.** Clicking `tweet-text-show-more-link` works for most long tweets. Some extra-long ("long post" / premium) tweets don't expand inline — they navigate to the status detail page instead. For those, the stored copy stays truncated. Detecting and handling navigation-style Show more would require opening the `/status/{id}` page separately, which isn't worth the complexity for the handful of posts affected.
- **Video is poster-only.** Videos and animated GIFs are captured as poster-image + link back to the tweet. We don't attempt to play HLS/DASH streams in the dashboard because x.com's player does content-signing that makes embedding outside their page unreliable. User clicks the card, video plays on x.com.
- **Media may arrive in two waves.** First scan: tweet with `media: []` because images hadn't finished lazy-loading. Later scan: `media: [{photo}, {photo}]`. The background's "richer = replace" rule handles this — see `handleSave` in `background.js`.
- **Service worker can die mid-refresh.** MV3 workers are non-persistent. A long refresh may be killed by Chrome; the `refreshInFlight` lock resets on worker restart. The leftover pinned tab would then orphan — the cleanup in the `finally` block won't run. Low-probability during a 90s refresh but possible.
- **Storage is unbounded.** `chrome.storage.local` has a 10MB default quota; this will eventually matter. No pruning logic yet.
- **Not logged in = no tweets.** Refresh runs real browser navigations; if the user is logged out, x.com shows a login wall and the scraper sees nothing. Refreshes silently "succeed" with zero new posts. No graceful detection yet.
