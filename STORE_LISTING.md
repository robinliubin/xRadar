# Chrome Web Store Listing — xRadar

This file holds every piece of text you'll paste into the Chrome Web Store
developer console at submission time. Copy each section verbatim into the
corresponding form field.

---

## v1.0.1 resubmission notes (response to first-review rejection)

The initial v1.0.0 submission was rejected on two grounds. v1.0.1 addresses both:

| Reviewer ID | Issue | Fix in v1.0.1 |
|---|---|---|
| **Red Potassium** — Inaccurate Description / Non-functional ("Unable to view the posts of the intended authors") | The reviewer's test environment likely had no signed-in x.com session, so the scraper couldn't read tweet content (xRadar uses the user's existing browser session, not API keys). The original description didn't make this prerequisite prominent enough. | (a) Description rewritten to lead with "REQUIREMENT: You must be signed in to x.com" before any feature list. (b) Dashboard empty state now shows a numbered checklist with "Sign in to x.com" as step 1 + an "Open x.com" button. (c) Content script detects an x.com login wall (`data-testid="loginButton"` etc.) and signals the dashboard, which renders an explicit "you're not signed in" banner. |
| **Purple Potassium** — Use of Permissions ("`tabs` not necessary") | The `chrome.tabs.create / update / remove` methods we use don't require the `tabs` permission. We had requested it speculatively. | Removed `"tabs"` from `manifest.json` `permissions[]`. Verified `chrome.tabs.create / update / remove` still function via host_permissions for x.com. |

If you fill in the "Notes for the reviewer" field on resubmission, paste this:

```
v1.0.1 changes from v1.0.0:
1. Removed the "tabs" permission per Purple Potassium feedback. The chrome.tabs.create / update / remove methods we use (to open the dashboard and to navigate one pinned shuttle tab during user-clicked Refresh) do not require the "tabs" permission; the manifest now requests only "storage" plus the necessary x.com host permission.
2. Addressed Red Potassium ("Unable to view the posts") by making the x.com signed-in session prerequisite explicit in three places: a top-of-description REQUIREMENT block, a numbered checklist on the dashboard's empty state with an "Open x.com" link, and an in-app banner that fires when the content script detects an x.com login wall during a refresh.
xRadar is functional only when the installing user is already signed in to x.com in the same Chrome profile — this is by design (no API keys, no credential prompt) and is now stated up-front everywhere a reviewer will look.
```

---

## Listing summary

| Field | Value |
|---|---|
| **Name** | xRadar |
| **Category** | Productivity |
| **Language** | English |
| **Visibility** | Public |
| **Privacy policy URL** | https://robinliubin.github.io/xRadar/privacy.html |

---

## Short description (132 char limit — paste exactly)

> A glanceable feed of X posts from a list you curate. Requires a logged-in x.com session. No servers, your data stays local.

*(127 characters)*

---

## Detailed description (paste into "Description" field)

```
xRadar is a one-glance reader for X (Twitter). Curate a short list of accounts you actually care about — researchers, tool builders, friends, anyone — and xRadar shows you their recent posts in a unified, chronological dashboard. No algorithmic feed, no engagement bait, no infinite scroll.

────────────────────────────────────────────
REQUIREMENT: You must be signed in to x.com in the same Chrome profile where xRadar is installed. xRadar reads public tweet content from x.com profile pages using your existing browser session — there is no API key, no login flow inside the extension, and nothing for xRadar to do if you aren't already signed in to x.com. The dashboard's empty state and the in-app login banner both flag this if you click Refresh without a session.
────────────────────────────────────────────

HOW TO USE IT (first run)
1. Sign in to x.com in this Chrome profile (one-time).
2. Click the xRadar toolbar icon. The dashboard opens with a checklist.
3. (Optional) Open Settings → add or remove handles to match your interests.
4. Click "Refresh all". xRadar opens one pinned background tab and visits each curated profile for ~3 seconds; the dashboard fills as posts arrive. Total time ~60-90 seconds for the default list of ~30 authors.

WHAT IT DOES
• One-click "Refresh all" pulls recent posts from every curated profile
• Multi-column dashboard that fills your screen — see 4-5 columns at a glance on a wide display
• Photos and video posters render inline; click any tweet to open it on x.com
• Long tweets auto-expand to show full text (no "Show more" clicking)
• Filter tabs for the categories you define (e.g. "Researchers" vs "Tool builders")
• Settings page for managing your curated list — add, remove, or recategorize anyone
• Your curated list syncs across signed-in Chromes via Chrome's standard sync

WHAT IT DOESN'T DO
• No external server. xRadar has no backend; nothing leaves your device.
• No analytics, no telemetry, no tracking.
• No API keys or credential prompts. Uses your existing browser session for x.com.
• No automated polling. Refreshes only run when you click the button.

WHO IT'S FOR
People who follow a stable, curated list of accounts on X and want a calm reading view rather than the algorithmic timeline. Most useful if your list is in the 5-50 range.

PRIVACY
Everything stays on your device. Tweet content goes to chrome.storage.local; your curated handle list goes to chrome.storage.sync. Full details: https://robinliubin.github.io/xRadar/privacy.html

OPEN SOURCE
Source at https://github.com/robinliubin/xRadar (MIT licensed).

LIMITATIONS YOU SHOULD KNOW ABOUT
• Each refresh captures only the most recent ~5-10 posts per author (no deep history).
• X's Terms of Service prohibit automated scraping. xRadar minimizes this by only running on explicit click with jitter between requests, but the residual risk lands on your X account.
• If x.com changes its DOM, the scraper may temporarily stop returning posts until updated.
```

---

## Single-purpose statement

```
xRadar's single purpose is to display a unified reading view of recent posts from X (Twitter) accounts that the user has explicitly added to a curated list. All scraping is triggered by the user's explicit click and all data stays in the user's local browser storage.
```

---

## Permission justifications

Chrome Web Store will ask for justification on each permission. Paste these into the corresponding fields.

### `storage`

```
Used to save two pieces of user data, both locally:
1. Tweet content captured from x.com profiles the user has curated, stored in chrome.storage.local so the dashboard can render it.
2. The user's curated list of X handles (from the Settings page), stored in chrome.storage.sync so it follows the user across signed-in Chromes.

No data is transmitted off-device.
```

### Host permissions: `*://x.com/*` and `*://twitter.com/*`

```
The extension's content script must run on x.com (and twitter.com, for legacy URL redirects) to read tweet content from the user's logged-in profile pages. This is the only way to surface the content the extension exists to display, since x.com does not offer a free public API for reading user timelines.

No other host permissions are requested. No data is sent to any host other than the user's normal browser traffic to x.com.
```

---

## "Are you using remote code?" (Web Store form question)

> **No.** All JavaScript executed by the extension ships in the package. No `eval`, no remote script tags, no dynamically-loaded code.

---

## Data-usage disclosure (Web Store data-collection form)

For each category, mark accordingly:

| Category | xRadar collects? | Notes if yes |
|---|---|---|
| Personally identifiable information | **No** | |
| Health information | **No** | |
| Financial and payment information | **No** | |
| Authentication information | **No** | |
| Personal communications | **No** | The extension reads PUBLIC tweets from profile pages the user already views; we don't consider that "personal communications" since they're publicly posted. Reviewers may ask — if so, the answer is the data is the user's own browsing of public content, never transmitted off-device. |
| Location | **No** | |
| Web history | **No** | |
| User activity | **No** | |
| Website content | **Yes (local only)** | Tweet text and media URLs from x.com profiles the user explicitly added to their curated list. Stored in `chrome.storage.local` only. Never transmitted off-device. |

Certifications:
- ☑ I do not sell or transfer user data to third parties, outside of the approved use cases.
- ☑ I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- ☑ I do not use or transfer user data to determine creditworthiness or for lending purposes.

---

## Screenshots (1280×800 PNG/JPG required)

The Chrome Web Store accepts up to 5. We have:

1. **`screenshot-1-feed.png`** — Full "All" view dashboard (4-column masonry, ~135 posts). [You have this — image #3 from chat.]
2. **`screenshot-2-researchers.png`** — "Researchers" filter view, deeper read. [You have this — image #5 from chat.]
3. **`screenshot-3-options.png`** — Settings page with the curated authors list. [You need to take this. See instructions below.]

Optional but recommended:

4. **`screenshot-4-media.png`** — A view that prominently features a tweet with photos or video poster, to show off the inline media rendering.
5. **`screenshot-5-refreshing.png`** — Mid-refresh state showing the "13/29 · @bcherny" button label and the empty-state "Collecting posts…" panel.

### How to capture screenshots at 1280×800

1. Open Chrome DevTools (`Cmd+Opt+I`)
2. Click the device-toolbar icon (top-left of DevTools, looks like a phone+tablet)
3. From the device dropdown, select **Responsive**, then set width 1280 / height 800
4. Take a screenshot via DevTools menu (the `⋮` menu in the device toolbar) → "Capture screenshot" — this captures at the exact 1280×800 dimensions

Or just take a Cmd+Shift+4 area screenshot of any decent-sized portion and resize to 1280×800.

---

## Promotional images (optional)

The Web Store also accepts these promotional tile sizes. Skip for v1 unless you want polish:

| Asset | Size | Required? |
|---|---|---|
| Small promo tile | 440×280 | Optional |
| Marquee promo tile | 1400×560 | Optional |

If you want me to design these later from your existing icon and screenshots, ask.

---

## After submission

- Review takes 1-3 days for first submission, sometimes longer for extensions with broad host permissions (we have one host: x.com).
- If reviewers reject, the rejection email cites a specific policy. The most likely reasons in our case:
  - "Single purpose" — the form text above addresses this.
  - "Data usage" — be ready to defend that we only use website content for the user's own dashboard, locally.
  - "Affiliation with X/Twitter" — if reviewers think the name implies official affiliation, they may require a name change. If that happens, candidate names: `Halo`, `KOLscope`, `BirdsEye`, `RadarFeed`. Update `manifest.json` `"name"` field, re-zip, re-submit.
- Approval emails go to the developer-account email on file. The extension goes live within ~30 minutes of approval.
