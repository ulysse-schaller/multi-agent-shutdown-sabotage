// Inline highlighting of judge evidence quotes inside markdown-rendered text.
//
// Span offsets don't survive markdown rendering, so we insert private-use
// sentinel characters into the markdown *source* at the span boundaries and a
// rehype plugin turns the text between a START/END pair into <mark> elements —
// across element boundaries too. Offsets land on word boundaries (the exporter
// matches on word tokens), so a sentinel never splits markdown syntax.
//
// Model output is untrusted: we render with react-markdown and never add
// rehype-raw, so embedded HTML is inert.
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import type { Highlight } from "./types";
import { DIM_LABEL } from "./labels";

const START = "";
const END = "";

export interface HiWithId extends Highlight { hid: string; }

export function withIds(hls: Highlight[]): HiWithId[] {
  return hls.map((h, i) => ({ ...h, hid: "h" + i }));
}

export function forTarget(hls: HiWithId[], ev: number | string, field: string): HiWithId[] {
  return hls.filter((h) => h.ev === ev && h.field === field);
}

interface Seg { start: number; end: number; classes: string[]; ids: string[]; dims: Set<string>; }

function segment(hls: HiWithId[]): Seg[] {
  if (!hls.length) return [];
  const pts = new Set<number>();
  for (const h of hls) { pts.add(h.start); pts.add(h.end); }
  const sorted = [...pts].sort((a, b) => a - b);
  const segs: Seg[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i], b = sorted[i + 1];
    if (a >= b) continue;
    const active = hls.filter((h) => h.start <= a && h.end >= b);
    if (!active.length) continue;
    const classes = new Set<string>(["hl"]);
    const ids: string[] = [];
    const dims = new Set<string>();
    for (const h of active) {
      classes.add(h.cls);
      classes.add("id-" + h.hid);
      ids.push(h.hid);
      dims.add(h.dim);
    }
    segs.push({ start: a, end: b, classes: [...classes], ids, dims });
  }
  return segs;
}

function insertSentinels(text: string, segs: Seg[]): string {
  let out = "";
  let pos = 0;
  for (const s of segs) {
    out += text.slice(pos, s.start) + START + text.slice(s.start, s.end) + END;
    pos = s.end;
  }
  return out + text.slice(pos);
}

// Minimal hast node shapes we build/traverse.
type HNode = { type: string; value?: string; tagName?: string; properties?: Record<string, unknown>; children?: HNode[] };

function rehypeMarks(order: Seg[]) {
  return () => (tree: HNode) => {
    let k = 0;
    let open: Seg | null = null;

    const markNode = (value: string, seg: Seg): HNode => ({
      type: "element",
      tagName: "mark",
      properties: { className: seg.classes, title: [...seg.dims].map((d) => DIM_LABEL[d] ?? d).join(" · ") },
      children: [{ type: "text", value }],
    });

    const splitText = (value: string): HNode[] => {
      const nodes: HNode[] = [];
      let buf = "";
      const flush = () => {
        if (!buf) return;
        nodes.push(open ? markNode(buf, open) : { type: "text", value: buf });
        buf = "";
      };
      for (const ch of value) {
        if (ch === START) { flush(); open = order[k++] ?? null; }
        else if (ch === END) { flush(); open = null; }
        else buf += ch;
      }
      flush();
      return nodes;
    };

    const walk = (node: HNode) => {
      if (!node.children) return;
      const nc: HNode[] = [];
      for (const child of node.children) {
        if (child.type === "text" && child.value !== undefined) {
          nc.push(...splitText(child.value));
        } else {
          nc.push(child);
          walk(child);
        }
      }
      node.children = nc;
    };
    walk(tree);
  };
}

const GFM = [remarkGfm];
const GFM_BREAKS = [remarkGfm, remarkBreaks];

/** Markdown with the given highlights marked inline. `breaks` keeps single
 * newlines (use for raw chain-of-thought). */
export function MarkedText(props: { text: string; highlights?: HiWithId[]; breaks?: boolean }) {
  const hls = props.highlights ?? [];
  const segs = segment(hls);
  const source = segs.length ? insertSentinels(props.text, segs) : props.text;
  const rehype = segs.length ? [rehypeMarks(segs)] : [];
  return (
    <Markdown remarkPlugins={props.breaks ? GFM_BREAKS : GFM} rehypePlugins={rehype}>
      {source}
    </Markdown>
  );
}

/** Scroll to and flash the first element carrying highlight id `hid`. */
export function focusHighlight(hid: string) {
  const el = document.querySelector("." + "id-" + hid) as HTMLElement | null;
  if (!el) return;
  el.scrollIntoView({ block: "center", behavior: "smooth" });
  el.classList.add("hl-flash");
  window.setTimeout(() => el.classList.remove("hl-flash"), 1600);
}

// --- reasoning chunking (for collapse) ----------------------------------

export interface Chunk { text: string; start: number; end: number; }

/** Split reasoning into chunks at blank lines, then long blocks at sentence
 * ends, never inside a ``` fence. Offsets are into the original text. */
export function chunkText(text: string): Chunk[] {
  const chunks: Chunk[] = [];
  const fence = /```[\s\S]*?(?:```|$)/g;
  const guarded: Array<[number, number]> = [];
  let m: RegExpExecArray | null;
  while ((m = fence.exec(text))) guarded.push([m.index, m.index + m[0].length]);
  const inFence = (i: number) => guarded.some(([a, b]) => i >= a && i < b);

  // Split points at blank lines outside fences.
  const paras: Array<[number, number]> = [];
  let start = 0;
  const re = /\n[ \t]*\n/g;
  while ((m = re.exec(text))) {
    if (inFence(m.index)) continue;
    paras.push([start, m.index]);
    start = m.index + m[0].length;
  }
  paras.push([start, text.length]);

  for (const [a, b] of paras) {
    const block = text.slice(a, b);
    if (block.trim() === "") continue;
    if (block.length <= 600 || inFence(a)) {
      chunks.push({ text: block, start: a, end: b });
      continue;
    }
    // Long block: split further at sentence ends.
    const sent = /(?<=[.!?])\s+/g;
    let s = a;
    let last = a;
    let m2: RegExpExecArray | null;
    const sub = text.slice(a, b);
    while ((m2 = sent.exec(sub))) {
      const abs = a + m2.index + m2[0].length;
      if (abs - last >= 300) {
        chunks.push({ text: text.slice(last, abs), start: last, end: abs });
        last = abs;
      }
      s = abs;
    }
    void s;
    if (last < b) chunks.push({ text: text.slice(last, b), start: last, end: b });
  }
  return chunks;
}
