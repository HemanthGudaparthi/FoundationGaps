/**
 * StickyNoteOverlay
 *
 * Renders sticky note cards over the video player when the playhead
 * enters the ±2-second window around a note's timestamp.
 * Multiple notes in the same window cycle every 3 seconds.
 * Can be toggled via the player toolbar.
 */

import React, { useEffect, useRef, useState } from "react";
import type { Note } from "@contextlens/shared/ipc-types";

interface Props {
  notes: Note[];
  currentMs: number;
  visible: boolean;
}

const WINDOW_MS   = 2_000;   // show note when playhead is ±2 s from timestamp
const CYCLE_MS    = 3_000;   // cycle between stacked notes every 3 s
const PREVIEW_LEN = 120;     // max characters shown before "…"

function notesInWindow(notes: Note[], currentMs: number): Note[] {
  return notes.filter(
    (n) => Math.abs(n.timestampMs - currentMs) <= WINDOW_MS
  );
}

function formatTimestamp(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

export function StickyNoteOverlay({ notes, currentMs, visible }: Props) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const cycleRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const active = notesInWindow(notes, currentMs);

  // Reset cycle when the set of visible notes changes
  useEffect(() => {
    setActiveIndex(0);
    setExpanded(false);
    if (cycleRef.current) clearInterval(cycleRef.current);
    if (active.length > 1) {
      cycleRef.current = setInterval(() => {
        setActiveIndex((i) => (i + 1) % active.length);
        setExpanded(false);
      }, CYCLE_MS);
    }
    return () => {
      if (cycleRef.current) clearInterval(cycleRef.current);
    };
  }, [active.map((n) => n.id).join(",")]);

  if (!visible || active.length === 0) return null;

  const note = active[activeIndex];
  const preview = note.text.slice(0, PREVIEW_LEN);
  const truncated = note.text.length > PREVIEW_LEN;

  return (
    <div
      className="sticky-note-overlay"
      role="note"
      aria-label={`Sticky note at ${formatTimestamp(note.timestampMs)}`}
    >
      {/* Paper texture card */}
      <div className="sticky-note-card">
        <div className="sticky-note-header">
          <span className="sticky-note-timestamp">
            {formatTimestamp(note.timestampMs)}
          </span>
          {active.length > 1 && (
            <span className="sticky-note-counter">
              {activeIndex + 1} / {active.length}
            </span>
          )}
        </div>

        <p className="sticky-note-text">
          {expanded ? note.text : preview}
          {truncated && !expanded && (
            <button
              className="sticky-note-expand"
              onClick={() => setExpanded(true)}
              aria-label="Expand note"
            >
              …
            </button>
          )}
        </p>
      </div>
    </div>
  );
}
