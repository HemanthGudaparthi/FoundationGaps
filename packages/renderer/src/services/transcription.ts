/**
 * Transcription service — converts video/audio to timestamped text.
 *
 * Strategy (in order):
 *  1. YouTube captions  — free, instant, no model download (YouTube URLs only)
 *  2. Whisper.js        — on-device via @xenova/transformers (ONNX, runs in browser)
 *  3. OpenAI Whisper API — cloud fallback when user provides an OpenAI key
 *
 * The caller receives a stream of TranscriptSegment via an async generator
 * so the UI can show progress before the full transcript is ready.
 */

export interface TranscriptSegment {
  startMs: number;
  endMs:   number;
  text:    string;
}

export type TranscriptionSource = "youtube-captions" | "whisper-local" | "whisper-cloud";

export interface TranscriptionProgress {
  percent: number;    // 0–100
  stage:   string;
}

// ── YouTube captions (free, no auth) ──────────────────────────────────────────

export function extractYouTubeId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([A-Za-z0-9_-]{11})/,
  ];
  for (const re of patterns) {
    const m = url.match(re);
    if (m) return m[1];
  }
  return null;
}

export async function fetchYouTubeCaptions(videoId: string): Promise<TranscriptSegment[]> {
  // YouTube's public timedtext endpoint — returns XML captions when available.
  // Used by screen readers and is publicly accessible.
  const langs = ["en", "en-US", "en-GB", "a.en"];  // auto-generated English fallbacks
  for (const lang of langs) {
    try {
      const url = `https://www.youtube.com/api/timedtext?v=${videoId}&lang=${lang}&fmt=json3`;
      const res = await fetch(url);
      if (!res.ok) continue;
      const data = await res.json();
      const events: any[] = data?.events ?? [];
      const segments: TranscriptSegment[] = [];
      for (const ev of events) {
        if (!ev.segs || !ev.tStartMs) continue;
        const text = ev.segs.map((s: any) => s.utf8 ?? "").join("").trim();
        if (!text) continue;
        segments.push({
          startMs: ev.tStartMs,
          endMs:   ev.tStartMs + (ev.dDurationMs ?? 2000),
          text,
        });
      }
      if (segments.length > 0) return segments;
    } catch { /* try next lang */ }
  }
  throw new Error("No captions found for this YouTube video. Try uploading a local file instead.");
}

// ── On-device Whisper via @xenova/transformers ────────────────────────────────

export async function transcribeLocal(
  audioBlob: Blob,
  onProgress: (p: TranscriptionProgress) => void,
): Promise<TranscriptSegment[]> {
  onProgress({ percent: 0, stage: "Loading Whisper model (first run: ~150 MB download)…" });

  // Dynamic import so the ~150MB model only loads when transcription is requested
  const { pipeline, env } = await import("@xenova/transformers");

  // Cache the model in the browser's IndexedDB so it only downloads once
  env.allowLocalModels = false;
  env.useBrowserCache  = true;

  const transcriber = await pipeline(
    "automatic-speech-recognition",
    "Xenova/whisper-small.en",   // ~250 MB; use whisper-tiny.en (~80 MB) for faster load
    {
      progress_callback: (info: any) => {
        if (info.status === "progress") {
          onProgress({
            percent: Math.round(info.progress ?? 0),
            stage:   `Downloading model: ${info.file ?? ""}`,
          });
        }
      },
    }
  );

  onProgress({ percent: 100, stage: "Transcribing audio…" });

  const arrayBuffer = await audioBlob.arrayBuffer();
  const audioContext = new AudioContext({ sampleRate: 16000 });
  const decoded = await audioContext.decodeAudioData(arrayBuffer);
  const float32 = decoded.getChannelData(0);   // mono channel

  const result: any = await transcriber(float32, {
    return_timestamps: true,
    chunk_length_s: 30,
    stride_length_s: 5,
  });

  // Result contains chunks with timestamps
  const chunks: any[] = result.chunks ?? [{ timestamp: [0, null], text: result.text }];
  return chunks.map((c, i) => ({
    startMs: Math.round((c.timestamp?.[0] ?? i * 2) * 1000),
    endMs:   Math.round((c.timestamp?.[1] ?? (i + 1) * 2) * 1000),
    text:    (c.text ?? "").trim(),
  })).filter((s) => s.text.length > 0);
}

// ── Cloud Whisper (OpenAI API) ────────────────────────────────────────────────

export async function transcribeCloud(
  audioBlob: Blob,
  apiKey: string,
  onProgress: (p: TranscriptionProgress) => void,
): Promise<TranscriptSegment[]> {
  onProgress({ percent: 10, stage: "Sending audio to OpenAI Whisper API…" });

  const formData = new FormData();
  formData.append("file", audioBlob, "audio.webm");
  formData.append("model", "whisper-1");
  formData.append("response_format", "verbose_json");
  formData.append("timestamp_granularities[]", "segment");

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`OpenAI Whisper API error: ${(err as any).error?.message ?? res.status}`);
  }

  onProgress({ percent: 90, stage: "Processing transcription…" });
  const data = await res.json();

  return (data.segments ?? []).map((s: any) => ({
    startMs: Math.round(s.start * 1000),
    endMs:   Math.round(s.end * 1000),
    text:    (s.text ?? "").trim(),
  }));
}

// ── Unified entry point ───────────────────────────────────────────────────────

export async function transcribe(opts: {
  source: "youtube" | "local-file";
  youtubeId?: string;
  audioBlob?: Blob;
  openAiKey?: string;
  onProgress: (p: TranscriptionProgress) => void;
}): Promise<{ segments: TranscriptSegment[]; via: TranscriptionSource }> {
  const { source, youtubeId, audioBlob, openAiKey, onProgress } = opts;

  if (source === "youtube" && youtubeId) {
    onProgress({ percent: 0, stage: "Fetching YouTube captions…" });
    try {
      const segments = await fetchYouTubeCaptions(youtubeId);
      onProgress({ percent: 100, stage: "Captions loaded." });
      return { segments, via: "youtube-captions" };
    } catch (e) {
      onProgress({ percent: 0, stage: `YouTube captions unavailable (${(e as Error).message}). Falling back to Whisper…` });
      // fall through to Whisper below if an audioBlob was also supplied
    }
  }

  if (!audioBlob) throw new Error("No audio source for transcription.");

  // Prefer cloud when an OpenAI key is configured (faster, no model download)
  if (openAiKey) {
    try {
      const segments = await transcribeCloud(audioBlob, openAiKey, onProgress);
      return { segments, via: "whisper-cloud" };
    } catch (e) {
      onProgress({ percent: 0, stage: `Cloud transcription failed: ${(e as Error).message}. Trying on-device…` });
    }
  }

  const segments = await transcribeLocal(audioBlob, onProgress);
  return { segments, via: "whisper-local" };
}
