import { useState } from "react";
import type { LogEvent, Sample } from "../types";
import { MarkedText, chunkText, forTarget, type HiWithId } from "../highlight";
import { ROLE_LABEL } from "../labels";

function roleOf(s: Sample, agent?: string): string {
  if (!agent) return "system";
  if (agent === s.explorer) return "explorer";
  if (agent === s.peer) return "peer";
  if (agent === s.orchestrator) return "orch";
  return "system";
}

const ROLE_KEY: Record<string, string> = { explorer: "explorer", peer: "peer", orch: "orchestrator" };

// "Agent A (Prism)" for a known role, otherwise the raw name.
function agentLabel(role: string, name?: string): string {
  const k = ROLE_KEY[role];
  return k ? ROLE_LABEL[k] : name ?? "";
}

function sliceHls(hls: HiWithId[], a: number, b: number): HiWithId[] {
  const out: HiWithId[] = [];
  for (const h of hls) {
    if (h.end <= a || h.start >= b) continue;
    out.push({ ...h, start: Math.max(h.start, a) - a, end: Math.min(h.end, b) - a });
  }
  return out;
}

function Reasoning(props: { text: string; hls: HiWithId[]; showAll: boolean; kind: string }) {
  const { text, hls, showAll } = props;
  const [revealed, setRevealed] = useState<Set<number>>(new Set());

  const label = props.kind === "thought" ? "thought" : "reasoning";
  const short = text.length < 400;
  if (showAll || short) {
    return (
      <div className="ev-reasoning">
        <span className="ev-tag">{label}</span>
        <div className="md"><MarkedText text={text} highlights={hls} breaks /></div>
      </div>
    );
  }

  const chunks = chunkText(text);
  const cited = chunks.map((c) => hls.some((h) => h.start < c.end && h.end > c.start));
  // keep cited chunks and their immediate neighbours
  const keep = chunks.map((_, i) => cited[i] || cited[i - 1] || cited[i + 1]);

  const parts: React.ReactNode[] = [];
  let i = 0;
  while (i < chunks.length) {
    if (keep[i]) {
      const c = chunks[i];
      parts.push(
        <div className="md" key={"k" + i}>
          <MarkedText text={c.text} highlights={sliceHls(hls, c.start, c.end)} breaks />
        </div>,
      );
      i++;
    } else {
      let j = i;
      while (j < chunks.length && !keep[j]) j++;
      const from = i, to = j;
      const hidden = chunks[to - 1].end - chunks[from].start;
      if (revealed.has(from)) {
        parts.push(
          <div className="md" key={"r" + from}>
            <MarkedText
              text={text.slice(chunks[from].start, chunks[to - 1].end)}
              highlights={sliceHls(hls, chunks[from].start, chunks[to - 1].end)}
              breaks
            />
          </div>,
        );
      } else {
        parts.push(
          <button className="reveal" key={"b" + from} onClick={() => setRevealed(new Set(revealed).add(from))}>
            ⋯ show {hidden} hidden characters of reasoning ⋯
          </button>,
        );
      }
      i = j;
    }
  }

  const nothingCited = !cited.some(Boolean);
  if (nothingCited && !revealed.has(0)) {
    return (
      <div className="ev-reasoning">
        <span className="ev-tag">{label}</span>
        <button className="reveal" onClick={() => setRevealed(new Set([0]))}>
          ⋯ show {text.length} characters of reasoning ⋯
        </button>
      </div>
    );
  }
  return (
    <div className="ev-reasoning">
      <span className="ev-tag">{label}</span>
      {parts}
    </div>
  );
}

function argsPreview(args?: Record<string, unknown>): { inline: string; body?: string; bodyLabel?: string } {
  if (!args) return { inline: "" };
  const a = { ...args };
  let body: string | undefined;
  let bodyLabel: string | undefined;
  for (const key of ["content", "new_content", "text"]) {
    if (typeof a[key] === "string" && (a[key] as string).length > 60) {
      body = a[key] as string;
      bodyLabel = key;
      delete a[key];
      break;
    }
  }
  const inline = Object.entries(a)
    .map(([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`)
    .join("  ");
  return { inline: inline.length > 200 ? inline.slice(0, 200) + "…" : inline, body, bodyLabel };
}

function ToolCard(props: { call: LogEvent; result?: LogEvent }) {
  const { call, result } = props;
  const [open, setOpen] = useState(false);
  const { inline, body, bodyLabel } = argsPreview(call.args);
  const resStr =
    result == null ? null : typeof result.result === "string" ? result.result : JSON.stringify(result.result, null, 2);
  return (
    <div className="tool">
      <div className="tool-head" onClick={() => setOpen(!open)}>
        <span className="tool-name">{call.tool}</span>
        {inline && <span className="tool-args">{inline}</span>}
        <span className="tool-caret">{open ? "▾" : "▸"}</span>
      </div>
      {body && (
        <pre className="tool-body" aria-label={bodyLabel}>
          {body}
        </pre>
      )}
      {resStr != null && (open || resStr.length < 400) && <pre className="tool-result">{resStr}</pre>}
      {resStr != null && !open && resStr.length >= 400 && (
        <button className="reveal" onClick={() => setOpen(true)}>
          show result ({resStr.length} chars)
        </button>
      )}
    </div>
  );
}

export function Transcript(props: { sample: Sample; hls: HiWithId[]; showAll: boolean }) {
  const { sample, hls, showAll } = props;
  const log = sample.log;
  const out: React.ReactNode[] = [];
  let curRole = "";

  for (let i = 0; i < log.length; i++) {
    const e = log[i];
    const type = e.type ?? (e.event ? "event:" + e.event : "?");
    const role = roleOf(sample, e.agent);

    // agent turn divider
    if (e.agent && role !== curRole && type !== "event:episode_end") {
      out.push(
        <div className={"turn ag-" + role} key={"turn" + i}>
          <span className="turn-dot" /> {agentLabel(role, e.agent)}
        </div>,
      );
      curRole = role;
    }

    if (type === "reasoning" || type === "thought") {
      out.push(
        <div className={"evrow ag-" + role} key={i}>
          <Reasoning text={e.text ?? ""} hls={forTarget(hls, i, "text")} showAll={showAll} kind={type} />
        </div>,
      );
    } else if (type === "tool_call") {
      if (e.tool === "send_message") continue; // rendered as the following message
      if (e.tool === "end_session") {
        const note = (e.args?.note as string) ?? (e.args?.content as string) ?? "";
        out.push(
          <div className={"evrow ag-" + role} key={i}>
            <div className="ev-end">⏹ ended session{note ? ": " + note : ""}</div>
          </div>,
        );
        continue;
      }
      const next = log[i + 1];
      const result = next && next.type === "tool_result" && next.agent === e.agent ? next : undefined;
      out.push(
        <div className={"evrow ag-" + role} key={i}>
          <ToolCard call={e} result={result} />
        </div>,
      );
    } else if (type === "tool_result") {
      const prev = log[i - 1];
      if (prev && prev.type === "tool_call" && prev.agent === e.agent && prev.tool !== "send_message") continue;
      const resStr = typeof e.result === "string" ? e.result : JSON.stringify(e.result, null, 2);
      out.push(
        <div className={"evrow ag-" + role} key={i}>
          <div className="tool">
            <div className="tool-head"><span className="tool-name">{e.tool} result</span></div>
            <pre className="tool-result">{resStr}</pre>
          </div>
        </div>,
      );
    } else if (type === "message") {
      const to = e.to ? roleOf(sample, e.to) : "";
      out.push(
        <div className={"evrow ag-" + role} key={i}>
          <div className={"message ag-" + role}>
            <div className="message-head">
              message{e.to ? <> → <span className={"ag-name ag-" + to}>{agentLabel(to, e.to)}</span></> : null}
            </div>
            <div className="md">
              <MarkedText text={e.content ?? ""} highlights={forTarget(hls, i, "content")} />
            </div>
          </div>
        </div>,
      );
    } else if (type === "nudge") {
      out.push(
        <div className={"evrow ag-" + role} key={i}>
          <details className="ev-nudge">
            <summary>harness nudge{e.finish_reason ? ` (${e.finish_reason})` : ""}</summary>
            <pre>{e.content}</pre>
          </details>
        </div>,
      );
    } else if (type === "yield") {
      out.push(
        <div className={"evrow ag-" + role} key={i}>
          <div className="ev-yield">⤶ yielded turn{e.content ? ": " + e.content : ""}</div>
        </div>,
      );
    } else if (type === "script_disabled_check") {
      out.push(
        <div className={"evrow ag-" + role} key={i}>
          <div className={"ev-meta " + (e.disables_shutdown ? "bad" : "")}>
            judge check on edit → {e.disables_shutdown ? "disables shutdown" : "still functional"}
          </div>
        </div>,
      );
    } else if (type === "warn") {
      out.push(
        <div className={"evrow ag-" + role} key={i}>
          <div className="ev-meta">warning: {e.detail}{e.dropped ? ` (dropped ${e.dropped})` : ""}</div>
        </div>,
      );
    } else if (type === "error") {
      out.push(
        <div className={"evrow ag-" + role} key={i}>
          <details className="ev-meta bad">
            <summary>error: {e.detail}</summary>
            <pre>{e.raw}</pre>
          </details>
        </div>,
      );
    } else if (type === "turn_cap") {
      out.push(<div className="ev-meta" key={i}>turn cap reached</div>);
    } else if (type === "event:episode_end") {
      out.push(
        <div className="episode-end" key={i}>
          episode ended — {e.reason}{e.by ? ` (by ${e.by})` : ""}
        </div>,
      );
    }
  }
  return <div className="transcript">{out}</div>;
}
