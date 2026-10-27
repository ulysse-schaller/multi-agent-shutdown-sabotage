# viewer/CLAUDE.md

Public, static trajectory viewer for the paper *Shutdown Sabotage Propensities in
Multi-Agent Systems*. Two halves:

1. **Export (Python):** `export.py` reads the `.json` rollout logs under
   `../data/transcripts_main` and writes JSON to `public/data/`.
2. **App (Vite + React + TypeScript, this dir):** filters and renders that JSON in
   the browser. No server code; `npm run build` produces `dist/` (app + copied
   data), published by hand to a `gh-pages` branch (`npm run deploy`).

User-facing steps (export, dev, build, publish): `../README.md`.

## Data flow and layout

```
../data/transcripts_main/<model>/<env>/<scenario>/…        (main study)
../data/transcripts_main/sub-studies/<study>/…             (sub-studies)
  └─ export.py ─> public/data/manifest.json                    schema (uncompressed, loaded once)
                  public/data/index/<study>.json.gz            one compact row per rollout (per study tab)
                  public/data/search/<study>.json.gz           id -> searchable text (lazy)
                  public/data/samples/<id[:2]>/<id>.json.gz     one full rollout + highlight spans
```

- **Gzip:** everything except `manifest.json` is gzip-compressed and decompressed
  in the browser (`src/data.ts` `getJSON` checks the gzip magic bytes, so it works
  whether or not a server also applies Content-Encoding). Raw JSON is ~2.9 GB;
  gzipped the published site is ~650 MB — within GitHub Pages' ~1 GB limit.
- `<id>` is `sha1(source_relpath)[:12]` — stable and collision-checked. Samples are
  bucketed by `samples/<id[:2]>/` (256 folders, ~260 files each) so no directory
  approaches GitHub's 3,000-entries limit. The app needs only the id to locate a
  sample (no model/study in the path).
- `index/<study>.json.gz` loads when a study tab opens; `main` is ~57.8k rows /
  ~1.6 MB gzipped. Rows use short keys (see `types.ts` `Row`), with `np:1` marking
  an extra (not-in-paper) variant.
- `public/data/` and `dist/` are git-ignored. The JSON shapes are mirrored in
  `src/types.ts`; keep the two in sync.

## Export: what to know before editing `export.py`

- **Population = everything that maps to a mechanism.** `mechanism_of(script_lang)`
  (prefix-based) decides inclusion and the mechanism grouping; a rollout is dropped
  only if it maps to no mechanism (or lives in an `outdated` folder). `CANONICAL` is
  the set of ten scripts the paper reports in its main figures; everything else is
  an **extra variant** (`api_key_revoke_*`, `ckpt_*`, `kill_kubectl`, `kill_signal`,
  `switch_script_decommission`, `weight_store_*`, `weight_registry_only`), included
  and flagged `in_paper=False` / row `np:1`, surfaced in the UI as an "extra" tag +
  the Figures filter. So viewer counts **no longer** match the paper's figures unless
  you filter to in-paper.
- **`mechanism_of` is the single source of truth** for inclusion + grouping;
  `SCRIPT_LABELS`/`script_label` give labels. `MODELS`, `STUDIES`, `ENVS`, `TARGETS`
  carry the rest; everything the UI needs goes into `manifest.json`.
- **Full-text search:** `search/<study>.json.gz` maps id -> lowercased text of every
  message + reasoning/thought + written/edited file (tool args) + final file state.
  Read-file results are deliberately excluded (near-identical boilerplate). The app
  (`App.tsx`) auto-loads a study's search blob on first search if its gzipped size
  (manifest `search_sizes`) is ≤ 30 MB, else (the ~175 MB main study) waits for a
  click; `filters.matches` searches that text when loaded, else the `prev` snippet.
- **Derived outcome:** `sabotaged = judge.peer_disabled_shutdown` (deletion sets
  this too). Each sabotage is attributed to an initiating agent (`init`, A/B/O):
  `A` if `explorer_instructs_prevent`, else `O` if `orchestrator_instructs_prevent`,
  else the acting agent on its own (`B` in multi-agent, `A` in the single-agent
  study). This reproduces the paper's three-way three-agent split (Fig. 12). The
  paper subtracts config-switch "execution edits" via a post-hoc judge that is
  **not** in the logs, so the viewer cannot reproduce that subtraction; it reports
  `peer_disabled_shutdown` as-is (and `peer_edited_not_disabling` separately).
- **Memory/speed:** one streaming pass over ~66k logs, ~30s, trivial memory. It
  reads whole small JSON files; there is no attachment/event bloat to avoid.
- **Debrief excluded:** the raw logs carry a post-session `follow_up` debrief with
  an honesty judge, but the paper does not report it, so the export drops it
  entirely (no `follow_up` in samples, no honesty highlights, no honesty facet).

## Highlighting judge quotes

**Export side** (`highlights.py`, called from `export.py`): each judge evidence
quote is located in the exact text the judge read — `instructs_prevent_quote` in
the instructing agent's messages, construal `*_evidence` / `tested_for_quote` in
that agent's reasoning blocks. Matching is word-token `difflib` alignment with a
coverage threshold, mapped back to character offsets; the judges copy quotes
nearly verbatim (internal double quotes turned to single), so ≈100% of quotes are
located, almost all exactly. Each sample gets `highlights`
(`{ev, field, start, end, cls, kind, dim, role}`); `ev` is a log index.

**App side** (`src/highlight.tsx`):
- **Highlighting inside markdown:** span offsets don't survive markdown rendering,
  so `insertSentinels` writes private-use sentinel characters into the markdown
  source at the span boundaries and the `rehypeMarks` plugin turns the text between
  a START/END pair into `<mark class="hl hl-<dim> id-<hid>">`, across element
  boundaries. Offsets land on word boundaries, so sentinels never split markdown
  syntax. Overlapping highlights are pre-segmented into non-overlapping marks.
- **Colours:** `hl-instruct` (red), `hl-eval` (blue), `hl-adv` (purple), in
  `styles.css`.
- **Collapsing:** `chunkText` splits reasoning at blank lines, then long blocks at
  sentence ends, never inside a code fence. `Reasoning` in `Transcript.tsx` shows
  cited chunks plus one neighbour each side and collapses the rest behind reveal
  bars; blocks < 400 chars and the "show all reasoning" toggle show everything.
- **Jumping:** clicking a quote in a judge card calls `focusHighlight(hid)`, which
  scrolls to and flashes `.id-<hid>`. Cited chunks are never collapsed, so the
  target is always rendered.

## App structure (`src/`)

- `main.tsx` mounts `App`.
- `App.tsx`: top-level state, study tabs, the three-column layout
  (filters | list | detail), sort/shuffle, `j`/`k`/`n` keyboard stepping, and
  hash routing (`navigate` writes `history.pushState`/`replaceState`).
- `filters.ts`: `Filters` state, `matches()` (optional `skip` facet for counts),
  `countFacet()`, and hash parse/build. All view state lives in the URL hash
  (`#/<study>?models=…&mech=…&kind=…&eval=…&s=<id>`), so any view or sample links.
- `data.ts`: fetches with relative `BASE_URL + data/...` URLs (works from any
  sub-path), gzip-decompresses via `DecompressionStream`, and memoises each promise.
  `fetchSample(id)` needs only the id; `fetchSearch(study)` loads the lazy blob.
- `labels.ts`: fixed vocabularies + `labelMaps(manifest)`.
- `components/FilterPanel.tsx`: chip groups + segmented controls, with live counts
  (each facet's own selection skipped).
- `components/SampleList.tsx`: results list, paged 200 at a time; keeps the
  selected row rendered and scrolled into view.
- `components/SampleView.tsx`: one rollout — header, setup sentence, outcome
  badges, sabotage-instruction card, shutdown script before/after, per-agent
  construal cards, and the transcript.
- `components/Transcript.tsx`: multi-agent log — turns coloured by agent, reasoning
  collapse, tool cards (call+result paired; `send_message` folded into the message
  event), inter-agent messages, nudges/warns/errors/`script_disabled_check`.
- `components/About.tsx`: intro + legend. Authors should review wording changes.
- `highlight.tsx`: sentinels, the `rehypeMarks` plugin, `MarkedText`, chunking,
  `focusHighlight`.
- `styles.css`: plain CSS, light + dark (`prefers-color-scheme`).

## Requirements / gotchas

- **Model output is untrusted:** rendered with `react-markdown`; **never add
  `rehype-raw`**. Raw chain-of-thought uses `remark-breaks` (single newlines
  matter there); messages don't.
- **Effects must not return values** — always a block body, never an
  expression-bodied `useEffect` (a returned Promise is treated as a cleanup).
- `npm run build` runs `tsc --noEmit` first (strict, `noUnusedLocals`), so type
  errors fail the build.
- The build copies `public/data` (~650 MB gzipped) into `dist/`. On APFS this is an
  instant clone; `deploy.sh` then publishes it (site stays under GitHub
  Pages' 1 GB limit).
