import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

// ── sessions ──────────────────────────────────────────────────────────────────
export const sessions = sqliteTable("sessions", {
  id:              text("id").primaryKey(),
  title:           text("title").notNull(),
  filePath:        text("file_path"),
  sourceUrl:       text("source_url"),
  lastPlayheadMs:  integer("last_playhead_ms").notNull().default(0),
  createdAt:       text("created_at").notNull(),
  updatedAt:       text("updated_at").notNull(),
});

// ── transcript_segments ───────────────────────────────────────────────────────
export const transcriptSegments = sqliteTable("transcript_segments", {
  id:        text("id").primaryKey(),
  sessionId: text("session_id").notNull().references(() => sessions.id, { onDelete: "cascade" }),
  startMs:   integer("start_ms").notNull(),
  endMs:     integer("end_ms").notNull(),
  text:      text("text").notNull(),
});

// ── keywords ──────────────────────────────────────────────────────────────────
export const keywords = sqliteTable("keywords", {
  id:                  text("id").primaryKey(),
  sessionId:           text("session_id").notNull().references(() => sessions.id, { onDelete: "cascade" }),
  term:                text("term").notNull(),
  firstSeenMs:         integer("first_seen_ms").notNull(),
  allTimestampsMs:     text("all_timestamps_ms").notNull().default("[]"), // JSON array
  status:              text("status").notNull().default("unseen"),         // unseen|understood|dismissed
  wikipediaSummary:    text("wikipedia_summary"),
  llmExplanation:      text("llm_explanation"),
  arxivResults:        text("arxiv_results").notNull().default("[]"),      // JSON array
  enrichedAt:          text("enriched_at"),
});

// ── notes ─────────────────────────────────────────────────────────────────────
export const notes = sqliteTable("notes", {
  id:          text("id").primaryKey(),
  sessionId:   text("session_id").notNull().references(() => sessions.id, { onDelete: "cascade" }),
  timestampMs: integer("timestamp_ms").notNull(),
  text:        text("text").notNull(),
  createdAt:   text("created_at").notNull(),
  updatedAt:   text("updated_at").notNull(),
});

// ── materials ─────────────────────────────────────────────────────────────────
export const materials = sqliteTable("materials", {
  id:         text("id").primaryKey(),
  sessionId:  text("session_id").notNull().references(() => sessions.id, { onDelete: "cascade" }),
  type:       text("type").notNull(),   // pdf|url
  pathOrUrl:  text("path_or_url").notNull(),
  label:      text("label").notNull(),
  faviconUrl: text("favicon_url"),
  addedAt:    text("added_at").notNull(),
});

// ── enrichment_cache ──────────────────────────────────────────────────────────
// Keyword-level cache shared across sessions; keyed on the normalized term.
export const enrichmentCache = sqliteTable("enrichment_cache", {
  term:             text("term").primaryKey(),
  wikipediaSummary: text("wikipedia_summary"),
  llmExplanation:   text("llm_explanation"),
  arxivResults:     text("arxiv_results").notNull().default("[]"),
  cachedAt:         text("cached_at").notNull(),
  expiresAt:        text("expires_at").notNull(),
});
