/**
 * services/ai.ts — myBeez AI stub.
 *
 * Thin re-export of the OpenAI client helpers so that dynamic imports
 * in routes (e.g. `await import("../services/ai")`) resolve correctly.
 *
 * The real implementation lives in services/core/openaiClient.ts.
 * Replace the bodies here when you want richer AI behaviour (streaming,
 * function-calling, model routing, etc.).
 */

export { getAIForContext } from "./core/openaiClient";
export { default as openai } from "./core/openaiClient";

/**
 * Convenience helper: translate a piece of text via OpenAI.
 * Returns the translated string, or the original on failure.
 */
export async function translateText(
  text: string,
  targetLanguage: "vi" | "th",
): Promise<{ translatedText: string; detectedLanguage?: string }> {
  const { getAIForContext } = await import("./core/openaiClient");
  const ai = getAIForContext("translate");

  const langNames: Record<string, string> = {
    vi: "Vietnamese",
    th: "Thai",
  };

  try {
    const response = await ai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are a professional translator. Translate the user's text to ${langNames[targetLanguage]}. Return ONLY the translated text, no explanations.`,
        },
        { role: "user", content: text },
      ],
      max_tokens: 256,
      temperature: 0.2,
    });

    const translatedText =
      response.choices[0]?.message?.content?.trim() ?? text;
    return { translatedText };
  } catch (err) {
    console.error("[AI] Translation failed:", err);
    return { translatedText: text };
  }
}
