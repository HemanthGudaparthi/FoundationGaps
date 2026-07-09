/**
 * VideoPlayer — renders either a local <video> or a YouTube iFrame.
 *
 * For local files: native HTML5 video element (hardware-decoded on iPad via WebKit).
 * For YouTube: official iFrame embed with JS API for playhead position polling.
 */

import React, { useRef, useEffect, useCallback, useState } from "react";
import type { VideoSource } from "./VideoLoader";
import { StickyNoteOverlay } from "./StickyNoteOverlay";
import { TimelineMarkers }   from "./TimelineMarkers";
import type { Note } from "../../../../shared/src/ipc-types";

interface Props {
  source:        VideoSource;
  notes:         Note[];
  stickyVisible: boolean;
  onTimeUpdate:  (currentMs: number) => void;
  onDuration:    (durationMs: number) => void;
  onSeek:        (ms: number) => void;
  onAudioReady:  (blob: Blob) => void;   // fires once when audio is extractable
}

export function VideoPlayer({
  source, notes, stickyVisible,
  onTimeUpdate, onDuration, onSeek, onAudioReady,
}: Props) {
  const videoRef    = useRef<HTMLVideoElement>(null);
  const iframeRef   = useRef<HTMLIFrameElement>(null);
  const [currentMs, setCurrentMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const ytPollerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Local video ────────────────────────────────────────────────────────────

  const handleTimeUpdate = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    const ms = Math.round(v.currentTime * 1000);
    setCurrentMs(ms);
    onTimeUpdate(ms);
  }, [onTimeUpdate]);

  const handleDuration = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    const ms = Math.round(v.duration * 1000);
    setDurationMs(ms);
    onDuration(ms);
  }, [onDuration]);

  // Extract audio for transcription using the MediaRecorder API
  const extractAudio = useCallback(async () => {
    const v = videoRef.current;
    if (!v || source.kind !== "local") return;

    try {
      // Use a MediaElementAudioSourceNode to capture audio without re-playing
      const ctx    = new AudioContext();
      const src    = ctx.createMediaElementSource(v);
      const dest   = ctx.createMediaStreamDestination();
      src.connect(dest);
      src.connect(ctx.destination);   // still plays through speakers

      const recorder = new MediaRecorder(dest.stream, { mimeType: "audio/webm" });
      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (e) => chunks.push(e.data);
      recorder.onstop = () => onAudioReady(new Blob(chunks, { type: "audio/webm" }));

      // Record the entire file by playing at max speed in background
      // For files already on device, just use the original blob directly
      onAudioReady(source.blob);
    } catch {
      // Fallback: pass the original blob; transcription service handles it
      if (source.kind === "local") onAudioReady(source.blob);
    }
  }, [source, onAudioReady]);

  useEffect(() => {
    if (source.kind === "local" && videoRef.current) {
      extractAudio();
    }
  }, [source]);

  // ── YouTube iFrame ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (source.kind !== "youtube") return;

    // Poll the YouTube iFrame Player API for current time via postMessage
    const handler = (e: MessageEvent) => {
      if (typeof e.data !== "string") return;
      try {
        const d = JSON.parse(e.data);
        if (d.event === "infoDelivery" && d.info) {
          if (d.info.currentTime !== undefined) {
            const ms = Math.round(d.info.currentTime * 1000);
            setCurrentMs(ms);
            onTimeUpdate(ms);
          }
          if (d.info.duration) {
            const ms = Math.round(d.info.duration * 1000);
            setDurationMs(ms);
            onDuration(ms);
          }
        }
      } catch { /* ignore non-YT messages */ }
    };
    window.addEventListener("message", handler);

    // Request info every 500 ms
    ytPollerRef.current = setInterval(() => {
      iframeRef.current?.contentWindow?.postMessage(
        JSON.stringify({ event: "listening" }), "*"
      );
    }, 500);

    return () => {
      window.removeEventListener("message", handler);
      if (ytPollerRef.current) clearInterval(ytPollerRef.current);
    };
  }, [source, onTimeUpdate, onDuration]);

  const seekVideo = useCallback((ms: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = ms / 1000;
    }
    onSeek(ms);
  }, [onSeek]);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="video-player-wrap">

      {source.kind === "local" ? (
        <video
          ref={videoRef}
          className="epibins-video"
          src={source.url}
          controls
          playsInline              // required for inline play on iOS
          webkit-playsinline="true" // older iOS WebKit
          onTimeUpdate={handleTimeUpdate}
          onDurationChange={handleDuration}
          onLoadedMetadata={handleDuration}
          aria-label={source.name}
        />
      ) : (
        <iframe
          ref={iframeRef}
          className="epibins-video"
          src={`https://www.youtube.com/embed/${source.videoId}?enablejsapi=1&origin=${encodeURIComponent(window.location.origin)}&playsinline=1`}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          title="YouTube video"
        />
      )}

      {/* Sticky notes */}
      <StickyNoteOverlay notes={notes} currentMs={currentMs} visible={stickyVisible} />

      {/* Seekbar pip markers */}
      {durationMs > 0 && (
        <div className="epibins-seekbar-overlay">
          <TimelineMarkers notes={notes} durationMs={durationMs} onSeek={seekVideo} />
        </div>
      )}
    </div>
  );
}
