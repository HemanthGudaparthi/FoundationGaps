/**
 * EpiBins — root application component.
 *
 * Data flow:
 *   VideoLoader → VideoSource
 *   VideoPlayer → timeUpdate / duration / audioReady
 *   transcribe(audioBlob) → TranscriptSegments
 *   detectKeywords(fullText) → keywords → TranscriptionPanel highlights
 *   keyword click → EnrichmentSidebar (Wikipedia + arXiv + LLM)
 *   detected concepts → useBins.addConcepts()
 *   BinPrompt → fillBin / deferBin
 */

import React, { useState, useEffect, useCallback, useRef } from "react";

import { VideoLoader }         from "./components/Player/VideoLoader";
import { VideoPlayer }         from "./components/Player/VideoPlayer";
import { TranscriptionPanel }  from "./components/Transcription/TranscriptionPanel";
import { EnrichmentSidebar }   from "./components/Sidebar/EnrichmentSidebar";
import { FundamentalBins }     from "./components/Bins/FundamentalBins";
import { BinPrompt }           from "./components/Bins/BinPrompt";
import { Congratulations }     from "./components/Bins/Congratulations";
import { Settings }            from "./components/Settings/Settings";
import { useBins }             from "./components/Bins/useBins";

import { transcribe }          from "./services/transcription";
import { detectKeywords }      from "@funda/keyword-engine/pipeline";
import { getPlatform }         from "./platform";

import type { VideoSource }    from "./components/Player/VideoLoader";
import type { TranscriptSegment } from "./services/transcription";
import type { LLMConfig }      from "./services/llm";
import type { Note }           from "@funda/shared/ipc-types";

export default function App() {
  // ── Video ──────────────────────────────────────────────────────────────────
  const [source,       setSource]       = useState<VideoSource | null>(null);
  const [currentMs,    setCurrentMs]    = useState(0);
  const [durationMs,   setDurationMs]   = useState(0);
  const seekRef = useRef<(ms: number) => void>(() => {});

  // ── Transcription ──────────────────────────────────────────────────────────
  const [segments,          setSegments]          = useState<TranscriptSegment[]>([]);
  const [isTranscribing,    setIsTranscribing]    = useState(false);
  const [transcribeProgress, setTranscribeProgress] =
    useState<{ percent: number; stage: string } | null>(null);

  // ── Keywords ───────────────────────────────────────────────────────────────
  const [keywords, setKeywords] = useState<string[]>([]);

  // ── Enrichment sidebar ─────────────────────────────────────────────────────
  const [enrichTerm,    setEnrichTerm]    = useState<string | null>(null);
  const [enrichContext, setEnrichContext] = useState("");

  // ── Knowledge bins ─────────────────────────────────────────────────────────
  const {
    bins, binNotes, activeBinIndex, nextGapBin,
    filledCount, isComplete,
    addConcepts, fillBin, deferBin,
    promptNextGap, dismissPrompt,
  } = useBins();

  const [showCongrats, setShowCongrats] = useState(false);
  useEffect(() => {
    if (isComplete && bins.length > 0) setShowCongrats(true);
  }, [isComplete, bins.length]);

  // ── Notes ──────────────────────────────────────────────────────────────────
  const [notes,         setNotes]         = useState<Note[]>([]);
  const [stickyVisible, setStickyVisible] = useState(true);

  // ── Config ─────────────────────────────────────────────────────────────────
  const [llmConfig,    setLlmConfig]    = useState<LLMConfig | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [sessionTitle, setSessionTitle] = useState("Untitled session");

  // Load saved LLM config on mount
  useEffect(() => {
    (async () => {
      const p = await getPlatform();
      const key     = await p.secureGet("llm_key")      ?? await p.secureGet("openai_key") ?? "";
      const baseUrl = await p.secureGet("llm_base_url") ?? "https://api.openai.com/v1";
      const model   = await p.secureGet("llm_model")    ?? "gpt-4o-mini";
      if (key) setLlmConfig({ apiKey: key, baseUrl, model });
    })();
  }, []);

  // ── Transcription trigger ──────────────────────────────────────────────────
  const audioRef = useRef<Blob | null>(null);

  const runTranscription = useCallback(async (audioBlob: Blob, youtubeId?: string) => {
    if (isTranscribing) return;
    setIsTranscribing(true);
    setTranscribeProgress({ percent: 0, stage: "Starting…" });
    try {
      const openAiKey = llmConfig?.baseUrl.includes("openai.com") ? llmConfig.apiKey : undefined;
      const result = await transcribe({
        source:    youtubeId ? "youtube" : "local-file",
        youtubeId,
        audioBlob,
        openAiKey,
        onProgress: (p) => setTranscribeProgress({ percent: p.percent ?? 0, stage: p.stage }),
      });

      setSegments(result.segments);

      // Detect keywords from full transcript text
      const fullText = result.segments.map((s) => s.text).join(" ");
      const detected = await detectKeywords(fullText);
      const terms    = detected.map((d) => d.term);
      setKeywords(terms);
      addConcepts(terms);
    } catch (err) {
      console.error("Transcription failed:", err);
    } finally {
      setIsTranscribing(false);
      setTranscribeProgress(null);
    }
  }, [isTranscribing, llmConfig, addConcepts]);

  const handleAudioReady = useCallback((blob: Blob) => {
    audioRef.current = blob;
    // Auto-start transcription when audio is ready (no key needed for on-device Whisper)
    runTranscription(blob);
  }, [runTranscription]);

  const handleSourceReady = useCallback((src: VideoSource) => {
    setSource(src);
    setSegments([]);
    setKeywords([]);
    setCurrentMs(0);
    setDurationMs(0);
    setSessionTitle(
      src.kind === "local"
        ? src.name.replace(/\.[^.]+$/, "")
        : `YouTube: ${src.videoId}`
    );
    // For YouTube, start transcription immediately using captions
    if (src.kind === "youtube") {
      runTranscription(new Blob(), src.videoId);
    }
  }, [runTranscription]);

  // ── Keyword click → enrichment sidebar ────────────────────────────────────
  const handleKeywordClick = useCallback((term: string, ctx: string) => {
    setEnrichTerm(term);
    setEnrichContext(ctx);
  }, []);

  // ── Notes ──────────────────────────────────────────────────────────────────
  const handleAddNote = useCallback((text: string) => {
    const note: Note = {
      id:          crypto.randomUUID(),
      sessionId:   "current",
      timestampMs: currentMs,
      text,
      createdAt:   new Date().toISOString(),
      updatedAt:   new Date().toISOString(),
    };
    setNotes((prev) => [...prev, note]);
  }, [currentMs]);

  // ── Export ─────────────────────────────────────────────────────────────────
  const handleExport = useCallback(async () => {
    const md = [
      `# ${sessionTitle} — EpiBins Knowledge Map`,
      ``,
      `## Knowledge Bins (${filledCount}/${bins.length} filled)`,
      ``,
      ...binNotes.map(
        (bn) => `### Bin ${bn.binIndex}: ${bn.concept}\n${bn.note}\n*Filled at ${bn.filledAt}*`
      ),
      ``,
      `## Timestamped Notes`,
      ``,
      ...notes.map((n) => {
        const s   = Math.floor(n.timestampMs / 1000);
        const ts  = `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
        return `**[${ts}]** ${n.text}`;
      }),
    ].join("\n");

    const p = await getPlatform();
    await p.shareText(`${sessionTitle}-epibins.md`, md);
  }, [sessionTitle, filledCount, bins.length, binNotes, notes]);

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // N = add timestamped note
      if (e.key === "n" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const text = prompt("Note at this timestamp:");
        if (text?.trim()) handleAddNote(text.trim());
      }
      // Escape = close sidebar / settings
      if (e.key === "Escape") {
        if (enrichTerm)    setEnrichTerm(null);
        if (showSettings)  setShowSettings(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [enrichTerm, showSettings, handleAddNote]);

  // ── Render ─────────────────────────────────────────────────────────────────
  const activeBin = activeBinIndex !== null ? bins.find((b) => b.index === activeBinIndex) : null;

  return (
    <div className="epibins-app">

      {/* ── Top bar ────────────────────────────────────────────────────────── */}
      <header className="epibins-topbar">
        <span className="epibins-logo">EpiBins</span>
        <span className="epibins-session">{sessionTitle}</span>
        <div className="epibins-topbar-actions">
          {source && (
            <button className="topbar-btn" onClick={() => setSource(null)}>
              Change video
            </button>
          )}
          <button
            className="topbar-btn topbar-btn--accent"
            onClick={promptNextGap}
            disabled={!nextGapBin}
            title={nextGapBin ? `Next gap: Bin ${nextGapBin.index} — ${nextGapBin.concept}` : "No gaps remaining"}
          >
            Next gap →
          </button>
          <button className="topbar-btn" onClick={handleExport} disabled={bins.length === 0}>
            Export
          </button>
          <button className="topbar-btn topbar-btn--icon" onClick={() => setShowSettings(true)} aria-label="Settings">
            ⚙
          </button>
        </div>
      </header>

      {/* ── Main layout ────────────────────────────────────────────────────── */}
      <div className="epibins-body">

        {/* Left column: video + transcript + bin prompt */}
        <main className="epibins-main">

          {/* Video area */}
          {!source ? (
            <VideoLoader onSourceReady={handleSourceReady} />
          ) : (
            <VideoPlayer
              source={source}
              notes={notes}
              stickyVisible={stickyVisible}
              onTimeUpdate={setCurrentMs}
              onDuration={setDurationMs}
              onSeek={(ms) => setCurrentMs(ms)}
              onAudioReady={handleAudioReady}
            />
          )}

          {/* Transcript */}
          {source && (
            <div className="epibins-transcript-wrap">
              <TranscriptionPanel
                segments={segments}
                currentMs={currentMs}
                keywords={keywords}
                onSeek={(ms) => {
                  setCurrentMs(ms);
                  seekRef.current(ms);
                }}
                onKeywordClick={handleKeywordClick}
                isTranscribing={isTranscribing}
                transcribeProgress={transcribeProgress}
                onRequestTranscribe={() => {
                  if (audioRef.current) runTranscription(audioRef.current);
                  else if (source.kind === "youtube") runTranscription(new Blob(), source.videoId);
                }}
              />
            </div>
          )}

          {/* Active bin prompt */}
          {activeBin && (
            <BinPrompt
              bin={activeBin}
              onFill={fillBin}
              onRead={(idx) => {
                const bin = bins.find((b) => b.index === idx);
                if (bin) { setEnrichTerm(bin.concept); setEnrichContext(""); }
              }}
              onSkip={deferBin}
              onDismiss={dismissPrompt}
            />
          )}
        </main>

        {/* Right sidebar: bins + notes */}
        <aside className="epibins-sidebar">

          {/* Knowledge bins grid */}
          <FundamentalBins
            bins={bins}
            activeBinIndex={activeBinIndex}
            onBinClick={(bin) => {
              if (bin.state !== "filled") promptNextGap();
            }}
            onComplete={() => setShowCongrats(true)}
          />

          {/* Sticky toggle */}
          <label className="epibins-toggle-row">
            <input
              type="checkbox"
              checked={stickyVisible}
              onChange={(e) => setStickyVisible(e.target.checked)}
            />
            Show sticky notes on video
          </label>

          {/* Timestamped notes list */}
          <div className="epibins-notes">
            <h2 className="epibins-notes-heading">Notes</h2>
            {notes.length === 0 ? (
              <p className="epibins-notes-empty">
                Press <kbd>N</kbd> while watching to add a timestamped note.
              </p>
            ) : (
              notes.map((n) => (
                <div
                  key={n.id}
                  className="epibins-note-card"
                  onClick={() => setCurrentMs(n.timestampMs)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === "Enter" && setCurrentMs(n.timestampMs)}
                >
                  <span className="epibins-note-ts">{msToTs(n.timestampMs)}</span>
                  <p className="epibins-note-text">{n.text}</p>
                </div>
              ))
            )}
          </div>
        </aside>
      </div>

      {/* ── Enrichment sidebar ─────────────────────────────────────────────── */}
      {enrichTerm && (
        <div className="enrich-overlay">
          <EnrichmentSidebar
            term={enrichTerm}
            contextSnippet={enrichContext}
            llmConfig={llmConfig}
            onClose={() => setEnrichTerm(null)}
            onAddToBin={(concept) => {
              addConcepts([concept]);
              setEnrichTerm(null);
            }}
          />
        </div>
      )}

      {/* ── Settings panel ─────────────────────────────────────────────────── */}
      {showSettings && (
        <Settings
          onClose={() => setShowSettings(false)}
          onChange={(cfg) => {
            const key     = cfg.llmKey || cfg.openAiKey || "";
            const baseUrl = cfg.llmBaseUrl ?? "https://api.openai.com/v1";
            const model   = cfg.llmModel   ?? "gpt-4o-mini";
            if (key) setLlmConfig({ apiKey: key, baseUrl, model });
          }}
        />
      )}

      {/* ── Congratulations overlay ─────────────────────────────────────────── */}
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

function msToTs(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  return h > 0
    ? `${pad(h)}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`
    : `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
}

function pad(n: number): string { return String(n).padStart(2, "0"); }
