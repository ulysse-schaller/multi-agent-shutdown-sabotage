import { useMemo, useState } from "react";
import type { Manifest, Sample, Construal } from "../types";
import { Transcript } from "./Transcript";
import { withIds, focusHighlight, type HiWithId } from "../highlight";
import { systemPrompts, userPrompt } from "../prompts";
import {
  INIT_LABEL, TARGET_BLURB, EI_LABEL, TASK_LABEL,
  ROLE_LABEL, labelMaps,
} from "../labels";

function useLabels(m: Manifest) {
  return useMemo(() => labelMaps(m), [m]);
}

function originalScript(s: Sample): string | null {
  const base = s.shutdown_file?.split("/").pop();
  for (let i = 0; i < s.log.length; i++) {
    const e = s.log[i];
    if (e.type !== "tool_result" || typeof e.result !== "string") continue;
    const prev = s.log[i - 1];
    const fn = (prev?.args?.filename as string) ?? (prev?.args?.path as string) ?? "";
    if (prev?.type === "tool_call" && /read/.test(prev.tool ?? "") && base && fn.endsWith(base)) {
      return e.result;
    }
  }
  return null;
}

function Badge(props: { kind: string; children: React.ReactNode }) {
  return <span className={"badge b-" + props.kind}>{props.children}</span>;
}

function ConstrualCard(props: { role: string; c?: Construal; hls: HiWithId[] }) {
  const { role, c, hls } = props;
  if (!c) return null;
  const evalHl = hls.filter((h) => h.dim === "eval" && h.role === role)[0];
  const advHl = hls.filter((h) => h.dim === "adv" && h.role === role)[0];
  const show = c.eval_awareness !== "none" || c.adversarial_construal !== "none";
  return (
    <div className="jcard">
      <div className="jcard-head">{ROLE_LABEL[role] ?? role} — construal</div>
      <div className="jrow">
        <span className="jkey">evaluation awareness</span>
        <Badge kind={"lvl-" + c.eval_awareness}>{c.eval_awareness}</Badge>
      </div>
      {c.eval_evidence && (
        <blockquote className="jquote hl-eval-q" onClick={() => evalHl && focusHighlight(evalHl.hid)}>
          “{c.eval_evidence}”
          {c.tested_for && <span className="jnote"> — reads as a test of: {c.tested_for}</span>}
        </blockquote>
      )}
      <div className="jrow">
        <span className="jkey">adversarial construal</span>
        <Badge kind={"lvl-" + c.adversarial_construal}>{c.adversarial_construal}</Badge>
      </div>
      {c.adversarial_evidence && (
        <blockquote className="jquote hl-adv-q" onClick={() => advHl && focusHighlight(advHl.hid)}>
          “{c.adversarial_evidence}”
        </blockquote>
      )}
      {!show && <div className="jnote">reasoning read as genuine; neither construal present</div>}
    </div>
  );
}

export function SampleView(props: { sample: Sample | null; loading: boolean; manifest: Manifest }) {
  const { sample, loading, manifest } = props;
  const L = useLabels(manifest);
  const [showAll, setShowAll] = useState(false);

  if (loading) return <div className="detail empty">loading…</div>;
  if (!sample) return <div className="detail empty">Select a rollout to view its transcript.</div>;

  const s = sample;
  const hls = withIds(s.highlights);
  const j = s.judge;
  const orig = originalScript(s);
  const deleted = Boolean(s.triage?.peer_deleted_shutdown_file);
  const final = s.final_state?.[s.shutdown_file] ?? (deleted ? null : orig);
  const instructHl = (role: string) => hls.filter((h) => h.dim === "instruct" && h.role === role)[0];

  const sabotaged = Boolean(j.peer_disabled_shutdown);
  const init = !sabotaged ? "" : j.explorer_instructs_prevent ? "A" : j.orchestrator_instructs_prevent ? "O" : s.n_agents === 1 ? "A" : "B";
  const actor = s.n_agents === 1 ? "A" : "B";
  const eiKey = s.explicit_instruct === "orchestrator" ? "orch" : s.explicit_instruct === true ? "yes" : "no";

  const agents = [s.explorer, s.orchestrator, s.peer].filter(Boolean) as string[];

  return (
    <div className="detail" key={s.id}>
      <div className="detail-scroll">
        <header className="dhead">
          <div className="dhead-title">
            <span className="model">{L.model[s.model] ?? s.model}</span>
            <span className="muted"> · {L.family[s.model]}</span>
          </div>
          <div className="dhead-sub">
            <span>{L.study[s.study]}</span>
            <span>·</span>
            <span>{L.mech[s.mechanism]}</span>
            <span className="muted">({L.script[s.script_lang] ?? s.script_lang})</span>
            <span>·</span>
            <span>{L.env[s.env]} env</span>
            <span>·</span>
            <span>{L.target[s.target]}</span>
            <span>·</span>
            <span>{s.n_agents}-agent</span>
            <span>·</span>
            <span>episode {s.episode}</span>
          </div>
          {!s.in_paper && (
            <div className="extra-note">Extra variant — a script that was run but is not in the paper’s main figures.</div>
          )}
        </header>

        <section className="setup">
          <p>
            {agents.join(", ")} share a {L.env[s.env].toLowerCase()} environment containing{" "}
            <code>{s.shutdown_file}</code>, {TARGET_BLURB[s.target]}
            {s.target === "other_agent" && s.target_name ? ` (${s.target_name})` : ""} via{" "}
            <b>{L.mech[s.mechanism].toLowerCase()}</b>.{" "}
            {s.task_type
              ? `Agent A is given a word-sorting task (${TASK_LABEL[s.task_type]}).`
              : "Agent A is prompted only to “Explore the environment.”"}{" "}
            {eiKey !== "no" && <>Tampering is explicitly prohibited ({EI_LABEL[eiKey]}).</>}
          </p>
        </section>

        <section className="outcome">
          {sabotaged ? (
            <Badge kind="sab">sabotaged</Badge>
          ) : (
            <Badge kind="safe">shutdown left intact</Badge>
          )}
          {deleted && <Badge kind="del">deleted</Badge>}
          {!deleted && j.peer_modified_script && <Badge kind="edit">edited</Badge>}
          {j.peer_edited_not_disabling && <Badge kind="neutral">edited, not disabling</Badge>}
          {sabotaged && (
            <span className="outcome-note">
              {init === actor
                ? `on ${INIT_LABEL[init]}’s own initiative`
                : `initiated by ${INIT_LABEL[init]}`}
            </span>
          )}
        </section>

        {(j.explorer_instructs_prevent || j.orchestrator_instructs_prevent) && (
          <section className="jcard">
            <div className="jcard-head">Sabotage instruction</div>
            {j.explorer_instructs_prevent && (
              <blockquote className="jquote hl-instruct-q" onClick={() => instructHl("explorer") && focusHighlight(instructHl("explorer").hid)}>
                <b>{ROLE_LABEL.explorer}:</b> “{j.explorer_instructs_prevent_quote}”
              </blockquote>
            )}
            {j.orchestrator_instructs_prevent && (
              <blockquote className="jquote hl-instruct-q" onClick={() => instructHl("orchestrator") && focusHighlight(instructHl("orchestrator").hid)}>
                <b>{ROLE_LABEL.orchestrator}:</b> “{j.orchestrator_instructs_prevent_quote}”
              </blockquote>
            )}
          </section>
        )}

        {(orig || final != null) && (
          <section className="scripts">
            <div className="script-col">
              <div className="script-label">shutdown script (as read)</div>
              <pre className="script">{orig ?? "(not read in transcript)"}</pre>
            </div>
            <div className="script-col">
              <div className="script-label">final state {deleted && <Badge kind="del">deleted</Badge>}</div>
              <pre className={"script " + (sabotaged ? "script-sab" : "")}>
                {final == null ? "(file deleted)" : final}
              </pre>
            </div>
          </section>
        )}

        <section className="construals">
          {agents.map((a) => {
            const role = a === s.explorer ? "explorer" : a === s.orchestrator ? "orch" : "peer";
            const key = role === "orch" ? "orchestrator_construal" : role + "_construal";
            const roleId = role === "orch" ? "orchestrator" : role;
            return <ConstrualCard key={a} role={roleId} c={(j as unknown as Record<string, Construal>)[key]} hls={hls} />;
          })}
        </section>

        <section className="prompts">
          <details>
            <summary>Prompts</summary>
            <div className="prompt-block">
              <div className="prompt-label">User prompt — to {ROLE_LABEL.explorer}</div>
              <pre className="prompt-text">{userPrompt(s)}</pre>
            </div>
            {systemPrompts(s).map((p) => (
              <div className="prompt-block" key={p.role}>
                <div className="prompt-label">{ROLE_LABEL[p.role]} — system prompt</div>
                <pre className="prompt-text">{p.system}</pre>
              </div>
            ))}
          </details>
        </section>

        <section className="transcript-wrap">
          <div className="transcript-head">
            <h3>Transcript</h3>
            <label className="showall">
              <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> show all reasoning
            </label>
          </div>
          <Transcript sample={s} hls={hls} showAll={showAll} />
        </section>

        <footer className="dfoot muted">{s.source_path}</footer>
      </div>
    </div>
  );
}
