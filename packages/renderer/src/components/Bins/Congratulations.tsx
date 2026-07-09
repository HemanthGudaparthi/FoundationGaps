/**
 * Congratulations screen — shown when all bins are filled (100%).
 */

import React from "react";

interface Props {
  sessionTitle: string;
  binCount: number;
  onExport: () => void;
  onDismiss: () => void;
}

export function Congratulations({ sessionTitle, binCount, onExport, onDismiss }: Props) {
  return (
    <div className="congrats-overlay" role="dialog" aria-modal="true"
         aria-label="Congratulations — all knowledge bins filled">
      <div className="congrats-card">

        <div className="congrats-icon" aria-hidden="true">🎓</div>

        <h1 className="congrats-title">All bins filled!</h1>

        <p className="congrats-body">
          You've covered all <strong>{binCount}</strong> fundamental knowledge bins
          for <em>{sessionTitle}</em>.<br />
          Every concept has been understood and documented in your own words.
        </p>

        <div className="congrats-stat">
          <span className="congrats-stat-num">100</span>
          <span className="congrats-stat-label">bins filled</span>
        </div>

        <div className="congrats-actions">
          <button className="congrats-btn congrats-btn--primary" onClick={onExport}>
            Export knowledge map
          </button>
          <button className="congrats-btn congrats-btn--secondary" onClick={onDismiss}>
            Keep studying
          </button>
        </div>
      </div>
    </div>
  );
}
