// Data fetching. All URLs are relative to BASE_URL so the site works from any
// sub-path; every fetch is memoised by its promise. Data files are gzip-compressed
// (to fit GitHub Pages' size limit) and decompressed in the browser.
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

// Fetch JSON that may be gzip-compressed. We detect the gzip magic bytes so the
// same helper works whether the server returns the raw .gz (the normal case) or
// has already transparently decompressed it via Content-Encoding.
async function getJSON<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  const buf = new Uint8Array(await r.arrayBuffer());
  let text: string;
  if (buf.length >= 2 && buf[0] === 0x1f && buf[1] === 0x8b) {
    const stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream("gzip"));
    text = await new Response(stream).text();
  } else {
    text = new TextDecoder().decode(buf);
  }
  return JSON.parse(text) as T;
}

let manifestP: Promise<Manifest> | null = null;
export function fetchManifest(): Promise<Manifest> {
  if (!manifestP) manifestP = getJSON<Manifest>(DATA + "manifest.json");
  return manifestP;
}

const indexCache = cached<string, Row[]>();
export function fetchIndex(study: string): Promise<Row[]> {
  return indexCache(study, () => getJSON<Row[]>(`${DATA}index/${study}.json.gz`));
}

const sampleCache = cached<string, Sample>();
export function fetchSample(id: string): Promise<Sample> {
  return sampleCache(id, () => getJSON<Sample>(`${DATA}samples/${id.slice(0, 2)}/${id}.json.gz`));
}

const searchCache = cached<string, Record<string, string>>();
export function fetchSearch(study: string, shards: string[]): Promise<Record<string, string>> {
  return searchCache(study, async () => {
    const maps = await Promise.all(
      shards.map((k) => getJSON<Record<string, string>>(`${DATA}search/${study}/${k}.json.gz`)),
    );
    return Object.assign({}, ...maps) as Record<string, string>;
  });
}
