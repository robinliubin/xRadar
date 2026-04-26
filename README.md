# xRadar

A Chrome extension that gives you a unified, glanceable feed of recent X (Twitter) posts from a curated list of accounts you choose — no servers, no API keys, no data leaves your browser.

> Built for a specific itch: "I follow ~30 AI researchers and tool builders on X. Their posts are scattered across an algorithmic feed I have to fight. I want one page where I can see what those people said this week, in chronological order, and nothing else."

## Features

- **One-click refresh** of every curated profile (~60-90s for 30 authors)
- **Multi-column dashboard** that fills your viewport — see 4-5 columns of recent posts at a glance on a wide display
- **Photos + video posters inline**, with click-through to the original tweet on x.com
- **Truncated tweets auto-expand** by clicking "Show more" so you see the full post
- **Settings page** for managing your curated list (add / remove / categorize)
- **Filter tabs** for "Researchers" vs "Tool builders" (or whatever categories you define)
- **Syncs your curated list** across signed-in Chromes via `chrome.storage.sync`
- **Zero servers, zero analytics**, zero telemetry — see [docs/privacy.md](docs/privacy.md)

## Install

### From the Chrome Web Store *(coming soon)*

Once published, install from the Chrome Web Store and you're done.

### Load unpacked (developer mode)

1. Clone this repo: `git clone https://github.com/robinliubin/xRadar.git`
2. Open `chrome://extensions` in Chrome
3. Enable **Developer mode** (toggle, top right)
4. Click **Load unpacked** and select the cloned `xRadar` folder
5. Make sure you're logged into x.com in the same Chrome profile
6. Click the xRadar toolbar icon — the dashboard opens with an empty state and a "Refresh all" button. Click it.

## How it works

xRadar is a Manifest V3 Chrome extension with three parts:

```
content script (runs on x.com tabs you visit)
        │ scrapes tweet DOM, sends batches via runtime messaging
        ▼
service worker (background)
        │ filters against your curated list, stores in chrome.storage.local
        ▼
dashboard.html (what you see)
        │ reads from storage, renders in a CSS multi-column grid
```

The "Refresh all" feature opens *one* pinned, inactive background tab and cycles it through every curated profile URL with `chrome.tabs.update`, dwelling ~3.5 seconds on each so the content script can scrape the initial render. No HTTP API calls — just a real browser visiting real pages, the same way you would.

For full architecture details see [CLAUDE.md](CLAUDE.md).

## Permissions explained

| Permission | What we use it for |
|---|---|
| `storage` | Save tweets locally; sync your curated handle list across signed-in Chromes. |
| `tabs` | Open the dashboard in a new tab; open a pinned background tab during "Refresh all". |
| `*://x.com/*` and `*://twitter.com/*` | Run the content script on x.com profile pages so we can read tweet text from the rendered DOM. |

xRadar requests no other permissions, no broad host access, and no API tokens.

## ⚠️ Account-risk disclaimer

xRadar uses **your logged-in X session** in the browser to read tweet content from x.com profile pages. X's Terms of Service prohibit automated scraping; xRadar mitigates this by:

- Only running on explicit user click (no automated polling or scheduled refreshes)
- Spacing requests with 600-1200ms jitter between profiles
- Cycling a single tab rather than opening many in parallel

That said: **automation detection on x.com is not zero**, and the risk lands on your X account, not on us. Consider this when deciding whether to install. If you have a sensitive or high-value X account, this extension is probably not the right fit.

## Privacy

Everything stays on your device. No server, no analytics, no telemetry. Full details in [docs/privacy.md](docs/privacy.md).

## Building a release zip

For Chrome Web Store submission:

```bash
zip -r xradar-1.0.0.zip manifest.json icons/ src/ -x "*.DS_Store"
```

That zip is what gets uploaded to the Web Store developer console. The repo's `.git/`, `docs/`, `CLAUDE.md`, `README.md`, and `LICENSE` are deliberately left out — they're not needed inside the extension package.

## Development

There is no build step. Plain ES2022, no TypeScript, no bundler.

```
xRadar/
├── manifest.json     # MV3 manifest
├── icons/            # 16/32/48/128 px PNGs
├── src/
│   ├── authors.js    # Authors store (chrome.storage.sync) + factory defaults
│   ├── background.js # Service worker (REFRESH_ALL handler, SAVE_POSTS dedupe)
│   ├── content.js    # x.com DOM scraper (isolated world)
│   ├── dashboard.*   # Feed viewer
│   └── options.*     # Settings page (add/remove/edit authors)
├── docs/privacy.md   # Privacy policy (hosted on GitHub Pages)
├── CLAUDE.md         # Architecture docs for future contributors
└── README.md         # This file
```

After editing any file, reload the extension at `chrome://extensions` (click the circular refresh icon on the xRadar card). Edits to `content.js` also need a refresh of any open x.com tabs.

## License

MIT — see [LICENSE](LICENSE).

## Contributing

Issues and PRs welcome at [github.com/robinliubin/xRadar](https://github.com/robinliubin/xRadar). The most likely thing to break is x.com's DOM selectors after a UI refresh — those live in [`src/content.js`](src/content.js).
