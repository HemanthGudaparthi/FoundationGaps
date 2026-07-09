/**
 * Enrichment service — fetches Wikipedia, arXiv, and LLM explanation per keyword.
 *
 * All results are cached in localStorage (24h TTL for Wikipedia/arXiv,
 * indefinite for LLM explanations since they don't expire).
 * On cache hit, no network call is made — fully offline after first fetch.
 */

import { explainTerm, type LLMConfig, type Explanation } from "./llm";

export interface ArxivPaper {
  id:       string;
  title:    string;
  authors:  string[];
  year:     number;
  abstract: string;
  url:      string;
}

export interface KeywordEnrichment {
  term:           string;
  wikipedia:      { summary: string; url: string } | null;
  arxiv:          ArxivPaper[];
  llm:            Explanation | null;
  enrichedAt:     number;   // Date.now()
}

const CACHE_KEY   = "epibins:enrichment:";
const TTL_MS      = 24 * 60 * 60 * 1000;  // 24 hours

function cacheGet(term: string): KeywordEnrichment | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY + term.toLowerCase());
    if (!raw) return null;
    const e: KeywordEnrichment = JSON.parse(raw);
    if (Date.now() - e.enrichedAt > TTL_MS) return null;  // expired
    return e;
  } catch { return null; }
}

function cacheSet(e: KeywordEnrichment): void {
  try {
    localStorage.setItem(CACHE_KEY + e.term.toLowerCase(), JSON.stringify(e));
  } catch { /* storage full — silently skip */ }
}

// ── Wikipedia ─────────────────────────────────────────────────────────────────

async function fetchWikipedia(term: string): Promise<{ summary: string; url: string } | null> {
  try {
    const encoded = encodeURIComponent(term.replace(/ /g, "_"));
    const res = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encoded}`,
      { headers: { Accept: "application/json" } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (data.type === "disambiguation" || !data.extract) return null;
    return {
      summary: data.extract.slice(0, 600),
      url:     data.content_urls?.desktop?.page ?? `https://en.wikipedia.org/wiki/${encoded}`,
    };
  } catch { return null; }
}

// ── arXiv ─────────────────────────────────────────────────────────────────────

// Polite rate limit: one request every 3 s as per arXiv API policy
let _lastArxivCall = 0;

async function fetchArxiv(term: string): Promise<ArxivPaper[]> {
  const wait = 3000 - (Date.now() - _lastArxivCall);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  _lastArxivCall = Date.now();

  try {
    const query = encodeURIComponent(`all:${term}`);
    const res   = await fetch(
      `https://export.arxiv.org/api/query?search_query=${query}&max_results=3&sortBy=relevance`,
      { headers: { Accept: "application/atom+xml" } }
    );
    if (!res.ok) return [];

    const xml    = await res.text();
    const parser = new DOMParser();
    const doc    = parser.parseFromString(xml, "application/xml");
    const entries = Array.from(doc.querySelectorAll("entry"));

    return entries.map((entry): ArxivPaper => {
      const id      = entry.querySelector("id")?.textContent ?? "";
      const title   = entry.querySelector("title")?.textContent?.trim().replace(/\s+/g, " ") ?? "";
      const summary = entry.querySelector("summary")?.textContent?.trim().slice(0, 400) ?? "";
      const authors = Array.from(entry.querySelectorAll("author name")).map((n) => n.textContent ?? "");
      const published = entry.querySelector("published")?.textContent ?? "";
      const year = parseInt(published.slice(0, 4), 10) || new Date().getFullYear();
      return { id, title, authors, year, abstract: summary, url: id };
    });
  } catch { return []; }
}

// ── Unified enrichment ────────────────────────────────────────────────────────

export async function enrichKeyword(
  term: string,
  contextSnippet: string,
  llmConfig: LLMConfig | null,
): Promise<KeywordEnrichment> {
  const cached = cacheGet(term);
  if (cached) return cached;

  const [wikipedia, arxiv, llm] = await Promise.allSettled([
    fetchWikipedia(term),
    fetchArxiv(term),
    llmConfig ? explainTerm(term, contextSnippet, llmConfig) : Promise.resolve(null),
  ]);

  const enrichment: KeywordEnrichment = {
    term,
    wikipedia: wikipedia.status === "fulfilled" ? wikipedia.value : null,
    arxiv:     arxiv.status     === "fulfilled" ? arxiv.value     : [],
    llm:       llm.status       === "fulfilled" ? llm.value       : null,
    enrichedAt: Date.now(),
  };

  cacheSet(enrichment);
  return enrichment;
}
