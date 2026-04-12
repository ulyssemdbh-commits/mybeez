/**
 * Translation Service — myBeez
 *
 * Translates text between French, Vietnamese and Thai using AI.
 * Falls back to returning original text if AI is unavailable.
 */

import { getAIForContext } from "./core/openaiClient";

type SupportedLang = "fr" | "vi" | "th";

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
  async translate(
    textOrOptions: string | { text: string; fromLang: SupportedLang; toLang: SupportedLang },
    fromLang?: SupportedLang,
    toLang?: SupportedLang,
  ): Promise<TranslateResult> {
    let text: string;
    let from: SupportedLang;
    let to: SupportedLang;

    if (typeof textOrOptions === "string") {
      text = textOrOptions;
      from = fromLang ?? "fr";
      to = toLang ?? "vi";
    } else {
      text = textOrOptions.text;
      from = textOrOptions.fromLang;
      to = textOrOptions.toLang;
    }

    if (from === to) {
      return { translatedText: text, fromLang: from, toLang: to, originalText: text };
    }

    try {
      const ai = getAIForContext();
      const response = await ai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              `You are a professional translator for a restaurant management app. ` +
              `Translate the user's text from ${LANG_NAMES[from]} to ${LANG_NAMES[to]}. ` +
              `Only output the translated text, nothing else. ` +
              `Keep restaurant/food terminology accurate.`,
          },
          { role: "user", content: text },
        ],
        max_tokens: 256,
        temperature: 0.3,
      });

      const translatedText = response.choices?.[0]?.message?.content?.trim() || text;
      return { translatedText, fromLang: from, toLang: to, originalText: text };
    } catch (err: any) {
      console.warn("[Translation] AI unavailable, returning original:", err.message);
      return { translatedText: text, fromLang: from, toLang: to, originalText: text };
    }
  }
}

export const translationService = new TranslationService();
