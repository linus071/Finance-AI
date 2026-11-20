// Embedding-based categorization: the "RAG" part of the project.
//
// 1. Turn a merchant name into a vector with a LOCAL model (Ollama + nomic-embed-text).
// 2. Compare it (cosine similarity) against vectors we already know the answer for:
//      - merchants YOU categorized (manual or rule): the best evidence
//      - the seed descriptions in categories.ts: a fallback before you've taught it anything
// 3. Take the closest match if it's similar enough; otherwise leave it for a human/LLM.
//
// The more you correct, the better it gets. That's retrieval doing real work.

import type { Db } from '../db.js';
import { CATEGORIES } from './categories.js';

const OLLAMA_URL = process.env.OLLAMA_URL ?? 'http://localhost:11434';
const MODEL = process.env.EMBED_MODEL ?? 'nomic-embed-text';
// nomic-embed-text expects a task prefix; use the same one for every text so they're comparable.
const PREFIX = 'classification: ';

/** Embed many texts at once, using the SQLite cache for ones seen before. */
export async function embed(db: Db, texts: string[]): Promise<Float32Array[]> {
  const get = db.prepare('SELECT vector FROM embeddings WHERE text = ? AND model = ?');
  const put = db.prepare('INSERT OR REPLACE INTO embeddings (text, model, vector) VALUES (?, ?, ?)');

  const result = new Map<string, Float32Array>();
  const missing: string[] = [];
  for (const t of new Set(texts)) {
    const row = get.get(t, MODEL) as { vector: Uint8Array } | undefined;
    // .slice() copies into a fresh, 4-byte-aligned buffer that Float32Array can view
    if (row) result.set(t, new Float32Array(row.vector.slice().buffer));
    else missing.push(t);
  }

  for (let i = 0; i < missing.length; i += 64) {
    const batch = missing.slice(i, i + 64);
    let res: Response;
    try {
      res = await fetch(`${OLLAMA_URL}/api/embed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: MODEL, input: batch.map((t) => PREFIX + t) }),
      });
    } catch {
      throw new Error(`Can't reach Ollama at ${OLLAMA_URL}. Start it, and run: ollama pull ${MODEL}`);
    }
    if (!res.ok) throw new Error(`Ollama embed failed (${res.status}): ${await res.text()}`);
    const { embeddings } = (await res.json()) as { embeddings: number[][] };
    batch.forEach((t, j) => {
      const v = new Float32Array(embeddings[j]!);
      result.set(t, v);
      put.run(t, MODEL, new Uint8Array(v.buffer));
    });
  }
  return texts.map((t) => result.get(t)!);
}

export function cosine(a: Float32Array, b: Float32Array): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

export interface Suggestion {
  merchant: string;
  category: string | null;
  score: number;
  basis: string; // which known example it matched
}

/**
 * Suggest a category for every uncategorized merchant. With apply=true, writes
 * suggestions scoring >= minScore (category_source='embedding', so a rule or a
 * manual correction can still override them later).
 */
export async function autoCategorize(db: Db, opts: { apply: boolean; minScore?: number }) {
  const minScore = opts.minScore ?? 0.7;

  const pending = (db.prepare(
    `SELECT DISTINCT merchant FROM transactions WHERE category IS NULL`,
  ).all() as { merchant: string }[]).map((r) => r.merchant);
  if (pending.length === 0) return { suggestions: [] as Suggestion[], applied: 0 };

  // Known examples: your labeled merchants + the seed descriptions.
  const labeled = db.prepare(
    `SELECT merchant, category FROM transactions
     WHERE category_source IN ('manual', 'rule') GROUP BY merchant, category`,
  ).all() as { merchant: string; category: string }[];
  const examples = [
    ...labeled.map((l) => ({ text: l.merchant, category: l.category, basis: `you labeled "${l.merchant}"` })),
    ...Object.entries(CATEGORIES).map(([category, desc]) => ({ text: `${category}: ${desc}`, category, basis: `seed "${category}"` })),
  ];

  const [exampleVecs, pendingVecs] = [
    await embed(db, examples.map((e) => e.text)),
    await embed(db, pending),
  ];

  const suggestions: Suggestion[] = pending.map((merchant, i) => {
    let best = { score: -1, idx: -1 };
    exampleVecs.forEach((v, j) => {
      const s = cosine(pendingVecs[i]!, v);
      if (s > best.score) best = { score: s, idx: j };
    });
    const ex = examples[best.idx]!;
    return {
      merchant,
      category: best.score >= minScore ? ex.category : null,
      score: Math.round(best.score * 1000) / 1000,
      basis: ex.basis,
    };
  });

  let applied = 0;
  if (opts.apply) {
    const update = db.prepare(
      `UPDATE transactions SET category = ?, category_source = 'embedding'
       WHERE merchant = ? AND category IS NULL`,
    );
    for (const s of suggestions) if (s.category) applied += Number(update.run(s.category, s.merchant).changes);
  }
  return { suggestions, applied };
}
