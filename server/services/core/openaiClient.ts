/**
 * AI Provider Factory — myBeez
 *
 * Supports OpenAI, Gemini, and Grok (xAI) with graceful fallback.
 * Each provider is optional — only initialized if the API key is set.
 */

import OpenAI from "openai";

type ProviderName = "openai" | "gemini" | "grok";

const providers: Partial<Record<ProviderName, OpenAI>> = {};

function initProvider(name: ProviderName): OpenAI | null {
  if (providers[name]) return providers[name]!;

  switch (name) {
    case "openai": {
      const key = process.env.OPENAI_API_KEY;
      if (!key) return null;
      providers.openai = new OpenAI({ apiKey: key });
      return providers.openai;
    }
    case "gemini": {
      const key = process.env.GEMINI_API_KEY;
      if (!key) return null;
      providers.gemini = new OpenAI({
        apiKey: key,
        baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
      });
      return providers.gemini;
    }
    case "grok": {
      const key = process.env.XAI_API_KEY;
      if (!key) return null;
      providers.grok = new OpenAI({
        apiKey: key,
        baseURL: "https://api.x.ai/v1",
      });
      return providers.grok;
    }
  }
}

export function getAI(provider: ProviderName = "openai"): OpenAI | null {
  return initProvider(provider);
}

export function getAIForContext(): OpenAI {
  const order: ProviderName[] = ["openai", "gemini", "grok"];
  for (const p of order) {
    const ai = initProvider(p);
    if (ai) return ai;
  }
  throw new Error("[AI] No AI provider configured. Set OPENAI_API_KEY, GEMINI_API_KEY, or XAI_API_KEY.");
}

const openai = getAI("openai");
export default openai;
