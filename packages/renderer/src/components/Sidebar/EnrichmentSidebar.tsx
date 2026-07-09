/**
 * EnrichmentSidebar — shows Wikipedia, arXiv, and LLM explanations for a keyword.
 * Slides in from the right when a highlighted transcript keyword is clicked.
 */

import React, { useEffect, useState } from "react";
import { enrichKeyword, type KeywordEnrichment } from "../../services/enrichment";
import type { LLMConfig } from "../../services/llm";

interface Props {
  term:            string;
  contextSnippet:  string;
  llmConfig:       LLMConfig | null;
  onClose:         () => void;
  onAddToBin:      (concept: string) => void;
}

export function EnrichmentSidebar({ term, contextSnippet, llmConfig, onClose, onAddToBin }: Props) {
  const [data,   setData]   = useState<KeywordEnrichment | null>(null);
  const [status, setStatus] = useState<"loading" | "done" | "error">("loading");

  useEffect(() => {
    setData(null);
    setStatus("loading");
    enrichKeyword(term, contextSnippet, llmConfig)
      .then((d) => { setData(d); setStatus("done"); })
      .catch(() => setStatus("error"));
  }, [term, contextSnippet, llmConfig]);

  return (
    <div className="enrich-sidebar" role="complementary" aria-label={`Enrichment for ${term}`}>
      <div className="enrich-header">
        <h2 className="enrich-term">{term}</h2>
        <button className="enrich-close" onClick={onClose} aria-label="Close">✕</button>
      </div>

      {status === "loading" && (
        <div className="enrich-loading">
          <div className="transcript-spinner" />
          <p>Fetching Wikipedia, arXiv, and AI explanation…</p>
        </div>
      )}

      {status === "error" && (
        <p className="enrich-error">Could not load enrichment. Check your network connection.</p>
      )}

      {status === "done" && data && (
        <div className="enrich-body">

          {/* LLM explanation */}
          {data.llm && (
            <section className="enrich-section">
              <h3 className="enrich-section-title">Plain-English</h3>
              <p className="enrich-llm-text">{data.llm.beginner}</p>
              {data.llm.whyItMatters && (
                <p className="enrich-why"><em>Why it matters:</em> {data.llm.whyItMatters}</p>
              )}
            </section>
          )}

          {/* Wikipedia */}
          {data.wikipedia && (
            <section className="enrich-section">
              <h3 className="enrich-section-title">
                Wikipedia
                <a
                  className="enrich-ext-link"
                  href={data.wikipedia.url}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Open Wikipedia article"
                >↗</a>
              </h3>
              <p className="enrich-wiki-summary">{data.wikipedia.summary}</p>
            </section>
          )}

          {!data.llm && !data.wikipedia && (
            <p className="enrich-empty">No background found for "{term}".</p>
          )}

          {/* arXiv papers */}
          {data.arxiv.length > 0 && (
            <section className="enrich-section">
              <h3 className="enrich-section-title">arXiv papers</h3>
              <ul className="enrich-arxiv-list">
                {data.arxiv.map((p) => (
                  <li key={p.id} className="enrich-arxiv-item">
                    <a
                      className="enrich-arxiv-title"
                      href={p.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {p.title}
                    </a>
                    <span className="enrich-arxiv-meta">
                      {p.authors.slice(0, 2).join(", ")}
                      {p.authors.length > 2 ? " et al." : ""} · {p.year}
                    </span>
                    <p className="enrich-arxiv-abstract">{p.abstract}</p>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Add-to-bin CTA */}
          <div className="enrich-footer">
            <button
              className="enrich-add-bin-btn"
              onClick={() => onAddToBin(term)}
            >
              + Add to knowledge bins
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
