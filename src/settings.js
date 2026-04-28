// Settings store. Backed by chrome.storage.sync so user preferences follow
// them across signed-in Chromes, alongside their curated authors list.
//
// Schema:
//   maxAgeDays  - number | null
//                 Posts older than this many days are hidden from the
//                 dashboard. null means "no time limit, show everything."
//                 Default: 30 days. The post itself stays in storage; only
//                 display is affected, so widening the window later
//                 brings older posts back into view.
//
// Quota note: chrome.storage.sync caps at 100KB total, 8KB per item, ~1.8K
// writes/hour. This object is small (a few bytes) and writes happen only
// on explicit user interaction in the options page.

const STORAGE_KEY = "xradar_settings";

const DEFAULTS = {
  maxAgeDays: 30,
};

export const SETTINGS_STORAGE_KEY = STORAGE_KEY;

// Returns the user's settings merged over defaults. New defaults added in
// future versions automatically apply to existing users without migration —
// they just see a new key with the default value.
export async function getSettings() {
  const { [STORAGE_KEY]: stored } = await chrome.storage.sync.get(STORAGE_KEY);
  return { ...DEFAULTS, ...(stored || {}) };
}

// Merge-save. Pass only the fields you want to change.
export async function saveSettings(partial) {
  if (!partial || typeof partial !== "object") return;
  const current = await getSettings();
  const next = { ...current, ...partial };
  await chrome.storage.sync.set({ [STORAGE_KEY]: next });
}

// Wipe all customizations. Removing the key (rather than writing DEFAULTS)
// means future default changes auto-flow to users who have reset.
export async function resetSettings() {
  await chrome.storage.sync.remove(STORAGE_KEY);
}

// The valid options for the time-window dropdown. Kept here so options.js
// and dashboard.js render consistent labels without duplicating constants.
// `value` is the JSON-stored maxAgeDays; `label` is the UI string.
export const TIME_WINDOW_OPTIONS = [
  { value: 7,   label: "Last 7 days" },
  { value: 30,  label: "Last 30 days" },
  { value: 90,  label: "Last 90 days" },
  { value: 180, label: "Last 6 months" },
  { value: 365, label: "Last year" },
  { value: null, label: "All time" },
];

// Convenience formatter used by the dashboard meta line. Returns null when
// the user has chosen "All time" so the caller can omit the segment.
export function formatTimeWindowLabel(maxAgeDays) {
  if (maxAgeDays == null) return null;
  const opt = TIME_WINDOW_OPTIONS.find((o) => o.value === maxAgeDays);
  if (opt) return opt.label.toLowerCase();
  return `last ${maxAgeDays} days`;
}
