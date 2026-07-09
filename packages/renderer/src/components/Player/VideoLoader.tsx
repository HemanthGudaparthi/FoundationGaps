/**
 * VideoLoader — unified video source handler.
 *
 * Accepts:
 *   - Local file upload (any format the browser/WebKit supports: MP4, MOV, WebM, M4V)
 *   - YouTube URL (embedded stream via YouTube iFrame API — no download)
 *
 * On format not supported by the native video element: shows a clear error
 * and suggests the user re-encode to MP4 with VLC (free).
 *
 * YouTube notes:
 *   - We embed via the official YouTube iFrame API (fully ToS-compliant)
 *   - The video streams from YouTube — no download, no ToS violation
 *   - Captions are fetched via YouTube's free timedtext endpoint for transcription
 *   - Works for all YouTube videos (paid Premium not required for streaming)
 */

import React, { useRef, useState, useCallback } from "react";
import { extractYouTubeId } from "../../services/transcription";

export type VideoSource =
  | { kind: "local"; url: string;  name: string; blob: Blob }
  | { kind: "youtube"; videoId: string; url: string };

interface Props {
  onSourceReady: (source: VideoSource) => void;
}

const SUPPORTED_TYPES = [
  "video/mp4", "video/quicktime", "video/webm",
  "video/x-m4v", "video/x-matroska",  // MKV
  "video/avi", "video/x-msvideo",
  "video/x-flv", "video/3gpp",
  "audio/mpeg", "audio/mp4", "audio/x-m4a",
];

export function VideoLoader({ onSourceReady }: Props) {
  const [youtubeInput, setYoutubeInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // ── Local file handling ────────────────────────────────────────────────────

  const handleFile = useCallback((file: File) => {
    setError(null);
    // Check file extension as fallback — MIME type can be empty on some systems
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    const supported = SUPPORTED_TYPES.includes(file.type) ||
      ["mp4","mov","webm","m4v","mkv","avi","mp3","m4a","flv","3gp"].includes(ext);

    if (!supported) {
      setError(`"${file.name}" may not be supported on this device. If it doesn't play, re-encode to MP4 using VLC (free): Media → Convert/Save → H.264 MP4.`);
    }
    const url = URL.createObjectURL(file);
    onSourceReady({ kind: "local", url, name: file.name, blob: file });
  }, [onSourceReady]);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  // ── YouTube URL handling ───────────────────────────────────────────────────

  const handleYouTube = () => {
    setError(null);
    const id = extractYouTubeId(youtubeInput.trim());
    if (!id) {
      setError("Not a valid YouTube URL. Try: https://youtube.com/watch?v=xxxxx");
      return;
    }
    onSourceReady({
      kind: "youtube",
      videoId: id,
      url: youtubeInput.trim(),
    });
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="video-loader">

      {/* Drag-and-drop / click area */}
      <div
        className={`vl-dropzone ${dragging ? "vl-dropzone--dragging" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileRef.current?.click()}
        role="button"
        tabIndex={0}
        aria-label="Upload a video or audio file"
        onKeyDown={(e) => e.key === "Enter" && fileRef.current?.click()}
      >
        <div className="vl-icon">📂</div>
        <p className="vl-title">Upload a video or audio file</p>
        <p className="vl-sub">MP4 · MOV · WebM · MKV · AVI · MP3 · M4A</p>
        <p className="vl-sub vl-sub--dim">Drag & drop or tap to browse</p>
        <input
          ref={fileRef}
          type="file"
          accept="video/*,audio/*,.mkv,.avi,.flv"
          style={{ display: "none" }}
          onChange={handleFileInput}
        />
      </div>

      {/* Divider */}
      <div className="vl-divider"><span>or paste a YouTube URL</span></div>

      {/* YouTube URL input */}
      <div className="vl-youtube-row">
        <input
          className="vl-youtube-input"
          type="url"
          placeholder="https://youtube.com/watch?v=…"
          value={youtubeInput}
          onChange={(e) => setYoutubeInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleYouTube()}
          aria-label="YouTube URL"
        />
        <button className="vl-youtube-btn" onClick={handleYouTube}>
          Load
        </button>
      </div>

      <p className="vl-youtube-note">
        YouTube videos stream directly (no download). Auto-generated captions are used for keyword detection when available.
      </p>

      {/* Error */}
      {error && (
        <div className="vl-error" role="alert">{error}</div>
      )}
    </div>
  );
}
