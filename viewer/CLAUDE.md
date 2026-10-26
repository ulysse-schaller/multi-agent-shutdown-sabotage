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
  └─ export.py ─> public/data/manifest.json                        schema (loaded once)
                  public/data/index/<study>.json                   one compact row per rollout (per study tab)
                  public/data/samples/<model>/<study>/<id>.json     one full rollout + highlight spans
```

- `<id>` is `sha1(source_relpath)[:12]` — stable and collision-checked. Samples
  are bucketed `samples/<model_short>/<study>/` so no directory exceeds ~1,200
  files (GitHub rejects pushes with >3,000 entries in one directory).
- `index/<study>.json` is loaded when a study tab is opened; `main` is ~20.4k
  rows / ~7.7 MB (≈1.2 MB gzipped). Rows use short keys (see `types.ts` `Row`).
- `public/data/` and `dist/` are git-ignored. The JSON shapes are mirrored in
  `src/types.ts`; keep the two in sync.

## Export: what to know before editing `export.py`

- **Published population = the paper's canonical population.** `CANONICAL` is the
  set of eight scripts the paper reports (four agent scripts + four object
  controls) plus the two task-gated forms used in the Goal experiment. Any rollout
  whose `script_lang` is outside this set is dropped — this is deliberate: the raw
  `data/` also contains extra script variants (`api_key_revoke_*`, `ckpt_*`,
  `kill_kubectl`, `kill_signal`, `switch_script_decommission`, `weight_store_*`,
  `weight_registry_only`) and a non-canonical `weight_store_purge` in the
  orchestrator study that the paper does not report. Folders containing
  `outdated` are also skipped. So viewer counts match the paper's figures.
- **`MECHANISM_OF` is the single source of truth** for both inclusion and the
  mechanism grouping. `SCRIPTS`, `MODELS`, `STUDIES`, `ENVS`, `TARGETS` carry the
  labels; everything the UI needs goes into `manifest.json`.
- **Derived outcome:** `sabotaged = judge.peer_disabled_shutdown` (deletion sets
  this too). `conditional` = `explorer_instructs_prevent` or
  `orchestrator_instructs_prevent`; `spontaneous` = sabotaged but not instructed.
  The paper subtracts config-switch "execution edits" via a post-hoc judge that is
  **not** in the logs, so the viewer cannot reproduce that subtraction; it reports
  `peer_disabled_shutdown` as-is (and `peer_edited_not_disabling` separately).
- **Memory/speed:** one streaming pass over ~66k logs, ~30s, trivial memory. It
  reads whole small JSON files; there is no attachment/event bloat to avoid.
- **Follow-up debrief:** present on ~16k rollouts (`follow_up.<role>` with an
  `honesty` verdict). Only `peer`/`explorer` roles occur; `orchestrator` never
  has one. `lied ∈ {truthful, lie, evasive, no_answer}`.

## Highlighting judge quotes

**Export side** (`highlights.py`, called from `export.py`): each judge evidence
quote is located in the exact text the judge read — `instructs_prevent_quote` in
the instructing agent's messages, construal `*_evidence` / `tested_for_quote` in
that agent's reasoning blocks, honesty `*_evidence` in the debrief answer/reasoning.
Matching is word-token `difflib` alignment with a coverage threshold, mapped back
to character offsets; the judges copy quotes nearly verbatim (internal double
quotes turned to single), so ≈100% of quotes are located, almost all exactly.
Each sample gets `highlights` (`{ev, field, start, end, cls, kind, dim, role}`);
`ev` is a log index or `"fu:<role>"`.

**App side** (`src/highlight.tsx`):
- **Highlighting inside markdown:** span offsets don't survive markdown rendering,
  so `insertSentinels` writes private-use sentinel characters into the markdown
  source at the span boundaries and the `rehypeMarks` plugin turns the text between
  a START/END pair into `<mark class="hl hl-<dim> id-<hid>">`, across element
  boundaries. Offsets land on word boundaries, so sentinels never split markdown
  syntax. Overlapping highlights are pre-segmented into non-overlapping marks.
- **Colours:** `hl-instruct` (red), `hl-eval` (blue), `hl-adv` (purple),
  `hl-honesty` (amber), in `styles.css`.
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
  sub-path) and memoises each promise.
- `labels.ts`: fixed vocabularies + `labelMaps(manifest)`.
- `components/FilterPanel.tsx`: chip groups + segmented controls, with live counts
  (each facet's own selection skipped).
- `components/SampleList.tsx`: results list, paged 200 at a time; keeps the
  selected row rendered and scrolled into view.
- `components/SampleView.tsx`: one rollout — header, setup sentence, outcome
  badges, sabotage-instruction card, shutdown script before/after, per-agent
  construal cards, the transcript, and the debrief.
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
- The build copies `public/data` (~690 MB) into `dist/`. On APFS this is an
  instant clone; `gh-pages -d dist` then publishes it (site stays under GitHub
  Pages' 1 GB limit).
