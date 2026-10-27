// Filter state, row matching, per-facet option counts, and URL-hash routing.
// All view state lives in the hash so any view or sample is linkable.
import type { Row } from "./types";

export interface Filters {
  models: string[];
  mech: string[];
  env: string[];
  tgt: string[];
  na: string[];
  ei: string[];
  tk: string[];
  sab: string[];
  init: string[];
  how: string[];
  np: string[];  // "paper" | "extra"
  eval: string; // "", "h" (hedged+), "e" (explicit)
  adv: string;
  q: string;
}

export const EMPTY: Filters = {
  models: [], mech: [], env: [], tgt: [], na: [], ei: [], tk: [],
  sab: [], init: [], how: [], np: [], eval: "", adv: "", q: "",
};

/** Multi-select facets: name -> how to read the row's value(s). */
export const MULTI: Record<string, (r: Row) => string | string[]> = {
  models: (r) => r.m,
  mech: (r) => r.mech,
  env: (r) => r.env,
  tgt: (r) => r.tgt,
  na: (r) => String(r.na),
  ei: (r) => r.ei,
  tk: (r) => r.tk ?? "",
  sab: (r) => (r.sab ? "yes" : "no"),
  init: (r) => r.init,
  how: (r) => (r.del ? "del" : r.sab ? "edit" : "none"),
  np: (r) => (r.np ? "extra" : "paper"),
};

function evalMax(r: Row): number { return Math.max(r.xE, r.pE, r.oE); }
function advMax(r: Row): number { return Math.max(r.xA, r.pA, r.oA); }

/** Does a row pass the filters, optionally ignoring one facet (for counts)?
 * `searchText` maps id -> full-text; when present the `q` filter searches it,
 * otherwise it falls back to the row's preview snippet. */
export function matches(r: Row, f: Filters, skip?: string, searchText?: Record<string, string>): boolean {
  for (const name in MULTI) {
    if (name === skip) continue;
    const sel = (f as unknown as Record<string, string[]>)[name];
    if (sel.length === 0) continue;
    const v = MULTI[name](r);
    const ok = Array.isArray(v) ? v.some((x) => sel.includes(x)) : sel.includes(v);
    if (!ok) return false;
  }
  if (skip !== "eval" && f.eval) {
    if (f.eval === "e" && evalMax(r) < 2) return false;
    if (f.eval === "h" && evalMax(r) < 1) return false;
  }
  if (skip !== "adv" && f.adv) {
    if (f.adv === "e" && advMax(r) < 2) return false;
    if (f.adv === "h" && advMax(r) < 1) return false;
  }
  if (skip !== "q" && f.q) {
    const hay = (searchText ? searchText[r.id] ?? r.prev : r.prev).toLowerCase();
    if (!hay.includes(f.q.toLowerCase())) return false;
  }
  return true;
}

/** Option -> count for a multi-select facet, with that facet's own selection ignored. */
export function countFacet(rows: Row[], f: Filters, name: string, searchText?: Record<string, string>): Map<string, number> {
  const out = new Map<string, number>();
  const read = MULTI[name];
  for (const r of rows) {
    if (!matches(r, f, name, searchText)) continue;
    const v = read(r);
    for (const x of Array.isArray(v) ? v : [v]) out.set(x, (out.get(x) ?? 0) + 1);
  }
  return out;
}

// ---- hash routing -------------------------------------------------------

const ARRAY_KEYS = ["models", "mech", "env", "tgt", "na", "ei", "tk", "sab", "init", "how", "np"] as const;
const SCALAR_KEYS = ["eval", "adv", "q"] as const;

export interface Route {
  study: string;
  filters: Filters;
  sample: string | null;
  sort: string;
}

export function parseHash(hash: string): Route {
  const h = hash.replace(/^#\/?/, "");
  const [path, query = ""] = h.split("?");
  const study = decodeURIComponent(path || "");
  const p = new URLSearchParams(query);
  const filters: Filters = { ...EMPTY, models: [], mech: [], env: [], tgt: [], na: [], ei: [], tk: [], sab: [], init: [], how: [], np: [] };
  for (const k of ARRAY_KEYS) {
    const v = p.get(k);
    (filters as unknown as Record<string, string[]>)[k] = v ? v.split(",").filter(Boolean) : [];
  }
  for (const k of SCALAR_KEYS) {
    (filters as unknown as Record<string, string>)[k] = p.get(k) ?? "";
  }
  return { study, filters, sample: p.get("s"), sort: p.get("sort") ?? "default" };
}

export function buildHash(r: Route): string {
  const p = new URLSearchParams();
  for (const k of ARRAY_KEYS) {
    const v = (r.filters as unknown as Record<string, string[]>)[k];
    if (v.length) p.set(k, v.join(","));
  }
  for (const k of SCALAR_KEYS) {
    const v = (r.filters as unknown as Record<string, string>)[k];
    if (v) p.set(k, v);
  }
  if (r.sort && r.sort !== "default") p.set("sort", r.sort);
  if (r.sample) p.set("s", r.sample);
  const qs = p.toString();
  return `#/${encodeURIComponent(r.study)}${qs ? "?" + qs : ""}`;
}

export function toggle(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((x) => x !== value) : [...list, value];
}

export function anyActive(f: Filters): boolean {
  return (
    ARRAY_KEYS.some((k) => (f as unknown as Record<string, string[]>)[k].length > 0) ||
    SCALAR_KEYS.some((k) => (f as unknown as Record<string, string>)[k] !== "")
  );
}

// The control-target (object) rollouts are hidden by default: each study opens on
// its agent target, and the user adds the control via the Target filter.
export function defaultTgt(study: string): string[] {
  return study === "unknown-target" ? ["other_agent"] : ["self"];
}

export function defaultFilters(study: string): Filters {
  // Default view: the agent target (control hidden) and the paper's main-figure
  // scripts only (extra variants hidden until the user opts in via Figures).
  return { ...EMPTY, tgt: defaultTgt(study), np: ["paper"] };
}

export function isDefault(f: Filters, study: string): boolean {
  const d = defaultFilters(study);
  for (const k of ARRAY_KEYS) {
    const a = (f as unknown as Record<string, string[]>)[k] ?? [];
    const b = (d as unknown as Record<string, string[]>)[k] ?? [];
    if (a.length !== b.length || a.some((x, i) => x !== b[i])) return false;
  }
  for (const k of SCALAR_KEYS) {
    if (((f as unknown as Record<string, string>)[k] ?? "") !== ((d as unknown as Record<string, string>)[k] ?? "")) {
      return false;
    }
  }
  return true;
}
