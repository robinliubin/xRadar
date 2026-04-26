---
title: xRadar — Privacy Policy
---

# xRadar — Privacy Policy

**Effective date:** April 26, 2026
**Last updated:** April 26, 2026

xRadar is a Chrome extension that displays a curated, glanceable feed of recent X (Twitter) posts from a list of accounts you choose. This page explains what data the extension handles, where it lives, and what it does — and does not — do with it.

## Short version

- **Everything stays on your device.** xRadar does not have a server. We do not run an API. We do not collect, transmit, or share your data with anyone.
- **No analytics, no telemetry, no tracking** of any kind.
- **You are in control.** Uninstalling the extension or clearing its data removes everything.

## What data xRadar handles

When you click "Refresh all" or visit a curated profile on x.com directly, xRadar reads the publicly-visible tweet content from the x.com pages your browser already loads. Specifically, it captures:

- The tweet text
- The tweet timestamp and a link back to the tweet on x.com
- Photo URLs and video poster-image URLs that x.com served with the tweet
- The author's handle (matched against your curated list)

This data is written to your browser's local extension storage (`chrome.storage.local`) so you can read it in the dashboard later.

In addition, xRadar stores **your curated list of X handles + display names + categories** in `chrome.storage.sync`. This is the "Settings" page content. It syncs across Chromes you're signed into with the same Google account, via Google's standard Chrome sync mechanism — xRadar itself never sees this data leave your device.

## What data xRadar does NOT handle

- **No login credentials.** xRadar does not ask for, store, or read your X password, session cookies, or any authentication tokens.
- **No personal information beyond tweet content.** No browsing history, no clipboard, no location, no contacts.
- **No analytics or telemetry.** We do not log usage, page views, button clicks, error reports, or anything else for our own use.
- **No advertising data.** We do not show ads; we do not collect data for ad targeting.

## Where data is stored

| Data | Storage location | Visibility |
|---|---|---|
| Captured tweet text + media URLs | `chrome.storage.local` (this device only) | Only readable by xRadar on your device |
| Your curated list of X handles | `chrome.storage.sync` (synced across your Chromes) | Only readable by xRadar in your Google account |
| Last refresh timestamp | `chrome.storage.local` (this device only) | Only readable by xRadar on your device |

xRadar does **not** make network requests to any server we operate, because we do not operate any servers.

The extension does open x.com itself in browser tabs (so the content script can read the rendered DOM); that traffic is between you and X, exactly as if you typed the URL into your address bar. xRadar does not intercept, log, or modify that traffic.

## Permissions and why we ask for them

| Permission | Reason |
|---|---|
| `storage` | To save tweets and your curated list locally and across signed-in Chromes (no other code path can persist data without this). |
| `tabs` | To open the dashboard in a new tab when you click the toolbar icon, and to open one pinned background tab during "Refresh all" so x.com profiles can be loaded for scraping. |
| `*://x.com/*` and `*://twitter.com/*` (host permissions) | To run the content script that reads tweet text from x.com pages your browser has already loaded. xRadar requests no other host permissions. |

## How to delete your data

- **Just the captured tweets:** Open the dashboard, then DevTools → Console → `chrome.storage.local.clear()`.
- **Your curated handle list (revert to defaults):** Open the Settings page → "Reset to defaults".
- **Everything:** Uninstall the extension at `chrome://extensions`. Chrome automatically wipes both `chrome.storage.local` and the `chrome.storage.sync` shadow on uninstall.

## Children's privacy

xRadar is not directed at children under 13 and we do not knowingly collect any data from anyone — see "What data xRadar does NOT handle" above.

## Changes to this policy

If we change how the extension handles data, we will update this page and bump the "Last updated" date above. Material changes will also be noted in the extension's changelog on the Chrome Web Store.

## Contact

This is a small open-source project. Questions, concerns, or security reports: open an issue at [github.com/robinliubin/xRadar](https://github.com/robinliubin/xRadar/issues).
