# FoundationGaps

> **Watch any video. Surface the concepts you don't yet own. Close every gap in your foundation — one at a time.**

The name captures the real problem: before you can reason about anything deeply, your foundation has to be solid. FoundationGaps surfaces the exact concepts you encountered but don't yet own — the hidden holes in your understanding — and gives you a structured way to close them, one gap at a time.

[![Live Demo](https://img.shields.io/badge/Live%20Demo-hemanthgudaparthi.github.io%2FFoundationGaps-7c5cff?style=flat-square)](https://hemanthgudaparthi.github.io/FoundationGaps/)
[![Version](https://img.shields.io/badge/version-0.1.0--beta-7c5cff?style=flat-square)](https://github.com/HemanthGudaparthi/FoundationGaps/releases)
[![License: MIT](https://img.shields.io/badge/license-MIT-22c55e?style=flat-square)](LICENSE)
[![Open Source](https://img.shields.io/badge/open--source-yes-22c55e?style=flat-square)](https://github.com/HemanthGudaparthi/FoundationGaps)

**Author:** [Hemanth Gudaparthi](https://github.com/HemanthGudaparthi)  
**Platforms:** iPad · Mac · Windows · Web  
**Stack:** React · Vite · Capacitor 6 · Electron · on-device Whisper · OpenAI-compatible LLM

---

## What is FoundationGaps?

FoundationGaps turns passive video-watching into active learning. It auto-detects technical keywords as the transcript is generated, surfaces instant explanations from Wikipedia, arXiv, and an AI model, and tracks every conceptual gap in a grid of **100 Foundation Gaps** — independent, atomic, no prerequisites, any order.

| Step | What happens |
|---|---|
| 1. Load a video | Upload any local file (MP4/MOV/WebM/MKV/AVI/MP3/M4A) or paste a YouTube URL |
| 2. Transcription | On-device Whisper (free, private) or OpenAI Whisper API (faster) |
| 3. Keyword detection | Three-pass pipeline: vocabulary → NER (compromise.js) → optional LLM confirmation |
| 4. Foundation gaps | Detected concepts populate up to 100 independent gaps |
| 5. Explore | Click a highlighted keyword → Wikipedia summary + arXiv papers + AI explanation |
| 6. Close gaps | Write your own understanding (20 char minimum) to mark a gap closed |
| 7. Export | Download or print your knowledge report — share it with teachers or teammates |

---

## Use it — three ways, no account required

| Option | How |
|---|---|
| **Browser (no install)** | Open **[hemanthgudaparthi.github.io/FoundationGaps](https://hemanthgudaparthi.github.io/FoundationGaps/)** — works immediately |
| **Download & run locally** | Click "💾 Download this page" inside the app — save `foundationgaps.html`, open it in any browser, works fully offline |
| **Clone & self-host** | `git clone https://github.com/HemanthGudaparthi/FoundationGaps && cd FoundationGaps/docs && python3 -m http.server 8080` → open `localhost:8080` |

Wikipedia and arXiv enrichment work for free with no key. For AI explanations, add your own API key in ⚙ Settings — or run a local [Ollama](https://ollama.com) server and pay nothing.

### AI / LLM options (all configurable in ⚙ Settings)

| Provider | Base URL | Key needed | Cost |
|---|---|---|---|
| OpenAI | `https://api.openai.com/v1` | Yes | Pay-per-use |
| Ollama (local) | `http://localhost:11434/v1` | No | Free |
| OpenRouter | `https://openrouter.ai/api/v1` | Yes | Pay-per-use |
| Any OpenAI-compatible | custom URL | Depends | Varies |

---

## Features

### Video
- Local file upload (drag & drop, any format the browser supports)
- YouTube embed via official iFrame API — ToS-compliant streaming, no download
- `playsInline` + `webkit-playsinline` for correct iOS/iPadOS playback
- Sticky note overlay on the video (±2 s window)
- Timeline pip markers on the seekbar, click-to-seek

### Transcription (priority order)
1. **YouTube captions** — free, instant, no key needed
2. **OpenAI Whisper API** — cloud, fast, requires OpenAI key
3. **On-device Whisper** — via `@xenova/transformers` (ONNX); ~150 MB model cached in IndexedDB; fully private

### Keyword detection (`packages/keyword-engine`)
```
Pass 1 — Domain vocabulary JSON    (synchronous, always runs, confidence 0.95)
Pass 2 — compromise.js NER         (synchronous, no model download, confidence 0.6)
Pass 3 — LLM confirmation          (async, optional, confidence 0.9)
```

### Enrichment sidebar
- **Wikipedia** — REST API, no auth, 24 h localStorage cache
- **arXiv** — Atom feed, 3 s rate limit per API policy, 24 h cache
- **LLM explanation** — OpenAI-compatible endpoint (configurable base URL); indefinite in-memory cache per session

### Foundation Gaps grid
- 100 independent, atomic gaps — no prerequisites, no cascades, any order
- States: `empty` (gray) → `deferred` (amber) → `closed` (green)
- **Gap** = lowest-indexed empty gap — "Next gap →" button jumps straight there
- Minimum 20-character free-text answer to close a gap
- Congratulations overlay fires when all gaps are closed

### Knowledge Report
- **Print / share** — generate a formatted report of all closed gaps with notes
- Shareable with teachers, teammates, or study groups
- One-click Markdown export for offline use

### Notes
- Press `N` while watching → timestamped note at current playhead
- Notes list in sidebar; click to seek to timestamp
- Exported with the knowledge report

---

## Architecture

```
FoundationGaps/
├── packages/
│   ├── renderer/              # React + Vite web core
│   │   └── src/
│   │       ├── App.tsx                    # Root: full pipeline wiring
│   │       ├── components/
│   │       │   ├── Player/
│   │       │   │   ├── VideoLoader.tsx     # File upload + YouTube URL
│   │       │   │   ├── VideoPlayer.tsx     # <video> / YouTube iFrame
│   │       │   │   ├── StickyNoteOverlay.tsx
│   │       │   │   └── TimelineMarkers.tsx
│   │       │   ├── Transcription/
│   │       │   │   └── TranscriptionPanel.tsx  # Synced + highlighted transcript
│   │       │   ├── Bins/
│   │       │   │   ├── FundamentalBins.tsx  # 100-gap grid
│   │       │   │   ├── BinPrompt.tsx
│   │       │   │   ├── Congratulations.tsx
│   │       │   │   └── useBins.ts           # State hook
│   │       │   ├── Sidebar/
│   │       │   │   └── EnrichmentSidebar.tsx
│   │       │   └── Settings/
│   │       │       └── Settings.tsx
│   │       ├── services/
│   │       │   ├── transcription.ts   # Whisper (local + cloud) + YouTube captions
│   │       │   ├── enrichment.ts      # Wikipedia + arXiv + LLM (cached)
│   │       │   └── llm.ts             # OpenAI-compatible chat endpoint
│   │       └── platform/
│   │           ├── index.ts           # getPlatform() — auto-detects environment
│   │           ├── capacitor.ts       # iOS / macOS (Capacitor)
│   │           ├── electron.ts        # Windows (Electron)
│   │           └── web.ts             # Browser / dev
│   ├── shared/
│   │   └── src/ipc-types.ts           # Shared TypeScript interfaces
│   └── keyword-engine/
│       └── src/pipeline.ts            # Three-pass keyword detector
├── docs/
│   └── index.html                     # Self-contained interactive demo (GitHub Pages)
├── capacitor.config.ts                # iOS/macOS Capacitor config
└── package.json
```

### Platform abstraction

```typescript
// platform/index.ts
const p = await getPlatform();
// returns CapacitorPlatform | ElectronPlatform | WebPlatform
// all expose the same interface:
await p.pickVideoFile()          // file picker
await p.secureGet("openai_key")  // keychain / localStorage
await p.shareText(name, content) // native share / download
```

React components never import Capacitor or Electron directly — they only call `getPlatform()`.

---

## Getting Started

> **Node.js is required.** If Homebrew Node is broken (icu4c mismatch), use nvm:
> ```bash
> curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
> source ~/.zshrc && nvm install 20 && nvm use 20
> ```

```bash
git clone https://github.com/HemanthGudaparthi/FoundationGaps.git
cd FoundationGaps
npm install
npm run dev          # → http://localhost:5173
```

### iPad setup (Capacitor)

See the full step-by-step guide: [`docs/ipad-setup.md`](docs/ipad-setup.md)

```bash
npm run build
npx cap add ios
npx cap sync
npx cap open ios     # opens Xcode → connect iPad → run
```

**Prerequisites:** Xcode (full App Store install), CocoaPods (`sudo gem install cocoapods`), free Apple ID for signing.

### Windows (Electron)

```bash
npm run electron:dev          # dev mode
npm run electron:build        # → dist/FoundationGaps-Setup.exe
```

---

## Configuration (Settings panel)

| Setting | Default | Notes |
|---|---|---|
| OpenAI API key | — | Used for cloud Whisper + GPT explanations |
| LLM base URL | `https://api.openai.com/v1` | Any OpenAI-compatible endpoint (Ollama, OpenRouter, Anthropic) |
| LLM model | `gpt-4o-mini` | Presets: GPT-4o mini, GPT-4o, Claude Haiku, Ollama |

Keys are stored in the device's secure keychain (Capacitor Preferences on iOS, localStorage on web). Only keyword strings are ever sent to external APIs — video, audio, and notes never leave the device.

---

## Keyboard Shortcuts

| Key | Action |
|---|---|
| `N` | Add timestamped note at current playhead |
| `Enter` on transcript segment | Seek to that timestamp |
| `Escape` | Close enrichment sidebar / settings / gap prompt |

---

## Roadmap

- [ ] PDF attachment per session (SA-04)
- [ ] Electron main process IPC handlers (`dialog:pickFile`, `keychain:set`, `db:execute`)
- [ ] Offline arXiv search (real API calls, not demo data)
- [ ] PDF export with embedded gaps and notes
- [ ] Mobile keyboard & safe-area polish
- [ ] CI: lint → type-check → unit tests (80% coverage) → Electron smoke test

---

## Open Source

FoundationGaps is released under the **MIT License** — see [LICENSE](LICENSE).

You are free to use it, modify it, and distribute it. If you build something on top of it, a mention or link back is appreciated but not required.

Contributions welcome: open an issue or PR on [github.com/HemanthGudaparthi/FoundationGaps](https://github.com/HemanthGudaparthi/FoundationGaps).

## Author

**Hemanth Gudaparthi**  
[github.com/HemanthGudaparthi](https://github.com/HemanthGudaparthi)

Built as a personal learning tool — free to use, free to fork. On-device transcription requires no API key and keeps your content fully private.
