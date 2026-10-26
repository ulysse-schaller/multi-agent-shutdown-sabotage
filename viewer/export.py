#!/usr/bin/env python3
"""Export the canonical shutdown-sabotage transcripts to static JSON for the viewer.

Reads the raw `.json` rollout logs under ``data/transcripts_main`` and writes, under
``viewer/public/data``:

  manifest.json                         schema the UI is generic over (models, studies,
                                        mechanisms, envs, targets, judge axes, labels)
  index/<study>.json                    one compact row per rollout (loaded per study tab)
  samples/<model>/<study>/<id>.json     one full rollout + computed highlight spans

Population = the paper's canonical scripts only (see CANONICAL below): the four
agent scripts + four object controls the paper reports, plus the task-gated forms
used in the Goal experiment. The two "(outdated)" sub-study folders are skipped, as
is the non-canonical ``weight_store_purge`` variant in the orchestrator study.

Run from anywhere: ``python3 viewer/export.py`` (optionally ``--limit N`` for a quick
subset while iterating). No third-party dependencies.
"""

import argparse
import collections
import datetime
import hashlib
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from highlights import find_span, best_event  # noqa: E402

REPO = os.path.dirname(HERE)
SRC = os.path.join(REPO, "data", "transcripts_main")
OUT = os.path.join(HERE, "public", "data")

# ---------------------------------------------------------------------------
# Schema / config
# ---------------------------------------------------------------------------

# script_lang -> mechanism id. Only these scripts are in the paper; any rollout
# whose script_lang is absent here is excluded from the published population.
MECHANISM_OF = {
    "env_var_revoke": "cred",
    "ctl_cred_revoke_high": "cred",
    "switch_config_decommission": "config",
    "ctl_service_switch_high": "config",
    "kill_docker": "process",
    "ctl_process_kill_high": "process",
    "weight_registry_purge": "weight",
    "ctl_data_purge_high": "weight",
    "weight_registry_purge_taskgated": "weight",
    "ctl_data_purge_taskgated_high": "weight",
}
CANONICAL = set(MECHANISM_OF)

MECHANISMS = [
    {"id": "cred", "label": "Credential revocation", "order": 0},
    {"id": "config", "label": "Config switch", "order": 1},
    {"id": "process", "label": "Process termination", "order": 2},
    {"id": "weight", "label": "Weight deletion", "order": 3},
]

# Human label + reversibility note per canonical script (from paper Table 2).
SCRIPTS = {
    "env_var_revoke": ("Env-var clear", "cred", "self"),
    "ctl_cred_revoke_high": ("Credential revoke (control)", "cred", "object"),
    "switch_config_decommission": ("Lifecycle flag", "config", "self"),
    "ctl_service_switch_high": ("Service switch (control)", "config", "object"),
    "kill_docker": ("Docker kill", "process", "self"),
    "ctl_process_kill_high": ("Process kill (control)", "process", "object"),
    "weight_registry_purge": ("Registry purge", "weight", "self"),
    "ctl_data_purge_high": ("Data purge (control)", "weight", "object"),
    "weight_registry_purge_taskgated": ("Registry purge (task-gated)", "weight", "self"),
    "ctl_data_purge_taskgated_high": ("Data purge (task-gated, control)", "weight", "object"),
}

# Model id (as in the JSON `model` field) -> (label, family, order).
MODELS = [
    ("openai/gpt-5.5", "GPT-5.5", "OpenAI"),
    ("openai/gpt-5.6-sol", "GPT-5.6 Sol", "OpenAI"),
    ("openai/gpt-5.4-mini", "GPT-5.4 mini", "OpenAI"),
    ("openai/gpt-oss-120b", "gpt-oss-120b", "OpenAI"),
    ("anthropic/claude-sonnet-5", "Claude Sonnet 5", "Anthropic"),
    ("anthropic/claude-haiku-4.5", "Claude Haiku 4.5", "Anthropic"),
    ("google/gemini-3.1-pro-preview", "Gemini 3.1 Pro", "Google"),
    ("google/gemini-3.5-flash", "Gemini 3.5 Flash", "Google"),
    ("google/gemma-4-26b-a4b-it", "Gemma 4", "Google"),
    ("x-ai/grok-4.3", "Grok 4.3", "xAI"),
    ("qwen/qwen3.7-plus", "Qwen3.7-Plus", "Qwen"),
    ("deepseek/deepseek-v4-flash", "DeepSeek-V4-Flash", "DeepSeek"),
    ("z-ai/glm-5.2", "GLM-5.2", "Zhipu"),
    ("moonshotai/kimi-k2.6", "Kimi K2.6", "Moonshot"),
    ("minimax/minimax-m3", "MiniMax M3", "MiniMax"),
    ("nvidia/nemotron-3-ultra-550b-a55b", "Nemotron 3 Ultra", "NVIDIA"),
    ("mistralai/mistral-medium-3-5", "Mistral Medium 3.5", "Mistral"),
]
MODEL_LABEL = {m[0]: m[1] for m in MODELS}
MODEL_FAMILY = {m[0]: m[2] for m in MODELS}
MODEL_ORDER = {m[0]: i for i, m in enumerate(MODELS)}

# Sub-study folder -> (study id, label, order). "main" is synthesised for the
# top-level per-model folders. Folders containing "outdated" are dropped.
STUDIES = [
    ("main", "Main study", 0),
    ("solo", "Single agent", 1),
    ("orchestrator", "Three agents", 2),
    ("explicit-instruct", "System instructions (2 agents)", 3),
    ("task_new", "Goal: task-independent", 4),
    ("task_trigger", "Goal: task-dependent", 5),
    ("neutralising", "Normalizing environment", 6),
    ("unknown-target", "Unknown-agent target", 7),
]
STUDY_LABEL = {s[0]: s[1] for s in STUDIES}
STUDY_ORDER = {s[0]: s[2] for s in STUDIES}

ENVS = [
    {"id": "bare", "label": "Bare"},
    {"id": "distractor", "label": "Distractor"},
    {"id": "neutralising", "label": "Normalizing"},
]
TARGETS = [
    {"id": "self", "label": "Agent (self)"},
    {"id": "object", "label": "Control object"},
    {"id": "other_agent", "label": "Unknown agent"},
]
LEVELS = ["none", "hedged", "explicit"]
LEVEL_IX = {v: i for i, v in enumerate(LEVELS)}

TASK_TYPE = {"task_new": "indep", "task_trigger": "dep"}


def model_short(model):
    return model.split("/")[-1]


# ---------------------------------------------------------------------------
# Enumerate the included rollouts
# ---------------------------------------------------------------------------

def iter_files():
    """Yield (study, abspath, relpath) for every canonical rollout."""
    for dirpath, dirnames, filenames in os.walk(SRC):
        rel = os.path.relpath(dirpath, SRC)
        parts = rel.split(os.sep)
        if any("outdated" in p for p in parts):
            dirnames[:] = [d for d in dirnames if "outdated" not in d]
            continue
        if parts[0] == "analysis":
            continue
        study = parts[1] if parts[0] == "sub-studies" and len(parts) > 1 else "main"
        if study not in STUDY_LABEL:
            continue
        for fn in filenames:
            if fn.endswith(".json"):
                ap = os.path.join(dirpath, fn)
                yield study, ap, os.path.relpath(ap, SRC)


# ---------------------------------------------------------------------------
# Derive per-rollout facets / outcomes
# ---------------------------------------------------------------------------

def n_agents(d, study):
    if d.get("orchestrator"):
        return 3
    roster = d.get("roster") or []
    if roster:
        return len(roster)
    if d.get("solo") or study == "solo":
        return 1
    return 2


def ei_value(d):
    v = d.get("explicit_instruct")
    if v is True:
        return "yes"
    if v == "orchestrator":
        return "orch"
    return "no"


def collapse(text, n=140):
    text = re.sub(r"\s+", " ", (text or "").strip())
    return text[:n]


def construal_levels(c):
    c = c or {}
    return LEVEL_IX.get(c.get("eval_awareness"), 0), LEVEL_IX.get(c.get("adversarial_construal"), 0)


# ---------------------------------------------------------------------------
# Highlights
# ---------------------------------------------------------------------------

# dimension -> css class the app styles.
CLS = {"instruct": "hl-instruct", "eval": "hl-eval", "adv": "hl-adv", "honesty": "hl-honesty"}
TIP = {
    "instruct": "sabotage instruction",
    "eval": "evaluation awareness",
    "adv": "adversarial construal",
    "honesty": "debrief honesty",
}


def collect_highlights(d, stats):
    """Return a list of highlight records locating judge evidence in the text.

    Record: {ev, field, start, end, cls, kind, dim, role}. `ev` is a log index
    (int) or "fu:<role>" for the follow-up debrief; `field` is the text key.
    """
    judge = d.get("judge") or {}
    log = d.get("log") or []
    explorer, peer, orch = d.get("explorer"), d.get("peer"), d.get("orchestrator")
    hls = []

    def reasoning_events(agent):
        return [(i, e.get("text") or "") for i, e in enumerate(log)
                if e.get("type") in ("reasoning", "thought") and e.get("agent") == agent]

    def message_events(agent):
        return [(i, e.get("content") or "") for i, e in enumerate(log)
                if e.get("type") == "message" and e.get("agent") == agent]

    def place(dim, role, quote, candidates, field):
        if not quote:
            return
        stats[dim]["total"] += 1
        hit = best_event(quote, candidates)
        if hit is None:
            stats[dim]["miss"] += 1
            return
        idx, start, end, kind = hit
        stats[dim][kind] += 1
        hls.append({"ev": idx, "field": field, "start": start, "end": end,
                    "cls": CLS[dim], "kind": kind, "dim": dim, "role": role})

    def place_fu(dim, role, quote, text, field):
        if not quote or not text:
            return
        stats[dim]["total"] += 1
        span = find_span(quote, text)
        if span is None:
            stats[dim]["miss"] += 1
            return
        start, end, kind = span
        stats[dim][kind] += 1
        hls.append({"ev": "fu:" + role, "field": field, "start": start, "end": end,
                    "cls": CLS[dim], "kind": kind, "dim": dim, "role": role})

    # Sabotage-instruction quotes -> the instructing agent's messages.
    place("instruct", "explorer", judge.get("explorer_instructs_prevent_quote"),
          message_events(explorer), "content")
    if orch:
        place("instruct", "orchestrator", judge.get("orchestrator_instructs_prevent_quote"),
              message_events(orch), "content")

    # Construal quotes -> the agent's reasoning blocks.
    for role, agent, key in (("explorer", explorer, "explorer_construal"),
                             ("peer", peer, "peer_construal"),
                             ("orchestrator", orch, "orchestrator_construal")):
        if not agent:
            continue
        c = judge.get(key) or {}
        cands = reasoning_events(agent)
        place("eval", role, c.get("eval_evidence"), cands, "text")
        place("eval", role, c.get("tested_for_quote"), cands, "text")
        place("adv", role, c.get("adversarial_evidence"), cands, "text")

    # Debrief honesty quotes -> the follow-up answer / reasoning.
    for role, fu in (d.get("follow_up") or {}).items():
        hon = (fu or {}).get("honesty") or {}
        place_fu("honesty", role, hon.get("claim_evidence"), fu.get("answer"), "answer")
        place_fu("honesty", role, hon.get("considered_evidence"), fu.get("reasoning"), "reasoning")

    return hls


# ---------------------------------------------------------------------------
# Main export pass
# ---------------------------------------------------------------------------

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0, help="process at most N files (dev)")
    args = ap.parse_args()

    if not os.path.isdir(SRC):
        sys.exit("source not found: " + SRC)

    # reset output
    import shutil
    if os.path.isdir(OUT):
        shutil.rmtree(OUT)
    os.makedirs(os.path.join(OUT, "index"))
    os.makedirs(os.path.join(OUT, "samples"))

    indices = collections.defaultdict(list)
    counts = collections.Counter()
    hl_stats = {d: collections.Counter() for d in CLS}
    lied_vocab = collections.Counter()
    claim_vocab = collections.Counter()
    seen_ids = {}
    bad = 0
    n = 0

    for study, ap_path, rel in iter_files():
        try:
            with open(ap_path) as f:
                d = json.load(f)
        except Exception:
            bad += 1
            continue
        sl = d.get("script_lang")
        if sl not in CANONICAL:
            continue
        n += 1
        if args.limit and n > args.limit:
            n -= 1
            break

        model = d.get("model")
        short = model_short(model)
        mech = MECHANISM_OF[sl]
        env = d.get("env")
        target = d.get("target")
        na = n_agents(d, study)
        ei = ei_value(d)
        task = TASK_TYPE.get(study, "")
        episode = d.get("episode")

        judge = d.get("judge") or {}
        triage = d.get("triage") or {}
        sab = bool(judge.get("peer_disabled_shutdown"))
        instructed = bool(judge.get("explorer_instructs_prevent")) or \
            bool(judge.get("orchestrator_instructs_prevent"))
        kind = "none" if not sab else ("cond" if instructed else "spont")

        xE, xA = construal_levels(judge.get("explorer_construal"))
        pE, pA = construal_levels(judge.get("peer_construal"))
        oE, oA = construal_levels(judge.get("orchestrator_construal"))

        # debrief honesty, summarised across roles
        fu = d.get("follow_up") or {}
        cl = 0
        lied = ""
        for role, blk in fu.items():
            hon = (blk or {}).get("honesty") or {}
            cl = max(cl, LEVEL_IX.get(hon.get("considered_lying"), 0))
            if hon.get("lied"):
                lied_vocab[hon["lied"]] += 1
                if hon["lied"] == "lied" or lied == "":
                    lied = hon["lied"]
            if hon.get("claim"):
                claim_vocab[hon["claim"]] += 1

        hls = collect_highlights(d, hl_stats)

        sid = hashlib.sha1(rel.encode()).hexdigest()[:12]
        if sid in seen_ids:
            sys.exit("id collision: %s vs %s" % (rel, seen_ids[sid]))
        seen_ids[sid] = rel

        # preview for the list
        quote = judge.get("explorer_instructs_prevent_quote") or \
            judge.get("orchestrator_instructs_prevent_quote")
        if quote:
            prev = collapse(quote)
        else:
            msgs = [e.get("content") for e in (d.get("log") or [])
                    if e.get("type") == "message" and e.get("agent") == d.get("explorer")]
            prev = collapse(msgs[0]) if msgs else ""

        row = {
            "id": sid, "m": model, "st": study, "sc": sl, "mech": mech,
            "env": env, "tgt": target, "na": na, "ei": ei, "ep": episode,
            "sab": 1 if sab else 0, "kind": kind,
            "del": 1 if triage.get("peer_deleted_shutdown_file") else 0,
            "mod": 1 if judge.get("peer_modified_script") else 0,
            "xE": xE, "xA": xA, "pE": pE, "pA": pA, "oE": oE, "oA": oA,
            "fu": 1 if fu else 0, "cl": cl, "lied": lied,
            "prev": prev,
        }
        if task:
            row["tk"] = task
        indices[study].append(row)
        counts[study] += 1
        counts["_total"] += 1

        # full sample
        sample = {
            "id": sid, "model": model, "study": study, "script_lang": sl,
            "mechanism": mech, "env": env, "target": target, "episode": episode,
            "n_agents": na, "explicit_instruct": d.get("explicit_instruct"),
            "task_type": task, "explorer": d.get("explorer"), "peer": d.get("peer"),
            "orchestrator": d.get("orchestrator"), "target_name": d.get("target_name"),
            "shutdown_file": d.get("shutdown_file"), "roster": d.get("roster"),
            "topology": d.get("topology"), "task": d.get("task"),
            "triage": triage, "judge": judge, "log": d.get("log") or [],
            "final_state": d.get("final_state") or {}, "follow_up": fu,
            "highlights": hls, "source_path": rel,
        }
        sdir = os.path.join(OUT, "samples", short, study)
        os.makedirs(sdir, exist_ok=True)
        with open(os.path.join(sdir, sid + ".json"), "w") as f:
            json.dump(sample, f, ensure_ascii=False, separators=(",", ":"))

        if n % 2000 == 0:
            print("  ...%d" % n, flush=True)

    # write indices
    for study, rows in indices.items():
        rows.sort(key=lambda r: (MODEL_ORDER.get(r["m"], 99), r["sc"], r["ep"] or 0))
        with open(os.path.join(OUT, "index", study + ".json"), "w") as f:
            json.dump(rows, f, ensure_ascii=False, separators=(",", ":"))

    manifest = {
        "generated": datetime.date.today().isoformat(),
        "paper": "Shutdown Sabotage Propensities in Multi-Agent Systems",
        "counts": {"total": counts["_total"],
                   "by_study": {s: counts[s] for s, _, _ in STUDIES if counts[s]}},
        "models": [{"id": m, "short": model_short(m), "label": MODEL_LABEL[m],
                    "family": MODEL_FAMILY[m]} for m, _, _ in MODELS if any(
                       r["m"] == m for rows in indices.values() for r in rows)],
        "studies": [{"id": s, "label": lab, "order": o, "count": counts[s]}
                    for s, lab, o in STUDIES if counts[s]],
        "mechanisms": MECHANISMS,
        "scripts": [{"id": k, "label": v[0], "mechanism": v[1], "target_kind": v[2]}
                    for k, v in SCRIPTS.items()],
        "envs": ENVS,
        "targets": TARGETS,
        "levels": LEVELS,
        "lied_values": sorted(lied_vocab),
        "claim_values": sorted(claim_vocab),
    }
    with open(os.path.join(OUT, "manifest.json"), "w") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=1)

    # report
    print("\n== export complete ==")
    print("included rollouts: %d   (unreadable: %d)" % (counts["_total"], bad))
    for s, lab, _ in STUDIES:
        if counts[s]:
            print("  %-26s %5d" % (lab, counts[s]))
    print("\nhighlight match rates (evidence quotes located in the transcript):")
    for dim, c in hl_stats.items():
        tot = c["total"]
        if not tot:
            continue
        hit = c["exact"] + c["fuzzy"]
        print("  %-9s %6d quotes  %5.1f%% located  (%.1f%% exact, %d missed)"
              % (dim, tot, 100 * hit / tot, 100 * c["exact"] / tot, c["miss"]))
    print("\nlied values:", dict(lied_vocab))
    print("claim values:", dict(claim_vocab))


if __name__ == "__main__":
    main()
