/**
 * Keyword detection pipeline — three-pass architecture.
 *
 * Pass 1: Domain vocabulary lookup (synchronous, always runs, no network).
 *   Matches against a bundled JSON vocabulary of known technical terms
 *   across science, CS, mathematics, medicine, and economics domains.
 *
 * Pass 2: NER via `compromise` (synchronous, no model download).
 *   Flags named entities and noun phrases not caught by the vocabulary.
 *   Common English words are filtered through a stopword list.
 *
 * Pass 3: Optional LLM confirmation (async, requires API key).
 *   Sends a batch of candidates to the LLM and asks which are
 *   genuinely technical. Disabled by default; used when the user
 *   enables "high-precision mode" in settings.
 *
 * Results are deduplicated by normalized form (lowercased, trimmed).
 */

import nlp from "compromise";
import vocabulary from "./vocabulary.json";
import stopwords from "./stopwords.json";

export interface DetectedKeyword {
  term: string;             // canonical form (original casing from first occurrence)
  normalizedTerm: string;   // lowercased for dedup / cache keys
  sourcePass: 1 | 2 | 3;
  confidence: number;       // 0.0–1.0
}

interface PipelineOptions {
  enableLLMPass?: boolean;
  llmConfirmFn?: (candidates: string[]) => Promise<string[]>; // returns confirmed terms
}

const vocabSet = new Set<string>(
  (vocabulary as string[]).map((t) => t.toLowerCase())
);
const stopSet = new Set<string>(
  (stopwords as string[]).map((t) => t.toLowerCase())
);

function normalize(term: string): string {
  return term.toLowerCase().trim().replace(/\s+/g, " ");
}

function isStopword(term: string): boolean {
  return stopSet.has(normalize(term));
}

// Pass 1: vocabulary lookup
function pass1(text: string): DetectedKeyword[] {
  const found: DetectedKeyword[] = [];
  const lower = text.toLowerCase();

  for (const entry of vocabSet) {
    // Match whole-word occurrences
    const re = new RegExp(`\\b${entry.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi");
    const match = re.exec(lower);
    if (match) {
      const originalCase = text.slice(match.index, match.index + entry.length);
      found.push({
        term: originalCase,
        normalizedTerm: normalize(entry),
        sourcePass: 1,
        confidence: 0.95,
      });
    }
  }
  return found;
}

// Pass 2: compromise NER
function pass2(text: string, existingNorms: Set<string>): DetectedKeyword[] {
  const doc = nlp(text);
  const candidates: DetectedKeyword[] = [];

  // Noun phrases and topics
  doc.nouns().out("array").forEach((phrase: string) => {
    const norm = normalize(phrase);
    if (
      norm.length > 3 &&
      !isStopword(norm) &&
      !existingNorms.has(norm) &&
      /[a-z]{2,}/.test(norm)  // at least some alphabetic content
    ) {
      candidates.push({
        term: phrase.trim(),
        normalizedTerm: norm,
        sourcePass: 2,
        confidence: 0.6,
      });
    }
  });

  return candidates;
}

// Pass 3: LLM confirmation (optional)
async function pass3(
  candidates: DetectedKeyword[],
  confirmFn: (terms: string[]) => Promise<string[]>
): Promise<DetectedKeyword[]> {
  if (candidates.length === 0) return [];
  const terms = candidates.map((c) => c.term);
  const confirmed = new Set(await confirmFn(terms));
  return candidates
    .filter((c) => confirmed.has(c.term))
    .map((c) => ({ ...c, sourcePass: 3 as const, confidence: 0.9 }));
}

// Deduplication preserving first-occurrence canonical casing
function deduplicate(keywords: DetectedKeyword[]): DetectedKeyword[] {
  const seen = new Map<string, DetectedKeyword>();
  for (const kw of keywords) {
    if (!seen.has(kw.normalizedTerm)) {
      seen.set(kw.normalizedTerm, kw);
    }
  }
  return Array.from(seen.values());
}

export async function detectKeywords(
  text: string,
  options: PipelineOptions = {}
): Promise<DetectedKeyword[]> {
  const p1 = pass1(text);
  const p1Norms = new Set(p1.map((k) => k.normalizedTerm));

  const p2Raw = pass2(text, p1Norms);
  const allNorms = new Set([...p1Norms, ...p2Raw.map((k) => k.normalizedTerm)]);

  let p2Final = p2Raw;
  if (options.enableLLMPass && options.llmConfirmFn) {
    p2Final = await pass3(p2Raw, options.llmConfirmFn);
  }

  return deduplicate([...p1, ...p2Final]);
}
