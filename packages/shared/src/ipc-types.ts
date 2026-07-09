/**
 * Typed IPC channel contracts between Electron main process and renderer.
 * Every cross-process call must go through one of these typed channels.
 */

// ── Domain types ─────────────────────────────────────────────────────────────

export interface Session {
  id: string;
  title: string;
  filePath: string | null;   // null for URL sessions
  sourceUrl: string | null;
  lastPlayheadMs: number;
  createdAt: string;         // ISO 8601
  updatedAt: string;
}

export interface TranscriptSegment {
  id: string;
  sessionId: string;
  startMs: number;
  endMs: number;
  text: string;
}

export interface Keyword {
  id: string;
  sessionId: string;
  term: string;
  firstSeenMs: number;
  allTimestampsMs: number[];
  status: "unseen" | "understood" | "dismissed";
  wikipediaSummary: string | null;
  llmExplanation: string | null;
  arxivResults: ArxivResult[];
  enrichedAt: string | null;
}

export interface ArxivResult {
  id: string;
  title: string;
  authors: string[];
  year: number;
  abstractSnippet: string;
  url: string;
}

export interface Note {
  id: string;
  sessionId: string;
  timestampMs: number;
  text: string;              // raw Markdown
  createdAt: string;
  updatedAt: string;
}

export interface Material {
  id: string;
  sessionId: string;
  type: "pdf" | "url";
  pathOrUrl: string;
  label: string;
  faviconUrl: string | null;
  addedAt: string;
}

export interface GapBarState {
  sessionId: string;
  totalKeywords: number;
  understoodCount: number;
  filledBlocks: number;      // 0–100
}

// ── IPC channel map ───────────────────────────────────────────────────────────
// Convention: "channel:action" → { params, result }

export interface IpcChannels {
  // Sessions
  "session:list":    { params: void;                         result: Session[] };
  "session:create":  { params: { filePath?: string; url?: string; title: string }; result: Session };
  "session:get":     { params: { id: string };               result: Session | null };
  "session:update":  { params: Partial<Session> & { id: string }; result: Session };
  "session:delete":  { params: { id: string };               result: void };
  "session:savePlayhead": { params: { id: string; ms: number }; result: void };

  // Transcript
  "transcript:import":  { params: { sessionId: string; filePath: string }; result: TranscriptSegment[] };
  "transcript:get":     { params: { sessionId: string };     result: TranscriptSegment[] };
  "transcript:generate":{ params: { sessionId: string };     result: "started" };

  // Keywords
  "keyword:list":    { params: { sessionId: string; filter?: Keyword["status"] }; result: Keyword[] };
  "keyword:setStatus": { params: { id: string; status: Keyword["status"] }; result: Keyword };
  "keyword:enrich":  { params: { id: string };               result: Keyword };

  // Notes
  "note:list":       { params: { sessionId: string };        result: Note[] };
  "note:create":     { params: Omit<Note, "id" | "createdAt" | "updatedAt">; result: Note };
  "note:update":     { params: Pick<Note, "id" | "text">;    result: Note };
  "note:delete":     { params: { id: string };               result: void };
  "note:export":     { params: { sessionId: string };        result: string }; // markdown string

  // Materials
  "material:list":   { params: { sessionId: string };        result: Material[] };
  "material:add":    { params: Omit<Material, "id" | "addedAt" | "faviconUrl">; result: Material };
  "material:delete": { params: { id: string };               result: void };

  // Gap bar
  "gapbar:get":      { params: { sessionId: string };        result: GapBarState };
}

export type IpcChannel = keyof IpcChannels;
export type IpcParams<C extends IpcChannel> = IpcChannels[C]["params"];
export type IpcResult<C extends IpcChannel> = IpcChannels[C]["result"];
