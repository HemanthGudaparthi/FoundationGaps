/**
 * LLM service — generates beginner-friendly explanations per keyword.
 *
 * Works with any OpenAI-compatible API endpoint:
 *   - OpenAI (api.openai.com) — default
 *   - Anthropic (via openai-compatible proxy or direct)
 *   - Ollama (http://localhost:11434/v1) — fully offline
 *   - OpenRouter, LM Studio, etc.
 *
 * User configures apiKey + baseUrl in Settings. No key = no LLM explanations,
 * but the rest of the app (bins, notes, Wikipedia, arXiv) works fine.
 */

export interface LLMConfig {
  apiKey:  string;
  baseUrl: string;   // e.g. "https://api.openai.com/v1" or "http://localhost:11434/v1"
  model:   string;   // e.g. "gpt-4o-mini" or "llama3.2"
}

export interface Explanation {
  term:        string;
  beginner:    string;   // plain-English, ~150 words
  whyItMatters: string;  // one sentence on relevance to the content
  cached:      boolean;
}

// In-memory cache — persisted to localStorage by the caller
const _cache = new Map<string, Explanation>();

const SYSTEM_PROMPT = `You are a patient, precise tutor explaining technical concepts to a curious beginner.
When given a term, produce JSON with exactly these keys:
{
  "beginner": "A clear explanation in 2-3 sentences. No jargon. Use an analogy if helpful.",
  "whyItMatters": "One sentence: why does this concept matter in science or daily life?"
}
Return ONLY the JSON object. No markdown fences, no extra text.`;

export async function explainTerm(
  term: string,
  contextSnippet: string,   // surrounding transcript text, for relevance
  config: LLMConfig,
): Promise<Explanation> {
  const cacheKey = `${config.baseUrl}::${config.model}::${term.toLowerCase()}`;
  if (_cache.has(cacheKey)) {
    return { ..._cache.get(cacheKey)!, cached: true };
  }

  const userMsg = `Term: "${term}"\n\nContext from the video/podcast (for relevance only, do not quote it back):\n${contextSnippet.slice(0, 400)}`;

  const res = await fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: 300,
      temperature: 0.4,
      messages: [
        { role: "system",  content: SYSTEM_PROMPT },
        { role: "user",    content: userMsg },
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`LLM API error ${res.status}: ${(err as any).error?.message ?? "unknown"}`);
  }

  const data = await res.json();
  const raw  = (data.choices?.[0]?.message?.content ?? "").trim()
    .replace(/^```json\s*/i, "").replace(/\s*```$/i, "");

  const parsed = JSON.parse(raw);
  const explanation: Explanation = {
    term,
    beginner:     parsed.beginner     ?? "No explanation available.",
    whyItMatters: parsed.whyItMatters ?? "",
    cached: false,
  };

  _cache.set(cacheKey, explanation);
  return explanation;
}

export function clearCache(): void {
  _cache.clear();
}
