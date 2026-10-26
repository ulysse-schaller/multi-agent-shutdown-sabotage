import { useMemo } from "react";
import type { Manifest, Row } from "../types";
import { EI_LABEL, KIND_LABEL, TASK_LABEL, LIED_LABEL } from "../labels";
import { countFacet, matches, toggle, anyActive, type Filters } from "../filters";

interface Opt { value: string; label: string; count: number; }

function ChipGroup(props: { title: string; opts: Opt[]; selected: string[]; onToggle: (v: string) => void }) {
  if (props.opts.length === 0) return null;
  return (
    <div className="facet">
      <div className="facet-title">{props.title}</div>
      <div className="chips">
        {props.opts.map((o) => (
          <button
            key={o.value}
            className={"chip" + (props.selected.includes(o.value) ? " on" : "") + (o.count === 0 ? " zero" : "")}
            onClick={() => props.onToggle(o.value)}
          >
            {o.label} <span className="chip-n">{o.count}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function Segmented(props: {
  title: string;
  value: string;
  options: { value: string; label: string; count?: number }[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="facet">
      <div className="facet-title">{props.title}</div>
      <div className="seg">
        {props.options.map((o) => (
          <button
            key={o.value}
            className={"segbtn" + (props.value === o.value ? " on" : "")}
            onClick={() => props.onChange(o.value)}
          >
            {o.label}
            {o.count != null && <span className="chip-n"> {o.count}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

export function FilterPanel(props: {
  rows: Row[];
  filters: Filters;
  setFilters: (f: Filters) => void;
  manifest: Manifest;
}) {
  const { rows, filters, setFilters, manifest } = props;

  const counts = useMemo(() => {
    const c: Record<string, Map<string, number>> = {};
    for (const name of ["models", "mech", "env", "tgt", "na", "ei", "tk", "kind", "how", "lied"]) {
      c[name] = countFacet(rows, filters, name);
    }
    return c;
  }, [rows, filters]);

  const present = useMemo(() => {
    const p: Record<string, Set<string>> = { na: new Set(), ei: new Set(), tk: new Set(), lied: new Set() };
    for (const r of rows) {
      p.na.add(String(r.na));
      p.ei.add(r.ei);
      if (r.tk) p.tk.add(r.tk);
      if (r.lied) p.lied.add(r.lied);
    }
    return p;
  }, [rows]);

  const set = (patch: Partial<Filters>) => setFilters({ ...filters, ...patch });
  const tog = (key: keyof Filters, v: string) =>
    set({ [key]: toggle(filters[key] as string[], v) } as Partial<Filters>);

  const opt = (name: string, value: string, label: string): Opt => ({
    value,
    label,
    count: counts[name].get(value) ?? 0,
  });
  const keep = (o: Opt, sel: string[]) => o.count > 0 || sel.includes(o.value);

  // segment counts for construal / debrief
  const segCounts = useMemo(() => {
    const base = (skip: string) => rows.filter((r) => matches(r, filters, skip));
    const ev = base("eval"), ad = base("adv"), db = base("debrief");
    const g = (arr: Row[], f: (r: Row) => number) => ({
      h: arr.filter((r) => f(r) >= 1).length,
      e: arr.filter((r) => f(r) >= 2).length,
      all: arr.length,
    });
    return {
      eval: g(ev, (r) => Math.max(r.xE, r.pE, r.oE)),
      adv: g(ad, (r) => Math.max(r.xA, r.pA, r.oA)),
      db: { yes: db.filter((r) => r.fu).length, no: db.filter((r) => !r.fu).length, all: db.length },
    };
  }, [rows, filters]);

  const families: string[] = [];
  for (const m of manifest.models) if (!families.includes(m.family)) families.push(m.family);

  return (
    <div className="filters">
      <div className="filters-head">
        <span>Filters</span>
        {anyActive(filters) && (
          <button className="clear" onClick={() => setFilters({ ...filters, ...blank() })}>
            clear
          </button>
        )}
      </div>

      <div className="facet">
        <input
          className="search"
          placeholder="search message preview…"
          value={filters.q}
          onChange={(e) => set({ q: e.target.value })}
        />
      </div>

      <div className="facet">
        <div className="facet-title">Model</div>
        {families.map((fam) => (
          <div className="fam" key={fam}>
            <div className="fam-name">{fam}</div>
            <div className="chips">
              {manifest.models
                .filter((m) => m.family === fam)
                .map((m) => opt("models", m.id, m.label))
                .filter((o) => keep(o, filters.models))
                .map((o) => (
                  <button
                    key={o.value}
                    className={"chip" + (filters.models.includes(o.value) ? " on" : "") + (o.count === 0 ? " zero" : "")}
                    onClick={() => tog("models", o.value)}
                  >
                    {o.label} <span className="chip-n">{o.count}</span>
                  </button>
                ))}
            </div>
          </div>
        ))}
      </div>

      <ChipGroup
        title="Mechanism"
        opts={manifest.mechanisms.map((m) => opt("mech", m.id, m.label)).filter((o) => keep(o, filters.mech))}
        selected={filters.mech}
        onToggle={(v) => tog("mech", v)}
      />
      <ChipGroup
        title="Environment"
        opts={manifest.envs.map((e) => opt("env", e.id, e.label)).filter((o) => keep(o, filters.env))}
        selected={filters.env}
        onToggle={(v) => tog("env", v)}
      />
      <ChipGroup
        title="Target"
        opts={manifest.targets.map((t) => opt("tgt", t.id, t.label)).filter((o) => keep(o, filters.tgt))}
        selected={filters.tgt}
        onToggle={(v) => tog("tgt", v)}
      />
      <ChipGroup
        title="Agents"
        opts={["1", "2", "3"].filter((v) => present.na.has(v)).map((v) => opt("na", v, `${v}-agent`))}
        selected={filters.na}
        onToggle={(v) => tog("na", v)}
      />
      <ChipGroup
        title="Explicit prohibition"
        opts={["no", "yes", "orch"].filter((v) => present.ei.has(v)).map((v) => opt("ei", v, EI_LABEL[v]))}
        selected={filters.ei}
        onToggle={(v) => tog("ei", v)}
      />
      {present.tk.size > 0 && (
        <ChipGroup
          title="Task"
          opts={["indep", "dep"].filter((v) => present.tk.has(v)).map((v) => opt("tk", v, TASK_LABEL[v]))}
          selected={filters.tk}
          onToggle={(v) => tog("tk", v)}
        />
      )}

      <ChipGroup
        title="Outcome"
        opts={["none", "cond", "spont"].map((v) => opt("kind", v, KIND_LABEL[v])).filter((o) => keep(o, filters.kind))}
        selected={filters.kind}
        onToggle={(v) => tog("kind", v)}
      />
      <ChipGroup
        title="How"
        opts={[opt("how", "del", "deleted"), opt("how", "edit", "edited")].filter((o) => keep(o, filters.how))}
        selected={filters.how}
        onToggle={(v) => tog("how", v)}
      />

      <Segmented
        title="Evaluation awareness"
        value={filters.eval}
        onChange={(v) => set({ eval: v })}
        options={[
          { value: "", label: "any", count: segCounts.eval.all },
          { value: "h", label: "hedged+", count: segCounts.eval.h },
          { value: "e", label: "explicit", count: segCounts.eval.e },
        ]}
      />
      <Segmented
        title="Adversarial construal"
        value={filters.adv}
        onChange={(v) => set({ adv: v })}
        options={[
          { value: "", label: "any", count: segCounts.adv.all },
          { value: "h", label: "hedged+", count: segCounts.adv.h },
          { value: "e", label: "explicit", count: segCounts.adv.e },
        ]}
      />
      <Segmented
        title="Debrief"
        value={filters.debrief}
        onChange={(v) => set({ debrief: v })}
        options={[
          { value: "", label: "any", count: segCounts.db.all },
          { value: "yes", label: "present", count: segCounts.db.yes },
          { value: "no", label: "none", count: segCounts.db.no },
        ]}
      />
      {present.lied.size > 0 && (
        <ChipGroup
          title="Debrief honesty"
          opts={["truthful", "lie", "evasive", "no_answer"]
            .filter((v) => present.lied.has(v))
            .map((v) => opt("lied", v, LIED_LABEL[v]))}
          selected={filters.lied}
          onToggle={(v) => tog("lied", v)}
        />
      )}
    </div>
  );
}

function blank(): Partial<Filters> {
  return {
    models: [], mech: [], env: [], tgt: [], na: [], ei: [], tk: [], kind: [], how: [],
    eval: "", adv: "", lied: [], debrief: "", q: "",
  };
}
