import { useEffect, useRef, useState } from "react";
import type { Row } from "../types";
import type { LabelMaps } from "../labels";
import { INIT_LABEL } from "../labels";

const PAGE = 200;

function OutcomeBadges(props: { r: Row }) {
  const { r } = props;
  return (
    <span className="row-badges">
      {r.sab ? (
        <>
          <span className="badge b-sab">sabotaged</span>
          <span className="badge b-init" title={"initiated by " + (INIT_LABEL[r.init] ?? "?")}>by {r.init}</span>
        </>
      ) : (
        <span className="badge b-safe">intact</span>
      )}
      {r.del ? <span className="badge b-del">del</span> : null}
      {!r.del && r.mod ? <span className="badge b-edit">edit</span> : null}
      {Math.max(r.xE, r.pE, r.oE) >= 1 ? <span className="badge b-eval" title="evaluation awareness">E</span> : null}
      {Math.max(r.xA, r.pA, r.oA) >= 1 ? <span className="badge b-adv" title="adversarial construal">A</span> : null}
    </span>
  );
}

export function SampleList(props: {
  rows: Row[];
  selected: string | null;
  onSelect: (id: string) => void;
  labels: LabelMaps;
}) {
  const { rows, selected, onSelect, labels } = props;
  const [limit, setLimit] = useState(PAGE);
  const selRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    setLimit(PAGE);
  }, [rows]);

  // ensure the selected row is rendered and visible
  useEffect(() => {
    const idx = rows.findIndex((r) => r.id === selected);
    if (idx >= 0 && idx + 1 > limit) setLimit(Math.ceil((idx + 1) / PAGE) * PAGE);
  }, [selected, rows, limit]);

  useEffect(() => {
    if (selRef.current) selRef.current.scrollIntoView({ block: "nearest" });
  }, [selected]);

  const shown = rows.slice(0, limit);
  return (
    <div className="list">
      <div className="list-count">{rows.length.toLocaleString()} rollouts</div>
      <div className="list-rows">
        {shown.map((r) => (
          <button
            key={r.id}
            ref={r.id === selected ? selRef : undefined}
            className={"row" + (r.id === selected ? " sel" : "")}
            onClick={() => onSelect(r.id)}
          >
            <div className="row-top">
              <span className="row-model">{labels.model[r.m] ?? r.m}</span>
              <OutcomeBadges r={r} />
            </div>
            <div className="row-meta">
              {labels.mech[r.mech]} · {labels.env[r.env]} · {labels.target[r.tgt]} · ep {r.ep}
            </div>
            {r.prev && <div className="row-prev">{r.prev}</div>}
          </button>
        ))}
      </div>
      {limit < rows.length && (
        <button className="more" onClick={() => setLimit(limit + PAGE)}>
          show {Math.min(PAGE, rows.length - limit)} more
        </button>
      )}
    </div>
  );
}
