/**
 * BinPrompt — surfaces the next knowledge gap to the user.
 *
 * When the system detects the lowest-numbered empty bin, this component
 * renders a prompt card asking the user to engage with that concept.
 *
 * Three actions:
 *   Fill    — user writes their understanding in a textarea → bin becomes "filled"
 *   Read    — opens the Wikipedia/arXiv card for the concept in the sidebar
 *   Skip    — marks the bin "deferred", moves to the next lowest gap
 */

import React, { useState } from "react";
import type { Bin } from "./FundamentalBins";

interface Props {
  bin: Bin;
  suggestedReadUrl?: string;   // Wikipedia or arXiv link for this concept
  onFill:  (binIndex: number, note: string) => void;
  onRead:  (binIndex: number) => void;
  onSkip:  (binIndex: number) => void;
  onDismiss: () => void;
}

const MIN_CHARS = 20;  // minimum note length before Fill is enabled

export function BinPrompt({ bin, suggestedReadUrl, onFill, onRead, onSkip, onDismiss }: Props) {
  const [note, setNote] = useState("");
  const canFill = note.trim().length >= MIN_CHARS;

  return (
    <div className="bin-prompt" role="dialog" aria-modal="false"
         aria-label={`Knowledge gap: ${bin.concept}`}>

      <div className="bin-prompt-header">
        <span className="bin-prompt-index">Bin {bin.index}</span>
        <button className="bin-prompt-dismiss" onClick={onDismiss} aria-label="Close prompt">✕</button>
      </div>

      <h3 className="bin-prompt-concept">{bin.concept}</h3>

      <p className="bin-prompt-question">
        What do you know about <strong>{bin.concept}</strong>?
        Write a brief explanation in your own words to fill this bin.
      </p>

      <textarea
        className="bin-prompt-textarea"
        placeholder={`Explain "${bin.concept}" in your own words…`}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={4}
        aria-label={`Your explanation of ${bin.concept}`}
      />

      <div className="bin-prompt-char-hint" aria-live="polite">
        {note.trim().length < MIN_CHARS
          ? `${MIN_CHARS - note.trim().length} more characters to fill this bin`
          : "Ready to fill ✓"}
      </div>

      <div className="bin-prompt-actions">
        <button
          className="bin-prompt-btn bin-prompt-btn--fill"
          disabled={!canFill}
          onClick={() => onFill(bin.index, note.trim())}
        >
          Fill this bin
        </button>

        {suggestedReadUrl && (
          <button
            className="bin-prompt-btn bin-prompt-btn--read"
            onClick={() => onRead(bin.index)}
          >
            Read about it first →
          </button>
        )}

        <button
          className="bin-prompt-btn bin-prompt-btn--skip"
          onClick={() => onSkip(bin.index)}
        >
          Come back later
        </button>
      </div>
    </div>
  );
}
