/**
 * TimelineMarkers
 *
 * Renders colored pip markers on the video seekbar for each user note.
 * Hover shows a tooltip with the first 60 chars of the note.
 * Click seeks to that timestamp.
 */

import React, { useState } from "react";
import type { Note } from "@contextlens/shared/ipc-types";

interface Props {
  notes: Note[];
  durationMs: number;
  onSeek: (ms: number) => void;
}

const TOOLTIP_LEN = 60;

export function TimelineMarkers({ notes, durationMs, onSeek }: Props) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  if (durationMs === 0) return null;

  return (
    <div className="timeline-markers" aria-hidden="true">
      {notes.map((note) => {
        const pct = (note.timestampMs / durationMs) * 100;
        const tooltip =
          note.text.length > TOOLTIP_LEN
            ? note.text.slice(0, TOOLTIP_LEN) + "…"
            : note.text;

        return (
          <button
            key={note.id}
            className="timeline-pip"
            style={{ left: `${pct}%` }}
            title={tooltip}
            aria-label={`Note at ${pct.toFixed(1)}%: ${tooltip}`}
            onMouseEnter={() => setHoveredId(note.id)}
            onMouseLeave={() => setHoveredId(null)}
            onClick={() => onSeek(note.timestampMs)}
          >
            {hoveredId === note.id && (
              <div className="timeline-pip-tooltip" role="tooltip">
                {tooltip}
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}
