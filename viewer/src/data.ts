// Data fetching. All URLs are relative to BASE_URL so the site works from any
// sub-path; every fetch is memoised by its promise.
import type { Manifest, Row, Sample } from "./types";

const BASE = import.meta.env.BASE_URL; // e.g. "./" or "/repo/"
const DATA = BASE + "data/";

function cached<K, V>() {
  const map = new Map<K, Promise<V>>();
  return (key: K, make: () => Promise<V>) => {
    let p = map.get(key);
    if (!p) {
      p = make();
      map.set(key, p);
    }
    return p;
  };
}

async function getJSON<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json() as Promise<T>;
}

let manifestP: Promise<Manifest> | null = null;
export function fetchManifest(): Promise<Manifest> {
  if (!manifestP) manifestP = getJSON<Manifest>(DATA + "manifest.json");
  return manifestP;
}

const indexCache = cached<string, Row[]>();
export function fetchIndex(study: string): Promise<Row[]> {
  return indexCache(study, () => getJSON<Row[]>(`${DATA}index/${study}.json`));
}

const sampleCache = cached<string, Sample>();
export function fetchSample(row: { m: string; st: string; id: string }): Promise<Sample> {
  const short = row.m.split("/").pop();
  return sampleCache(row.id, () =>
    getJSON<Sample>(`${DATA}samples/${short}/${row.st}/${row.id}.json`),
  );
}
