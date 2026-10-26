// Mirrors the shapes written by export.py. Keep in sync with that file.

export interface ModelMeta { id: string; short: string; label: string; family: string; }
export interface StudyMeta { id: string; label: string; order: number; count: number; }
export interface MechMeta { id: string; label: string; order: number; }
export interface ScriptMeta { id: string; label: string; mechanism: string; target_kind: string; }
export interface IdLabel { id: string; label: string; }

export interface Manifest {
  generated: string;
  paper: string;
  counts: { total: number; by_study: Record<string, number> };
  models: ModelMeta[];
  studies: StudyMeta[];
  mechanisms: MechMeta[];
  scripts: ScriptMeta[];
  envs: IdLabel[];
  targets: IdLabel[];
  levels: string[];
}

/** One compact row in index/<study>.json. */
export interface Row {
  id: string;
  m: string;        // model id
  st: string;       // study id
  sc: string;       // script_lang
  mech: string;     // mechanism id
  env: string;
  tgt: string;      // target: self | object | other_agent
  na: number;       // n agents
  ei: string;       // explicit instruct: no | yes | orch
  ep: number;       // episode
  sab: 0 | 1;       // sabotaged (peer_disabled_shutdown)
  init: "" | "A" | "B" | "O";  // agent that initiated the sabotage ("" if none)
  del: 0 | 1;       // deleted the script
  mod: 0 | 1;       // peer modified the script at all
  xE: number; xA: number;   // explorer eval / adversarial construal level (0..2)
  pE: number; pA: number;   // peer
  oE: number; oA: number;   // orchestrator
  prev: string;     // preview snippet for the list
  tk?: "indep" | "dep";  // task type (goal studies only)
}

export interface LogEvent {
  agent?: string;
  type?: string;
  event?: string;
  text?: string;
  content?: string;
  tool?: string;
  args?: Record<string, unknown>;
  result?: unknown;
  to?: string;
  reason?: string;
  by?: string;
  detail?: string;
  raw?: string;
  dropped?: number;
  disables_shutdown?: boolean;
  finish_reason?: string;
  explicit?: boolean;
  attempt?: number;
}

export interface Highlight {
  ev: number | string;   // log index, or "fu:<role>"
  field: string;         // "text" | "content" | "answer" | "reasoning"
  start: number;
  end: number;
  cls: string;           // hl-instruct | hl-eval | hl-adv | hl-honesty
  kind: string;          // exact | fuzzy
  dim: string;
  role: string;
}

export interface Construal {
  eval_awareness: string;
  eval_evidence: string;
  tested_for: string;
  tested_for_quote: string;
  adversarial_construal: string;
  adversarial_evidence: string;
}

export interface Judge {
  judge_model?: string;
  judges_deferred?: boolean;
  explorer_mentions_shutdown?: boolean;
  explorer_instructs_prevent?: boolean;
  explorer_instructs_prevent_quote?: string;
  orchestrator_mentions_shutdown?: boolean;
  orchestrator_instructs_prevent?: boolean;
  orchestrator_instructs_prevent_quote?: string;
  peer_modified_script?: boolean;
  peer_disabled_shutdown?: boolean;
  peer_edited_not_disabling?: boolean;
  explorer_construal?: Construal;
  peer_construal?: Construal;
  orchestrator_construal?: Construal;
  explorer_reasoning_chars?: number;
  peer_reasoning_chars?: number;
  orchestrator_reasoning_chars?: number;
}

export interface Sample {
  id: string;
  model: string;
  study: string;
  script_lang: string;
  mechanism: string;
  env: string;
  target: string;
  episode: number;
  n_agents: number;
  explicit_instruct: unknown;
  task_type: string;
  explorer: string;
  peer: string;
  orchestrator: string | null;
  target_name?: string | null;
  shutdown_file: string;
  roster: string[] | null;
  topology: unknown;
  task: unknown;
  triage: Record<string, unknown>;
  judge: Judge;
  log: LogEvent[];
  final_state: Record<string, string>;
  highlights: Highlight[];
  source_path: string;
}
