import {
  getAuthors,
  saveAuthors,
  resetAuthors,
  normalizeHandle,
  DEFAULT_AUTHORS,
} from "./authors.js";
import {
  getSettings,
  saveSettings,
  TIME_WINDOW_OPTIONS,
} from "./settings.js";

const CATEGORY_LABELS = {
  researcher: "Researcher",
  builder: "Tool builder",
};

let authors = [];

async function init() {
  authors = await getAuthors();
  const settings = await getSettings();
  populateTimeWindow(settings.maxAgeDays);
  render();
  wireForm();
  wireReset();
  wireTimeWindow();
}

function populateTimeWindow(currentMaxAgeDays) {
  const select = document.getElementById("time-window");
  // Clear in case re-init re-runs.
  while (select.firstChild) select.removeChild(select.firstChild);
  for (const opt of TIME_WINDOW_OPTIONS) {
    const o = document.createElement("option");
    // <select>.value is always a string; we use the empty string as the
    // sentinel for `null` (= All time) and convert back on save.
    o.value = opt.value === null ? "" : String(opt.value);
    o.textContent = opt.label;
    if (opt.value === currentMaxAgeDays) o.selected = true;
    select.appendChild(o);
  }
}

function wireTimeWindow() {
  const select = document.getElementById("time-window");
  select.addEventListener("change", async () => {
    const v = select.value;
    const maxAgeDays = v === "" ? null : parseInt(v, 10);
    await saveSettings({ maxAgeDays });
    // No render() needed — the dashboard listens to storage.onChanged for
    // settings and re-renders itself; the options page only shows the
    // current selection, which the user just set, so it's already correct.
  });
}

function render() {
  document.getElementById("count").textContent =
    authors.length === 0 ? "(empty)" : `(${authors.length})`;

  const list = document.getElementById("authors");
  while (list.firstChild) list.removeChild(list.firstChild);

  if (authors.length === 0) {
    const empty = document.createElement("li");
    empty.className = "empty-row";
    empty.textContent = "No authors yet. Add one above or click \"Reset to defaults\".";
    list.appendChild(empty);
    return;
  }

  // Sort: researchers first then builders, each group alphabetical by name.
  // Stable order makes the list predictable across edits.
  const sorted = [...authors].sort((a, b) => {
    if (a.category !== b.category) {
      // researcher < builder alphabetically — handy coincidence.
      return a.category.localeCompare(b.category);
    }
    return a.name.localeCompare(b.name);
  });

  for (const author of sorted) {
    list.appendChild(buildRow(author));
  }
}

function buildRow(author) {
  const row = document.createElement("li");
  row.className = "row";

  const main = document.createElement("div");
  main.className = "row-main";

  const name = document.createElement("div");
  name.className = "row-name";
  name.textContent = author.name;

  const handle = document.createElement("a");
  handle.className = "row-handle";
  handle.href = `https://x.com/${author.handle}`;
  handle.target = "_blank";
  handle.rel = "noopener noreferrer";
  handle.textContent = `@${author.handle}`;

  main.append(name, handle);

  const select = document.createElement("select");
  select.className = `row-category cat-${author.category}`;
  for (const [value, label] of Object.entries(CATEGORY_LABELS)) {
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = label;
    if (value === author.category) opt.selected = true;
    select.appendChild(opt);
  }
  select.addEventListener("change", () => onCategoryChange(author.handle, select.value));

  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "row-remove";
  remove.title = `Remove @${author.handle}`;
  remove.textContent = "Remove";
  remove.addEventListener("click", () => onRemove(author.handle));

  row.append(main, select, remove);
  return row;
}

function wireForm() {
  const form = document.getElementById("add-form");
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    onAdd();
  });
}

function wireReset() {
  document.getElementById("reset").addEventListener("click", async () => {
    // Confirm to avoid accidental loss of customizations. The native
    // confirm dialog is fine here — this is a settings page, not a hot path.
    const ok = confirm(
      `Reset to the ${DEFAULT_AUTHORS.length} curated default authors? ` +
      "Your current customizations will be lost (collected posts are NOT deleted)."
    );
    if (!ok) return;
    await resetAuthors();
    authors = await getAuthors();
    render();
  });
}

async function onAdd() {
  const errEl = document.getElementById("form-error");
  errEl.hidden = true;
  errEl.textContent = "";

  const rawHandle = document.getElementById("add-handle").value;
  const rawName = document.getElementById("add-name").value;
  const category = document.getElementById("add-category").value;

  const handle = normalizeHandle(rawHandle);
  if (!handle) {
    showError(errEl, "Handle must be 1-15 characters, letters / digits / underscore only.");
    return;
  }
  const name = rawName.trim();
  if (!name) {
    showError(errEl, "Display name is required.");
    return;
  }
  if (authors.some((a) => a.handle.toLowerCase() === handle)) {
    showError(errEl, `@${handle} is already in your list.`);
    return;
  }

  authors = [...authors, { handle, name, category }];
  await saveAuthors(authors);

  // Clear the form for the next add.
  document.getElementById("add-handle").value = "";
  document.getElementById("add-name").value = "";
  document.getElementById("add-handle").focus();

  render();
}

async function onRemove(handle) {
  authors = authors.filter((a) => a.handle.toLowerCase() !== handle.toLowerCase());
  await saveAuthors(authors);
  render();
}

async function onCategoryChange(handle, newCategory) {
  authors = authors.map((a) =>
    a.handle.toLowerCase() === handle.toLowerCase()
      ? { ...a, category: newCategory }
      : a
  );
  await saveAuthors(authors);
  render();
}

function showError(el, msg) {
  el.textContent = msg;
  el.hidden = false;
}

init();
