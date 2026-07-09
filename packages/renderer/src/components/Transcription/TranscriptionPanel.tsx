/**
 * TranscriptionPanel — shows transcript segments, synced to playhead.
 * Clicking a segment seeks the video to that timestamp.
 * Detected keywords are underlined; clicking them opens the enrichment sidebar.
 */

import React, { useEffect, useRef } from "react";
import type { TranscriptSegment } from "../../services/transcription";

interface Props {
  segments:       TranscriptSegment[];
  currentMs:      number;
  keywords:       string[];              // detected keyword terms (normalised)
  onSeek:         (ms: number) => void;
  onKeywordClick: (term: string, contextSnippet: string) => void;
  isTranscribing: boolean;
  transcribeProgress: { percent: number; stage: string } | null;
  onRequestTranscribe: () => void;
}

function highlightKeywords(text: string, keywords: string[]): React.ReactNode[] {
  if (keywords.length === 0) return [text];
  const pattern = new RegExp(
    `(${keywords.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`,
    "gi"
  );
  const parts = text.split(pattern);
  return parts.map((part, i) =>
    keywords.some((k) => k.toLowerCase() === part.toLowerCase())
      ? <mark key={i} className="kw-mark">{part}</mark>
      : part
  );
}

export function TranscriptionPanel({
  segments, currentMs, keywords,
  onSeek, onKeywordClick,
  isTranscribing, transcribeProgress, onRequestTranscribe,
}: Props) {
  const activeRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll to active segment
  useEffect(() => {
    activeRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [currentMs]);

  const activeIndex = segments.findIndex(
    (s) => currentMs >= s.startMs && currentMs <= s.endMs
  );

  const handleMarkClick = (e: React.MouseEvent, text: string, segment: TranscriptSegment) => {
    e.stopPropagation();
    const term = (e.target as HTMLElement).textContent ?? "";
    const ctx  = segments.slice(Math.max(0, segments.indexOf(segment) - 2),
                               segments.indexOf(segment) + 3)
                         .map((s) => s.text).join(" ");
    onKeywordClick(term, ctx);
  };

  if (segments.length === 0) {
    return (
      <div className="transcript-empty">
        {isTranscribing ? (
          <div className="transcript-progress">
            <div className="transcript-spinner" />
            <p className="transcript-stage">{transcribeProgress?.stage ?? "Transcribing…"}</p>
            {(transcribeProgress?.percent ?? 0) > 0 && (
              <div className="transcript-bar">
                <div
                  className="transcript-bar-fill"
                  style={{ width: `${transcribeProgress!.percent}%` }}
                />
              </div>
            )}
          </div>
        ) : (
          <div className="transcript-empty-msg">
            <p>No transcript yet.</p>
            <button className="transcript-btn" onClick={onRequestTranscribe}>
              Generate transcript
            </button>
            <p className="transcript-hint">
              Uses on-device Whisper (free, private) or OpenAI cloud if configured in Settings.
            </p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="transcript-panel" role="log" aria-label="Transcript">
      {segments.map((seg, i) => {
        const isActive = i === activeIndex;
        return (
          <div
            key={seg.startMs}
            ref={isActive ? activeRef : null}
            className={`transcript-seg ${isActive ? "transcript-seg--active" : ""}`}
            onClick={() => onSeek(seg.startMs)}
            role="button"
            tabIndex={0}
            aria-label={`${msToTs(seg.startMs)}: ${seg.text}`}
            onKeyDown={(e) => e.key === "Enter" && onSeek(seg.startMs)}
          >
            <span className="transcript-ts">{msToTs(seg.startMs)}</span>
            <span className="transcript-text">
              {highlightKeywords(seg.text, keywords).map((node, j) =>
                typeof node === "string" ? node : React.cloneElement(node as React.ReactElement, {
                  onClick: (e: React.MouseEvent) => handleMarkClick(e, seg.text, seg),
                })
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function msToTs(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0
    ? `${pad(h)}:${pad(m % 60)}:${pad(s % 60)}`
    : `${pad(m)}:${pad(s % 60)}`;
}
