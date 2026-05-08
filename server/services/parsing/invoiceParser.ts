/**
 * Invoice OCR parser — extrait les champs d'une facture image.
 *
 * Stratégie : Vision API (OpenAI / Gemini / Grok) avec provider chain
 * identique à Alfred. Le service est best-effort : retourne tout ce
 * qui peut être détecté, `null` pour le reste. Le front applique sur
 * un form Add Achat existant — l'utilisateur valide / corrige avant
 * d'enregistrer.
 *
 * Inspiré de `ulysseclaude/server/services/parsing/aiVisionParsers.ts`.
 * Adaptations myBeez :
 *   - Validation Zod stricte sur la sortie
 *   - Provider chain via `core/openaiClient.ts` (déjà 3 providers)
 *   - Pas de stockage local de l'image (pure inline base64, jeté après)
 *   - Pas de retraitement post-prod (déléger au front la validation
 *     finale par l'utilisateur)
 *
 * Limite V1 : images uniquement (jpeg/png/webp). PDF rejeté à la
 * validation. Le PDF nécessiterait soit une conversion image (+lib
 * pdf-poppler) soit l'API Gemini Files (multi-step). À traiter dans
 * une PR follow-up dédiée si besoin.
 */

import { z } from "zod";
import { getAI } from "../core/openaiClient";

export const SUPPORTED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type SupportedMime = (typeof SUPPORTED_MIME_TYPES)[number];

/** Taille max d'une image upload base64-decoded. 5MB. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const ISO_DATE = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Format YYYY-MM-DD attendu")
  .nullable();

const NUM_OR_NULL = z.number().finite().nullable();

/** Forme stricte de ce qu'on attend du modèle Vision. */
export const InvoiceFieldsSchema = z.object({
  supplierName: z.string().nullable(),
  invoiceNumber: z.string().nullable(),
  invoiceDate: ISO_DATE,
  totalHt: NUM_OR_NULL,
  totalTtc: NUM_OR_NULL,
  tvaRate: NUM_OR_NULL,
  tvaAmount: NUM_OR_NULL,
  dueDate: ISO_DATE,
  category: z.string().nullable(),
  paymentMethod: z.string().nullable(),
});

export type InvoiceFields = z.infer<typeof InvoiceFieldsSchema>;

const SYSTEM_PROMPT = `Tu es un assistant qui extrait des champs structurés à partir d'une facture fournisseur (image scannée ou photo).

Tu dois retourner UNIQUEMENT un JSON valide avec exactement ces clés :
- supplierName (string|null) : raison sociale du fournisseur
- invoiceNumber (string|null) : numéro de facture
- invoiceDate (string|null) : date de facture au format YYYY-MM-DD
- totalHt (number|null) : montant total HT en EUR (juste le nombre, sans symbole)
- totalTtc (number|null) : montant total TTC en EUR
- tvaRate (number|null) : taux TVA en % (ex 20 pour 20%)
- tvaAmount (number|null) : montant TVA en EUR
- dueDate (string|null) : date d'échéance YYYY-MM-DD si présente
- category (string|null) : catégorie courte ex "matières premières", "services", "fournitures"
- paymentMethod (string|null) : mode de paiement si visible (virement, prélèvement, CB, chèque)

Règles strictes :
- Si un champ n'est pas lisible ou absent, mets null. Ne devine pas.
- Pour les nombres, utilise le point décimal (12.50 pas 12,50).
- Pour les dates, format YYYY-MM-DD obligatoire.
- Réponds avec le JSON pur, sans préfixe \`\`\`json ni explication.`;

interface ParseAttempt {
  provider: "openai" | "gemini" | "grok";
  fields: InvoiceFields;
}

const PROVIDER_MODELS: Record<"openai" | "gemini" | "grok", string> = {
  openai: "gpt-4o-mini",
  gemini: "gemini-2.5-flash",
  // Grok vision is the same family but model name differs; if not available,
  // the call will simply fail and the chain falls through.
  grok: "grok-2-vision-latest",
};

/**
 * Parse une image de facture via Vision API. Tente OpenAI → Gemini →
 * Grok dans cet ordre. Retourne la première réponse valide.
 *
 * Throws si aucun provider n'est configuré OU si tous échouent.
 */
export async function parseInvoiceImage(
  imageBase64: string,
  mimeType: SupportedMime,
): Promise<ParseAttempt> {
  const order: Array<"openai" | "gemini" | "grok"> = ["openai", "gemini", "grok"];
  const dataUrl = `data:${mimeType};base64,${imageBase64}`;

  let lastError: string = "";
  let triedAny = false;

  for (const provider of order) {
    const ai = getAI(provider);
    if (!ai) continue;
    triedAny = true;

    try {
      const response = await ai.chat.completions.create({
        model: PROVIDER_MODELS[provider],
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Extrais les champs structurés de cette facture. Réponds avec le JSON demandé.",
              },
              {
                type: "image_url",
                image_url: { url: dataUrl },
              },
            ],
          },
        ],
        max_tokens: 600,
        temperature: 0,
      });

      const text = response.choices?.[0]?.message?.content?.trim() ?? "";
      const json = stripCodeFence(text);
      const raw = JSON.parse(json);
      const fields = InvoiceFieldsSchema.parse(raw);
      return { provider, fields };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      lastError = `${provider}: ${msg}`;
      console.warn(`[InvoiceParser] ${lastError}`);
      continue;
    }
  }

  if (!triedAny) {
    throw new Error("Aucun provider OCR configuré (OPENAI_API_KEY / GEMINI_API_KEY / XAI_API_KEY).");
  }
  throw new Error(`OCR a échoué sur tous les providers. Dernier : ${lastError}`);
}

/** Enlève les fences markdown ` ```json ... ``` ` que certains modèles ajoutent. */
export function stripCodeFence(text: string): string {
  const fenced = text.match(/^```(?:json)?\s*([\s\S]*?)```$/);
  if (fenced) return fenced[1].trim();
  return text;
}

/** Validation côté serveur d'une string base64 : format + taille. */
export function validateBase64Image(
  base64: string,
  mimeType: string,
): { ok: true; bytes: number } | { ok: false; error: string } {
  if (!SUPPORTED_MIME_TYPES.includes(mimeType as SupportedMime)) {
    return {
      ok: false,
      error: `Type non supporté. Utilisez ${SUPPORTED_MIME_TYPES.join(", ")} (PDF non supporté en V1).`,
    };
  }
  // Strip data URL prefix if the client sent one.
  const clean = base64.replace(/^data:[^,]+,/, "");
  if (!/^[A-Za-z0-9+/=]+$/.test(clean)) {
    return { ok: false, error: "Format base64 invalide." };
  }
  // base64 -> bytes ratio = 3/4
  const approxBytes = Math.floor((clean.length * 3) / 4);
  if (approxBytes > MAX_IMAGE_BYTES) {
    return { ok: false, error: `Image trop volumineuse (${(approxBytes / 1024 / 1024).toFixed(1)} MB > ${MAX_IMAGE_BYTES / 1024 / 1024} MB).` };
  }
  return { ok: true, bytes: approxBytes };
}
