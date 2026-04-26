// Authors store. Source of truth for which X handles xRadar tracks.
//
// This module exposes an async API backed by chrome.storage.sync — that
// way a user's curated list follows them across signed-in Chromes. On a
// fresh install (sync storage empty) we seed from DEFAULT_AUTHORS below.
//
// Quota awareness: chrome.storage.sync caps at 100KB total, 8KB per item,
// and ~1.8K writes/hour. The current default list is ~2.3KB; the options
// page should debounce edits before calling saveAuthors() to stay well
// under the per-hour rate.
//
// Field semantics:
//   handle   - X handle WITHOUT the leading @, lowercase. Must match the
//              URL on x.com/{handle}. Primary key.
//   name     - Display name. Cosmetic only.
//   category - "researcher" | "builder". Drives the dashboard filter
//              tabs. New categories also need matching pills in
//              dashboard.html / dashboard.js / dashboard.css.

const STORAGE_KEY = "xradar_authors";

// Curated April 2026 from public "top AI influencers on X" lists with
// each handle verified against a live x.com profile URL. This list ships
// as factory defaults for first-install users.
export const DEFAULT_AUTHORS = [
  // ─── Researchers ───────────────────────────────────────────────────
  { handle: "karpathy",        name: "Andrej Karpathy",   category: "researcher" },
  { handle: "ylecun",          name: "Yann LeCun",        category: "researcher" },
  { handle: "geoffreyhinton",  name: "Geoffrey Hinton",   category: "researcher" },
  { handle: "drfeifei",        name: "Fei-Fei Li",        category: "researcher" },
  { handle: "andrewyng",       name: "Andrew Ng",         category: "researcher" },
  { handle: "drjimfan",        name: "Jim Fan",           category: "researcher" },
  { handle: "jeffdean",        name: "Jeff Dean",         category: "researcher" },
  { handle: "ilyasut",         name: "Ilya Sutskever",    category: "researcher" },
  { handle: "demishassabis",   name: "Demis Hassabis",    category: "researcher" },
  { handle: "polynoamial",     name: "Noam Brown",        category: "researcher" },
  { handle: "lilianweng",      name: "Lilian Weng",       category: "researcher" },
  { handle: "tri_dao",         name: "Tri Dao",           category: "researcher" },
  { handle: "rasbt",           name: "Sebastian Raschka", category: "researcher" },
  { handle: "lexfridman",      name: "Lex Fridman",       category: "researcher" },

  // ─── Tool builders ─────────────────────────────────────────────────
  { handle: "bcherny",         name: "Boris Cherny",      category: "builder" },
  { handle: "sama",            name: "Sam Altman",        category: "builder" },
  { handle: "gdb",             name: "Greg Brockman",     category: "builder" },
  { handle: "darioamodei",     name: "Dario Amodei",      category: "builder" },
  { handle: "simonw",          name: "Simon Willison",    category: "builder" },
  { handle: "swyx",            name: "Shawn Wang (swyx)", category: "builder" },
  { handle: "hwchase17",       name: "Harrison Chase",    category: "builder" },
  { handle: "amanrsanger",     name: "Aman Sanger",       category: "builder" },
  { handle: "aravsrinivas",    name: "Aravind Srinivas",  category: "builder" },
  { handle: "officiallogank",  name: "Logan Kilpatrick",  category: "builder" },
  { handle: "jerryjliu0",      name: "Jerry Liu",         category: "builder" },
  { handle: "clementdelangue", name: "Clement Delangue",  category: "builder" },
  { handle: "rauchg",          name: "Guillermo Rauch",   category: "builder" },
  { handle: "natfriedman",     name: "Nat Friedman",      category: "builder" },
  { handle: "steipete",        name: "Peter Steinberger", category: "builder" },
];

export const AUTHORS_STORAGE_KEY = STORAGE_KEY;

// Read the user's curated list, or the factory defaults if they've never
// edited it. Returns a fresh array so callers can mutate without polluting
// shared state.
export async function getAuthors() {
  const { [STORAGE_KEY]: stored } = await chrome.storage.sync.get(STORAGE_KEY);
  if (Array.isArray(stored) && stored.length > 0) {
    return stored.map((a) => ({ ...a }));
  }
  return DEFAULT_AUTHORS.map((a) => ({ ...a }));
}

// Persist the user's edited list. Caller is expected to validate first
// (no duplicate handles, valid handle format, etc.) — see options.js.
export async function saveAuthors(authors) {
  if (!Array.isArray(authors)) throw new Error("authors must be an array");
  await chrome.storage.sync.set({ [STORAGE_KEY]: authors });
}

// Wipe the user's customizations and revert to the curated defaults.
// We remove the key entirely (rather than writing DEFAULT_AUTHORS to it)
// so future updates to DEFAULT_AUTHORS automatically flow through to
// users who haven't customized.
export async function resetAuthors() {
  await chrome.storage.sync.remove(STORAGE_KEY);
}

// Lookup-friendly Map keyed by lowercase handle. Build once per consumer
// and reuse — don't call this in a hot loop.
export function makeAuthorMap(authors) {
  return new Map(authors.map((a) => [a.handle.toLowerCase(), a]));
}

// Handle validation. X's rule: 1-15 chars, alphanumeric or underscore.
// We additionally lowercase to match our case-insensitive lookup invariant.
export function normalizeHandle(input) {
  if (typeof input !== "string") return null;
  const cleaned = input.trim().replace(/^@+/, "").toLowerCase();
  if (!/^[a-z0-9_]{1,15}$/.test(cleaned)) return null;
  return cleaned;
}
