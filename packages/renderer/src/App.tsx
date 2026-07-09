/**
 * EpiBins — Fundamental Knowledge Bins
 * Root application component.
 */

import React, { useState, useEffect, useCallback } from "react";
import { FundamentalBins }  from "./components/Bins/FundamentalBins";
import { BinPrompt }        from "./components/Bins/BinPrompt";
import { Congratulations }  from "./components/Bins/Congratulations";
import { StickyNoteOverlay }from "./components/Player/StickyNoteOverlay";
import { TimelineMarkers }  from "./components/Player/TimelineMarkers";
import { useBins }          from "./components/Bins/useBins";
import { getPlatform }      from "./platform";
import type { Note }        from "../../shared/src/ipc-types";

export default function App() {
  // ── Session ────────────────────────────────────────────────────────────────
  const [sessionTitle,  setSessionTitle]  = useState("Untitled session");
  const [videoPath,     setVideoPath]     = useState<string | null>(null);
  const [currentMs,     setCurrentMs]     = useState(0);
  const [durationMs,    setDurationMs]    = useState(0);
  const [notes,         setNotes]         = useState<Note[]>([]);
  const [showCongrats,  setShowCongrats]  = useState(false);
  const [stickyVisible, setStickyVisible] = useState(true);

  // ── Knowledge bins ─────────────────────────────────────────────────────────
  const {
    bins, binNotes, activeBinIndex, nextGapBin,
    filledCount, isComplete,
    addConcepts, fillBin, deferBin, markUnderstood,
    promptNextGap, dismissPrompt,
  } = useBins();

  // Show congratulations when all bins are complete
  useEffect(() => {
    if (isComplete && bins.length > 0) setShowCongrats(true);
  }, [isComplete, bins.length]);

  // ── File load ──────────────────────────────────────────────────────────────
  const handleLoadVideo = useCallback(async () => {
    const platform = await getPlatform();
    const file = await platform.pickVideoFile();
    if (!file) return;
    setVideoPath(file.path);
    setSessionTitle(file.name.replace(/\.[^.]+$/, ""));
  }, []);

  // ── Export ─────────────────────────────────────────────────────────────────
  const handleExport = useCallback(async () => {
    const md = [
      `# ${sessionTitle} — EpiBins Knowledge Map`,
      ``,
      `## Fundamental Knowledge Bins (${filledCount}/${bins.length} filled)`,
      ``,
      ...binNotes.map(
        (bn) => `### Bin ${bn.binIndex}: ${bn.concept}\n${bn.note}\n*Filled at ${bn.filledAt}*`
      ),
      ``,
      `## Timestamped Notes`,
      ``,
      ...notes.map((n) => {
        const s = Math.floor(n.timestampMs / 1000);
        const ts = `${String(Math.floor(s / 3600)).padStart(2, "0")}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
        return `**[${ts}]** ${n.text}`;
      }),
    ].join("\n");

    const platform = await getPlatform();
    await platform.shareText(`${sessionTitle}-lexia-notes.md`, md);
  }, [sessionTitle, binNotes, bins.length, filledCount, notes]);

  // ── Note creation ──────────────────────────────────────────────────────────
  const handleAddNote = useCallback((text: string) => {
    const note: Note = {
      id: crypto.randomUUID(),
      sessionId: "current",
      timestampMs: currentMs,
      text,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setNotes((prev) => [...prev, note]);
  }, [currentMs]);

  // ── Seek ───────────────────────────────────────────────────────────────────
  const handleSeek = useCallback((ms: number) => {
    setCurrentMs(ms);
    // Actual video seek is handled by the native player
  }, []);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="lexia-app">

      {/* Top bar */}
      <header className="lexia-topbar">
        <span className="lexia-logo">EpiBins</span>
        <span className="lexia-session-title">{sessionTitle}</span>
        <div className="lexia-topbar-actions">
          <button onClick={handleLoadVideo}>Open video</button>
          <button onClick={promptNextGap} disabled={!nextGapBin}>
            Next gap →
          </button>
          <button onClick={handleExport}>Export</button>
        </div>
      </header>

      <div className="lexia-body">

        {/* Left: video + player */}
        <section className="lexia-player-col">
          {videoPath ? (
            <div className="lexia-player-wrap">
              {/* Native video element — on iOS this hands off to AVPlayer via Capacitor */}
              <video
                className="lexia-video"
                src={videoPath}
                controls
                onTimeUpdate={(e) => setCurrentMs((e.target as HTMLVideoElement).currentTime * 1000)}
                onDurationChange={(e) => setDurationMs((e.target as HTMLVideoElement).duration * 1000)}
              />

              {/* Sticky note overlay */}
              <StickyNoteOverlay
                notes={notes}
                currentMs={currentMs}
                visible={stickyVisible}
              />

              {/* Timeline pip markers on the progress bar replica */}
              <div className="lexia-seekbar-overlay">
                <TimelineMarkers
                  notes={notes}
                  durationMs={durationMs}
                  onSeek={handleSeek}
                />
              </div>
            </div>
          ) : (
            <div className="lexia-player-empty" onClick={handleLoadVideo}>
              <div className="lexia-drop-icon">▶</div>
              <p>Tap to open a video</p>
            </div>
          )}

          {/* Active bin prompt, shown below the player */}
          {activeBinIndex !== null && (() => {
            const bin = bins.find((b) => b.index === activeBinIndex);
            return bin ? (
              <BinPrompt
                bin={bin}
                onFill={fillBin}
                onRead={(idx) => { /* open keyword sidebar */ }}
                onSkip={deferBin}
                onDismiss={dismissPrompt}
              />
            ) : null;
          })()}
        </section>

        {/* Right: bins + notes */}
        <aside className="lexia-sidebar">
          <FundamentalBins
            bins={bins}
            activeBinIndex={activeBinIndex}
            onBinClick={(bin) => {
              if (bin.state !== "filled") {
                // Set as active prompt target
                promptNextGap();
              }
            }}
            onComplete={() => setShowCongrats(true)}
          />

          <div className="lexia-notes-section">
            <h2 className="lexia-notes-heading">Notes</h2>
            {notes.length === 0 && (
              <p className="lexia-notes-empty">Press N while watching to add a note.</p>
            )}
            {notes.map((n) => (
              <div key={n.id} className="lexia-note-card" onClick={() => handleSeek(n.timestampMs)}>
                <span className="lexia-note-ts">{msToTimestamp(n.timestampMs)}</span>
                <p className="lexia-note-text">{n.text}</p>
              </div>
            ))}
          </div>
        </aside>
      </div>

      {/* Congratulations overlay */}
      {showCongrats && (
        <Congratulations
          sessionTitle={sessionTitle}
          binCount={bins.length}
          onExport={handleExport}
          onDismiss={() => setShowCongrats(false)}
        />
      )}
    </div>
  );
}

function msToTimestamp(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}
