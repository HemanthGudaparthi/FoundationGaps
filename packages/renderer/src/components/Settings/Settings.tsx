/**
 * Settings panel — API key configuration and preferences.
 *
 * API keys are stored in the platform's secure store (iOS Keychain via
 * @capacitor/preferences, localStorage for web/dev).
 *
 * No key = no LLM explanations or cloud transcription.
 * Everything else (bins, notes, Wikipedia, arXiv, on-device Whisper) works
 * without any API key.
 */

import React, { useState, useEffect } from "react";
import { getPlatform } from "../../platform";

const MODELS = [
  { label: "GPT-4o mini (fast, cheap)",  value: "gpt-4o-mini",   base: "https://api.openai.com/v1" },
  { label: "GPT-4o (best quality)",       value: "gpt-4o",        base: "https://api.openai.com/v1" },
  { label: "Claude Haiku (fast)",         value: "claude-haiku-4-5-20251001", base: "https://api.anthropic.com/v1" },
  { label: "Ollama / local model",        value: "custom",        base: "http://localhost:11434/v1" },
];

interface Config {
  openAiKey:   string;
  llmBaseUrl:  string;
  llmModel:    string;
  llmKey:      string;
}

interface Props {
  onClose:  () => void;
  onChange: (config: Partial<Config>) => void;
}

export function Settings({ onClose, onChange }: Props) {
  const [openAiKey,  setOpenAiKey]  = useState("");
  const [llmKey,     setLlmKey]     = useState("");
  const [llmBaseUrl, setLlmBaseUrl] = useState("https://api.openai.com/v1");
  const [llmModel,   setLlmModel]   = useState("gpt-4o-mini");
  const [saved,      setSaved]      = useState(false);
  const [testing,    setTesting]    = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  // Load saved values on mount
  useEffect(() => {
    (async () => {
      const p = await getPlatform();
      setOpenAiKey(  await p.secureGet("openai_key")   ?? "");
      setLlmKey(     await p.secureGet("llm_key")      ?? "");
      setLlmBaseUrl( await p.secureGet("llm_base_url") ?? "https://api.openai.com/v1");
      setLlmModel(   await p.secureGet("llm_model")    ?? "gpt-4o-mini");
    })();
  }, []);

  const handleSave = async () => {
    const p = await getPlatform();
    await p.secureSet("openai_key",   openAiKey.trim());
    await p.secureSet("llm_key",      llmKey.trim());
    await p.secureSet("llm_base_url", llmBaseUrl.trim());
    await p.secureSet("llm_model",    llmModel.trim());
    onChange({
      openAiKey:  openAiKey.trim(),
      llmKey:     llmKey.trim(),
      llmBaseUrl: llmBaseUrl.trim(),
      llmModel:   llmModel.trim(),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const key  = llmKey || openAiKey;
      const base = llmBaseUrl;
      const res  = await fetch(`${base}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model: llmModel,
          max_tokens: 10,
          messages: [{ role: "user", content: "Say hi" }],
        }),
      });
      if (res.ok) {
        setTestResult("✅ Connection successful");
      } else {
        const err = await res.json().catch(() => ({}));
        setTestResult(`❌ Error ${res.status}: ${(err as any).error?.message ?? "unknown"}`);
      }
    } catch (e) {
      setTestResult(`❌ ${(e as Error).message}`);
    } finally {
      setTesting(false);
    }
  };

  const handlePreset = (preset: typeof MODELS[number]) => {
    setLlmBaseUrl(preset.base);
    setLlmModel(preset.value === "custom" ? "" : preset.value);
  };

  return (
    <div className="settings-overlay" role="dialog" aria-modal="true" aria-label="Settings">
      <div className="settings-panel">
        <div className="settings-header">
          <h2>Settings</h2>
          <button className="settings-close" onClick={onClose} aria-label="Close settings">✕</button>
        </div>

        <div className="settings-body">

          {/* ── Transcription ── */}
          <section className="settings-section">
            <h3>Transcription</h3>
            <p className="settings-desc">
              Used to auto-generate text from your video so EpiBins can detect keywords.
              On-device transcription (Whisper) works with no key — first run downloads
              ~150 MB model once. Cloud transcription (OpenAI) is faster but uses your key.
            </p>
            <label className="settings-label">OpenAI API key (for cloud Whisper + GPT explanations)</label>
            <input
              className="settings-input"
              type="password"
              placeholder="sk-…"
              value={openAiKey}
              onChange={(e) => setOpenAiKey(e.target.value)}
              autoComplete="off"
            />
            <p className="settings-hint">
              Free at <a href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer">platform.openai.com</a>.
              Leave blank to use on-device Whisper (free, private, no key needed).
            </p>
          </section>

          {/* ── LLM explanations ── */}
          <section className="settings-section">
            <h3>LLM explanations</h3>
            <p className="settings-desc">
              EpiBins explains each keyword in plain language using an LLM.
              Pick a preset or configure any OpenAI-compatible endpoint (Ollama, OpenRouter, etc.).
            </p>

            <label className="settings-label">Model preset</label>
            <div className="settings-presets">
              {MODELS.map((m) => (
                <button
                  key={m.value}
                  className={`settings-preset-btn ${llmModel === m.value ? "settings-preset-btn--active" : ""}`}
                  onClick={() => handlePreset(m)}
                >
                  {m.label}
                </button>
              ))}
            </div>

            <label className="settings-label">API base URL</label>
            <input
              className="settings-input"
              type="url"
              value={llmBaseUrl}
              onChange={(e) => setLlmBaseUrl(e.target.value)}
              placeholder="https://api.openai.com/v1"
            />

            <label className="settings-label">Model name</label>
            <input
              className="settings-input"
              type="text"
              value={llmModel}
              onChange={(e) => setLlmModel(e.target.value)}
              placeholder="gpt-4o-mini"
            />

            <label className="settings-label">API key (if different from OpenAI key above)</label>
            <input
              className="settings-input"
              type="password"
              placeholder="Leave blank to use OpenAI key above"
              value={llmKey}
              onChange={(e) => setLlmKey(e.target.value)}
              autoComplete="off"
            />

            <button
              className="settings-test-btn"
              onClick={handleTest}
              disabled={testing}
            >
              {testing ? "Testing…" : "Test connection"}
            </button>
            {testResult && <p className="settings-test-result">{testResult}</p>}
          </section>

          {/* ── Privacy note ── */}
          <section className="settings-section settings-section--privacy">
            <h3>Privacy</h3>
            <p className="settings-desc">
              Only keyword strings are sent to external APIs — never your video, audio, or notes.
              All API keys are stored in the device's secure keychain, never in plain text.
              On-device transcription (Whisper) and Wikipedia/arXiv lookups are entirely private.
            </p>
          </section>
        </div>

        <div className="settings-footer">
          <button className="settings-save-btn" onClick={handleSave}>
            {saved ? "Saved ✓" : "Save settings"}
          </button>
        </div>
      </div>
    </div>
  );
}
