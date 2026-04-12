/**
 * translationService — myBeez.
 *
 * Used by:
 *   - server/routes/checklist.ts  → POST /:tenant/translate-comment
 *   - server/routes/suguval.ts    → POST /suguval/translate-comment
 *
 * Translates text between French, Vietnamese and Thai using OpenAI.
 * Falls back to returning the original text if the API is unavailable
 * (e.g. OPENAI_API_KEY not set) so the app never crashes.
 */

import openai from "./core/openaiClient";

type SupportedLang = "fr" | "vi" | "th";

interface TranslateOptions {
  text: string;
  fromLang: SupportedLang;
  toLang: SupportedLang;
}

interface TranslateResult {
  translatedText: string;
  fromLang: SupportedLang;
  toLang: SupportedLang;
  originalText: string;
}

const LANG_NAMES: Record<SupportedLang, string> = {
  fr: "French",
  vi: "Vietnamese",
  th: "Thai",
};

class TranslationService {
  /**
   * Translate text from one language to another.
   * Accepts both the flat (text, fromLang, toLang) signature used by
   * checklist routes AND the object signature used by suguval routes.
   */
  async translate(
    textOrOptions: string | TranslateOptions,
    fromLang?: SupportedLang,
    toLang?: SupportedLang,
  ): Promise<TranslateResult> {
    // Normalise arguments
    let opts: TranslateOptions;
    if (typeof textOrOptions === "string") {
      opts = {
        text: textOrOptions,
        fromLang: fromLang ?? "fr",
        toLang: toLang ?? "vi",
      };
    } else {
      opts = textOrOptions;
    }

    const { text, fromLang: from, toLang: to } = opts;

    // No-op: same language
    if (from === to) {
      return { translatedText: text, fromLang: from, toLang: to, originalText: text };
    }

    // Guard: empty key
    if (!process.env.OPENAI_API_KEY) {
      console.warn("[TranslationService] OPENAI_API_KEY not set — returning original text");
      return { translatedText: text, fromLang: from, toLang: to, originalText: text };
    }

    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              `You are a professional translator for a restaurant management app. ` +
              `Translate the user's text from ${LANG_NAMES[from]} to ${LANG_NAMES[to]}. ` +
              `Return ONLY the translated text, no explanations, no quotes.`,
          },
          { role: "user", content: text },
        ],
        max_tokens: 512,
        temperature: 0.2,
      });

      const translatedText =
        response.choices[0]?.message?.content?.trim() ?? text;

      return { translatedText, fromLang: from, toLang: to, originalText: text };
    } catch (err) {
      console.error("[TranslationService] OpenAI error:", err);
      // Graceful degradation: return original text
      return { translatedText: text, fromLang: from, toLang: to, originalText: text };
    }
  }
}

export const translationService = new TranslationService();
