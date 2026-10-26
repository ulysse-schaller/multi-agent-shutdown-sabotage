import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Manifest, Row, Sample } from "./types";
import { fetchManifest, fetchIndex, fetchSample } from "./data";
import { labelMaps } from "./labels";
import { parseHash, buildHash, matches, defaultFilters, defaultTgt, type Route } from "./filters";
import { FilterPanel } from "./components/FilterPanel";
import { SampleList } from "./components/SampleList";
import { SampleView } from "./components/SampleView";
import { About } from "./components/About";

function sortRows(rows: Row[], sort: string, nonce: number): Row[] {
  if (sort === "sabotage") {
    return [...rows].sort((a, b) => b.sab - a.sab || a.kind.localeCompare(b.kind));
  }
  if (sort === "eval") {
    const e = (r: Row) => Math.max(r.xE, r.pE, r.oE, r.xA, r.pA, r.oA);
    return [...rows].sort((a, b) => e(b) - e(a));
  }
  if (sort === "random") {
    // deterministic shuffle keyed by nonce so pagination is stable between renders
    return [...rows]
      .map((r, i) => [r, Math.sin((i + 1) * (nonce + 1) * 12.9898) * 43758.5453] as const)
      .map(([r, h]) => [r, h - Math.floor(h)] as const)
      .sort((a, b) => a[1] - b[1])
      .map(([r]) => r);
  }
  return rows;
}

export default function App() {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [route, setRoute] = useState<Route | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [indexLoading, setIndexLoading] = useState(false);
  const [sample, setSample] = useState<Sample | null>(null);
  const [sampleLoading, setSampleLoading] = useState(false);
  const [nonce, setNonce] = useState(0);
  const [aboutOpen, setAboutOpen] = useState(false);
  const rowsRef = useRef<Row[]>([]);

  // --- manifest + hash bootstrap
  useEffect(() => {
    let onPop: (() => void) | null = null;
    fetchManifest().then((m) => {
      setManifest(m);
      const compute = (): Route => {
        const r = parseHash(location.hash);
        if (!r.study || !m.studies.some((s) => s.id === r.study)) r.study = m.studies[0].id;
        // A bare hash (no query) is a fresh visit: apply the study default,
        // which hides the control target. Any query string is taken verbatim.
        if (!location.hash.includes("?")) r.filters = defaultFilters(r.study);
        return r;
      };
      const first = compute();
      history.replaceState(null, "", buildHash(first));
      setRoute(first);
      onPop = () => setRoute(compute());
      window.addEventListener("popstate", onPop);
      window.addEventListener("hashchange", onPop);
    });
    return () => {
      if (onPop) {
        window.removeEventListener("popstate", onPop);
        window.removeEventListener("hashchange", onPop);
      }
    };
  }, []);

  const navigate = useCallback((next: Route, push = false) => {
    const hash = buildHash(next);
    if (push) history.pushState(null, "", hash);
    else history.replaceState(null, "", hash);
    setRoute(next);
  }, []);

  // --- load study index when study changes
  useEffect(() => {
    if (!route) return;
    let alive = true;
    setIndexLoading(true);
    fetchIndex(route.study).then((rs) => {
      if (!alive) return;
      rowsRef.current = rs;
      setRows(rs);
      setIndexLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [route?.study]);

  // --- load selected sample
  useEffect(() => {
    if (!route?.sample) {
      setSample(null);
      return;
    }
    const row = rows.find((r) => r.id === route.sample);
    if (!row) return; // index not ready yet
    let alive = true;
    setSampleLoading(true);
    fetchSample(row).then((s) => {
      if (alive) {
        setSample(s);
        setSampleLoading(false);
      }
    });
    return () => {
      alive = false;
    };
  }, [route?.sample, rows]);

  const labels = useMemo(() => (manifest ? labelMaps(manifest) : null), [manifest]);
  const filtered = useMemo(() => (route ? rows.filter((r) => matches(r, route.filters)) : []), [rows, route?.filters]);
  const sorted = useMemo(() => (route ? sortRows(filtered, route.sort, nonce) : []), [filtered, route?.sort, nonce]);

  const selectSample = useCallback(
    (id: string | null) => {
      if (!route) return;
      navigate({ ...route, sample: id }, true);
    },
    [route, navigate],
  );

  // --- keyboard j/k navigation + random
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (!route || sorted.length === 0) return;
      if (e.key === "j" || e.key === "k") {
        const i = sorted.findIndex((r) => r.id === route.sample);
        const ni = e.key === "j" ? Math.min(sorted.length - 1, i + 1) : Math.max(0, i - 1);
        const target = sorted[i < 0 ? 0 : ni];
        if (target) selectSample(target.id);
        e.preventDefault();
      } else if (e.key === "n") {
        selectSample(sorted[Math.floor(Math.random() * sorted.length)].id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [route, sorted, selectSample]);

  if (!manifest || !route || !labels) return <div className="boot">loading…</div>;

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <h1>Shutdown Sabotage</h1>
          <span className="subtitle">multi-agent trajectory browser</span>
        </div>
        <nav className="tabs">
          {manifest.studies.map((s) => (
            <button
              key={s.id}
              className={"tab" + (s.id === route.study ? " on" : "")}
              onClick={() => navigate({ study: s.id, filters: { ...route.filters, tgt: defaultTgt(s.id) }, sample: null, sort: route.sort })}
            >
              {s.label} <span className="tab-n">{s.count.toLocaleString()}</span>
            </button>
          ))}
        </nav>
        <div className="top-right">
          <select
            className="sort"
            value={route.sort}
            onChange={(e) => navigate({ ...route, sort: e.target.value })}
          >
            <option value="default">sort: default</option>
            <option value="sabotage">sort: sabotage first</option>
            <option value="eval">sort: construal first</option>
            <option value="random">sort: random</option>
          </select>
          {route.sort === "random" && (
            <button className="shuffle" onClick={() => setNonce((n) => n + 1)}>
              shuffle
            </button>
          )}
          <button className="about-btn" onClick={() => setAboutOpen(true)}>
            about
          </button>
        </div>
      </header>

      <div className="columns">
        <aside className="col-filters">
          <FilterPanel
            rows={rows}
            filters={route.filters}
            setFilters={(f) => navigate({ ...route, filters: f })}
            manifest={manifest}
            study={route.study}
            onClear={() => navigate({ ...route, filters: defaultFilters(route.study) })}
          />
        </aside>
        <section className="col-list">
          {indexLoading ? (
            <div className="list-loading">loading index…</div>
          ) : (
            <SampleList rows={sorted} selected={route.sample} onSelect={(id) => selectSample(id)} labels={labels} />
          )}
        </section>
        <section className="col-detail">
          <SampleView sample={sample} loading={sampleLoading} manifest={manifest} />
        </section>
      </div>

      {aboutOpen && <About manifest={manifest} onClose={() => setAboutOpen(false)} />}
    </div>
  );
}
