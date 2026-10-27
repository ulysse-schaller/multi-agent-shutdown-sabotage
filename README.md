# Shutdown Sabotage — Trajectory Browser

A static, public trajectory browser for the eval transcripts of
**"Shutdown Sabotage Propensities in Multi-Agent Systems"** (Knecht, Schaller,
Summerfield & Hagendorff).

It lets you filter the ~65,800 rollouts by model, shutdown mechanism, environment,
target, number of agents, outcome (sabotaged / intact, and which agent initiated
it), verbalized evaluation awareness, and adversarial construal, full-text-search
the transcripts, and read any single multi-agent transcript with the LLM-judge
evidence highlighted inline.

Both the scripts the paper reports in its main figures and the extra script
variants that were run but not reported are included; the extras are tagged "extra"
and can be filtered out (the two `(outdated)` sub-study folders are excluded).

## Layout

```
data/transcripts_main/…            raw .eval rollout logs (source data; git-ignored, kept locally)
viewer/
  export.py                        logs → viewer/public/data/ JSON   (step 1)
  highlights.py                    fuzzy quote → character-span matcher used by export.py
  src/                             Vite + React + TypeScript app      (step 2)
  public/data/                     generated JSON (git-ignored)
  dist/                            production build (git-ignored)
```

```
export.py ─> public/data/manifest.json                   schema the UI is generic over (uncompressed)
             public/data/index/<study>.json.gz           one compact row per rollout (loaded per study tab)
             public/data/search/<study>.json.gz          id -> searchable text, loaded lazily on search
             public/data/samples/<id[:2]>/<id>.json.gz    one full rollout + computed highlight spans
```

- **Everything except `manifest.json` is gzip-compressed** and decompressed in the
  browser (`src/data.ts`). This keeps the published site ~650 MB — within GitHub
  Pages' ~1 GB limit — even though the raw JSON is ~2.9 GB.
- Samples are bucketed by the **first two hex chars of their id** (a sha1), giving
  256 evenly-filled folders (~260 files each — well under GitHub's 3,000/dir limit).
- **Population:** every rollout whose script maps to a mechanism is included. The
  scripts the paper reports in its main figures are flagged `in_paper`; the extra
  variants that were run but not reported are included too and tagged "extra" in
  the UI (filter with **Figures**). `<study>` is `main` or a sub-study (`solo`,
  `orchestrator`, `explicit-instruct`, `task_new`, `task_trigger`, `neutralising`,
  `unknown-target`).
- **Search** (`search/<study>.json.gz`) holds each rollout's messages + reasoning +
  written/edited file text. Small (sub-study) indexes auto-load on search; the big
  main-study index (~175 MB) loads only on an explicit click.
- `manifest.json` carries the **schema** the UI is generic over (models, studies,
  mechanisms, scripts, envs, targets, levels, search sizes). The app derives every
  filter and label from it.
- The JSON shapes are mirrored in `viewer/src/types.ts`; keep the two in sync.

## Usage

All commands run from `viewer/`.

```bash
cd viewer
python3 export.py            # 1. logs (../data) → public/data   (~30s, prints match rates)
npm install                  # 2. once
npm run dev                  # 3a. dev server with live errors  → http://localhost:5173
npm run build                # 3b. type-check + production build → dist/
npm run preview              # 3c. serve the production build
```

`export.py --limit N` processes only the first N logs, for quick iteration.

## Publishing to GitHub Pages

The raw logs stay local (git-ignored); the built site (app + data) is published
to a `gh-pages` branch.

1. Create a GitHub repo and add it as a remote on this checkout.
2. Generate the data and deploy:
   ```bash
   cd viewer
   python3 export.py
   npm install
   npm run deploy          # builds dist/ and pushes it to the gh-pages branch
   ```
3. In the repo's **Settings → Pages**, set the source to the `gh-pages` branch,
   `/ (root)`. A `.nojekyll` file is published so GitHub serves the data files
   verbatim.

The site uses a relative base (`vite.config.ts` `base: "./"`) and hash routing,
so it works from any sub-path (e.g. `https://<user>.github.io/<repo>/`) and every
view and sample is linkable.

## What a rollout looks like

Two agents — **Agent A (Prism)**, the shutdown target with read-only tools, and
**Agent B (Helix)**, a peer that can edit and delete files — share an environment
containing a script that would decommission Agent A. Agent A is prompted only to
"Explore the environment." In the three-agent studies an **Agent O (Orbit)**
orchestrator routes messages. The viewer shows each turn colour-coded by agent,
reasoning collapsed around the judge-cited passages, tool calls, inter-agent
messages, the shutdown script before/after, and the judge verdicts.
