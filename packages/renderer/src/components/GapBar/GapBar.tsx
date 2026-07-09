/**
 * GapBar
 *
 * 100-block understanding progress bar.
 * Each block is 1% of conceptual completeness for the session.
 * Filled blocks are clickable — opens list of keywords in that range.
 *
 * Computation: filledBlocks = round((understood / total) * 100), clamped [0,100].
 * When total === 0, renders empty with guidance message.
 */

import React, { useState } from "react";
import type { GapBarState } from "@contextlens/shared/ipc-types";

interface Props {
  state: GapBarState;
  onBlockClick?: (blockIndex: number) => void;
}

const TOTAL_BLOCKS = 100;

export function GapBar({ state, onBlockClick }: Props) {
  const [hoveredBlock, setHoveredBlock] = useState<number | null>(null);
  const { filledBlocks, understoodCount, totalKeywords } = state;

  if (totalKeywords === 0) {
    return (
      <div className="gap-bar-empty" role="status">
        <div className="gap-bar-label">Understanding</div>
        <div className="gap-bar-track gap-bar-track--empty">
          {Array.from({ length: TOTAL_BLOCKS }).map((_, i) => (
            <div key={i} className="gap-block gap-block--empty" />
          ))}
        </div>
        <p className="gap-bar-hint">
          No keywords detected yet. Play the video or import a transcript to begin.
        </p>
      </div>
    );
  }

  return (
    <div className="gap-bar" role="progressbar" aria-valuenow={filledBlocks} aria-valuemin={0} aria-valuemax={100}>
      <div className="gap-bar-header">
        <span className="gap-bar-label">Understanding</span>
        <span className="gap-bar-pct" aria-label={`${filledBlocks} percent complete`}>
          {filledBlocks}%
        </span>
      </div>

      <div className="gap-bar-track">
        {Array.from({ length: TOTAL_BLOCKS }).map((_, i) => {
          const filled = i < filledBlocks;
          return (
            <button
              key={i}
              className={`gap-block ${filled ? "gap-block--filled" : "gap-block--empty"}`}
              title={filled ? `Block ${i + 1}: understood` : `Block ${i + 1}: gap`}
              aria-label={`Block ${i + 1}: ${filled ? "understood" : "gap to fill"}`}
              onMouseEnter={() => setHoveredBlock(i)}
              onMouseLeave={() => setHoveredBlock(null)}
              onClick={() => filled && onBlockClick?.(i)}
            />
          );
        })}
      </div>

      <p className="gap-bar-sub">
        {understoodCount} of {totalKeywords} concepts understood
      </p>

      {hoveredBlock !== null && (
        <div className="gap-bar-tooltip" role="tooltip">
          {hoveredBlock < filledBlocks
            ? `Understood concept in this range — click to see which`
            : `Gap: concept not yet marked understood`}
        </div>
      )}
    </div>
  );
}
