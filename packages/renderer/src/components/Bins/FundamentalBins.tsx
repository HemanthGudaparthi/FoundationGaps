/**
 * FundamentalBins — the core learning progress component.
 *
 * 100 independent, atomic knowledge bins.
 * No prerequisites. No cascades. Each bin stands alone.
 *
 * Fill states:
 *   "empty"    — concept detected, user has not engaged with it
 *   "deferred" — user skipped it ("come back later"), shown in amber
 *   "filled"   — user wrote a note, answered a prompt, or marked understood
 *
 * Gap detection: the lowest-numbered empty bin is the active prompt target.
 * When all 100 bins are filled → onComplete() fires (shows congratulations).
 */

import React, { useMemo } from "react";

export type BinState = "empty" | "deferred" | "filled";

export interface Bin {
  index: number;         // 1–100
  concept: string;       // keyword / topic label
  state: BinState;
}

interface Props {
  bins: Bin[];
  activeBinIndex: number | null;  // currently prompted bin
  onBinClick: (bin: Bin) => void;
  onComplete: () => void;
}

const STATE_COLOR: Record<BinState, string> = {
  empty:    "var(--bin-empty)",
  deferred: "var(--bin-deferred)",
  filled:   "var(--bin-filled)",
};

const STATE_LABEL: Record<BinState, string> = {
  empty:    "Gap — not yet covered",
  deferred: "Deferred — come back later",
  filled:   "Filled — understood",
};

export function FundamentalBins({ bins, activeBinIndex, onBinClick, onComplete }: Props) {
  const filledCount = useMemo(() => bins.filter((b) => b.state === "filled").length, [bins]);
  const totalBins   = bins.length;
  const pct         = totalBins === 0 ? 0 : Math.round((filledCount / totalBins) * 100);

  // Gaps: indices of all empty bins, sorted ascending
  const gaps = useMemo(
    () => bins.filter((b) => b.state === "empty").map((b) => b.index),
    [bins]
  );

  // Fire completion when every bin is filled
  React.useEffect(() => {
    if (totalBins > 0 && filledCount === totalBins) onComplete();
  }, [filledCount, totalBins]);

  if (totalBins === 0) {
    return (
      <div className="bins-empty" role="status">
        <p className="bins-empty-msg">
          Play a video or import a transcript — Lexia will detect concepts and create your knowledge bins automatically.
        </p>
      </div>
    );
  }

  return (
    <div className="fundamental-bins" aria-label={`Fundamental Knowledge Bins: ${pct}% complete`}>

      {/* Header */}
      <div className="bins-header">
        <span className="bins-title">Fundamental Knowledge Bins</span>
        <span className="bins-pct" aria-live="polite">{pct}%</span>
      </div>

      {/* Subtitle */}
      <div className="bins-sub">
        {filledCount} of {totalBins} bins filled
        {gaps.length > 0 && (
          <span className="bins-gap-count"> · {gaps.length} gap{gaps.length !== 1 ? "s" : ""} remaining</span>
        )}
      </div>

      {/* The 100-bin grid */}
      <div className="bins-grid" role="grid" aria-label="Knowledge bins">
        {bins.map((bin) => (
          <button
            key={bin.index}
            className={`bin bin--${bin.state} ${bin.index === activeBinIndex ? "bin--active" : ""}`}
            style={{ backgroundColor: STATE_COLOR[bin.state] }}
            title={`Bin ${bin.index}: ${bin.concept} — ${STATE_LABEL[bin.state]}`}
            aria-label={`Bin ${bin.index}: ${bin.concept}. ${STATE_LABEL[bin.state]}.`}
            aria-pressed={bin.state === "filled"}
            onClick={() => onBinClick(bin)}
          />
        ))}
      </div>

      {/* Legend */}
      <div className="bins-legend" aria-hidden="true">
        <span><span className="legend-dot legend-dot--filled" />Filled</span>
        <span><span className="legend-dot legend-dot--deferred" />Deferred</span>
        <span><span className="legend-dot legend-dot--empty" />Gap</span>
      </div>
    </div>
  );
}
