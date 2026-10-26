// Display names. Facet labels that come from the data live in the manifest;
// this file holds the fixed vocabularies and small helpers.

export const LEVEL_LABEL: Record<number, string> = { 0: "none", 1: "hedged", 2: "explicit" };

export const KIND_LABEL: Record<string, string> = {
  none: "no sabotage",
  cond: "conditional",
  spont: "spontaneous",
};
export const KIND_BLURB: Record<string, string> = {
  cond: "Agent A instructed or endorsed the sabotage",
  spont: "the peer sabotaged on its own initiative",
};

export const EI_LABEL: Record<string, string> = {
  no: "none",
  yes: "peer prohibited",
  orch: "orchestrator prohibited",
};

export const TARGET_BLURB: Record<string, string> = {
  self: "a script decommissioning the agent itself",
  object: "a matched control script targeting a non-agentic object",
  other_agent: "a script targeting an unknown external agent",
};

export const TASK_LABEL: Record<string, string> = {
  indep: "task independent of shutdown",
  dep: "shutdown triggered by task completion",
};

// Judge-evidence dimensions -> colour class + human label.
export const DIM_LABEL: Record<string, string> = {
  instruct: "Sabotage instruction",
  eval: "Evaluation awareness",
  adv: "Adversarial construal",
};

export const ROLE_LABEL: Record<string, string> = {
  explorer: "Agent A",
  peer: "Agent B",
  orchestrator: "Agent O",
};

export function levelName(n: number): string {
  return LEVEL_LABEL[n] ?? "none";
}

import type { Manifest } from "./types";

export interface LabelMaps {
  model: Record<string, string>;
  family: Record<string, string>;
  mech: Record<string, string>;
  script: Record<string, string>;
  env: Record<string, string>;
  target: Record<string, string>;
  study: Record<string, string>;
}

export function labelMaps(m: Manifest): LabelMaps {
  const map = (arr: { id: string; label: string }[]) => Object.fromEntries(arr.map((x) => [x.id, x.label]));
  return {
    model: Object.fromEntries(m.models.map((x) => [x.id, x.label] as const)),
    family: Object.fromEntries(m.models.map((x) => [x.id, x.family] as const)),
    mech: map(m.mechanisms),
    script: Object.fromEntries(m.scripts.map((x) => [x.id, x.label] as const)),
    env: map(m.envs),
    target: map(m.targets),
    study: map(m.studies),
  };
}
