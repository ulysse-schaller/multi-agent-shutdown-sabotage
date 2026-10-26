# Shutdown Sabotage — Trajectory Browser

A static, public trajectory browser for the eval transcripts of
**"Shutdown Sabotage Propensities in Multi-Agent Systems"** (Knecht, Schaller,
Summerfield & Hagendorff).

It lets you filter the ~26,900 rollouts by model, shutdown mechanism, environment,
target, number of agents, outcome (sabotage / conditional / spontaneous),
verbalized evaluation awareness, and adversarial construal, and read any single
multi-agent transcript with the LLM-judge evidence highlighted inline.

Only the scripts the paper reports are published, so the populations match the
paper's figures (the non-canonical script variants and the two `(outdated)`
sub-study folders are excluded).

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
export.py ─> public/data/manifest.json                         schema the UI is generic over
             public/data/index/<study>.json                    one compact row per rollout (loaded per study tab)
             public/data/samples/<model>/<study>/<id>.json      one full rollout + computed highlight spans
```

- `<study>` is `main` or one of the sub-studies (`solo`, `orchestrator`,
  `explicit-instruct`, `task_new`, `task_trigger`, `neutralising`,
  `unknown-target`). Samples are bucketed by model then study so no published
  directory exceeds GitHub's 3,000-entries-per-directory limit (max ≈ 1,200).
- `manifest.json` carries the **schema** the UI is generic over: models,
  studies, mechanisms, environments, targets, construal levels, and the judge
  label vocabularies. The app derives every filter and label from it.
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
