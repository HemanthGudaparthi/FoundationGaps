# ContextLens — Architecture Overview

## Process model

```
┌─────────────────────────────────────────────────────────────┐
│  Electron Main Process (Node.js)                            │
│                                                             │
│  ┌──────────────┐  ┌───────────────┐  ┌─────────────────┐  │
│  │  SQLite DB   │  │ keyword-engine│  │  mpv subprocess │  │
│  │  (Drizzle)   │  │  (pipeline.ts)│  │  (media player) │  │
│  └──────┬───────┘  └───────┬───────┘  └────────┬────────┘  │
│         │                  │                    │           │
│         └──────────────────┴────────────────────┘           │
│                          IPC (typed channels)                │
└─────────────────────────────┬───────────────────────────────┘
                              │  contextBridge
┌─────────────────────────────▼───────────────────────────────┐
│  Electron Renderer (Chromium + React)                       │
│                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌────────────────────┐  │
│  │  VideoPlayer│  │  Sidebar    │  │  GapBar            │  │
│  │  + Timeline │  │  Keywords   │  │  100 blocks        │  │
│  │    Markers  │  │  Notes      │  │                    │  │
│  │  + Sticky   │  │  Materials  │  │                    │  │
│  │    Notes    │  │             │  │                    │  │
│  └─────────────┘  └─────────────┘  └────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Data flow — keyword detection

```
Video plays → Transcript segment becomes active
    │
    ▼
keyword-engine/pipeline.ts
    │  Pass 1: vocabulary.json lookup   (sync, ~1 ms)
    │  Pass 2: compromise NER           (sync, ~5 ms)
    │  Pass 3: LLM confirmation         (async, opt-in)
    ▼
Detected keywords → deduplicated → stored in SQLite (keywords table)
    │
    ▼
Enrichment (async, per keyword, cached 24 h):
    ├── Wikipedia REST API  → wikipedia_summary
    ├── arXiv Atom API      → arxiv_results (top 3)
    └── LLM API             → llm_explanation
    │
    ▼
Renderer: KeywordCard components update in sidebar
Gap bar: recomputed from (understood_count / total_keywords) * 100
```

## Data flow — sticky notes

```
User presses N during playback
    │
    ▼
Video pauses → note input opens with current timestamp (ms)
    │
    ▼
User types note → saves → note stored in SQLite (notes table)
    │
    ├── Timeline pip rendered on seekbar at proportional position
    │
    └── As playhead moves:
          StickyNoteOverlay checks notes within ±2 s window
          → animates card into bottom-left of video frame
          → multiple notes in window cycle every 3 s
```

## Database schema (simplified)

```
sessions          1 ──< transcript_segments
sessions          1 ──< keywords
sessions          1 ──< notes
sessions          1 ──< materials
enrichment_cache  (shared across sessions, keyed by normalized term)
```

## IPC security model

- `contextIsolation: true`, `nodeIntegration: false` — renderer has no Node.js access
- `contextBridge.exposeInMainWorld("ipc", { invoke })` — renderer calls `window.ipc.invoke(channel, params)`
- All IPC channels are typed via `packages/shared/src/ipc-types.ts`
- File system reads, SQLite writes, and subprocess spawns happen only in main process

## Enrichment API rate limiting

| API | Limit | Strategy |
|-----|-------|----------|
| Wikipedia | None specified | 24-hour client-side cache per term |
| arXiv | 1 req / 3 s | Request queue with 3 s delay; cache per term per session |
| LLM | User's plan | Batched per-segment; cached per term (no TTL — explanations don't expire) |

## Offline behavior

Sessions from local files: fully offline (video, transcript, notes, gap bar, cached enrichment).
Sessions from YouTube URLs: offline after initial load if transcript was fetched and enrichment was cached. New enrichment unavailable offline.
