/**
 * Invoice OCR parser — extrait les champs d'une facture image ou PDF.
 *
 * Stratégie : Vision API (OpenAI / Gemini / Grok) avec provider chain
 * identique à Alfred. Le service est best-effort : retourne tout ce
 * qui peut être détecté, `null` pour le reste. Le front applique sur
 * un form Add Achat existant — l'utilisateur valide / corrige avant
 * d'enregistrer.
 *
 * Adaptations myBeez :
 *   - Validation Zod stricte sur la sortie
 *   - Provider chain via `core/openaiClient.ts` (déjà 3 providers) pour les images
 *   - PDF traité séparément via l'API Gemini native (le proxy OpenAI-compat
 *     ne supporte pas l'inline PDF). Si pas de GEMINI_API_KEY → 503.
 *   - Pas de stockage local du fichier (pure inline base64, jeté après)
 *
 * Helpers de matching fournisseur exposés (`normalizeSupplierName`,
 * `matchSupplierByName`) pour pré-sélection automatique côté route.
 */

import { z } from "zod";
import { getAI } from "../core/openaiClient";

export const SUPPORTED_IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const SUPPORTED_PDF_MIME_TYPE = "application/pdf" as const;
export const SUPPORTED_MIME_TYPES = [
  ...SUPPORTED_IMAGE_MIME_TYPES,
  SUPPORTED_PDF_MIME_TYPE,
] as const;
export type SupportedImageMime = (typeof SUPPORTED_IMAGE_MIME_TYPES)[number];
export type SupportedMime = (typeof SUPPORTED_MIME_TYPES)[number];

/** Taille max d'une image upload base64-decoded. 5MB. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
/** Taille max d'un PDF upload base64-decoded. 10MB (les PDF de facture
 *  sont souvent plus lourds que les photos compressées côté client). */
export const MAX_PDF_BYTES = 10 * 1024 * 1024;

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
 * Parse une facture via Vision API.
 *
 *   - Pour les images (jpeg/png/webp) : provider chain OpenAI → Gemini → Grok
 *     via l'interface OpenAI-compatible (datas inline en data URL).
 *   - Pour les PDF : appel direct Gemini natif (`inline_data` mime
 *     `application/pdf`). Le proxy OpenAI-compat de Gemini ne supporte pas
 *     les PDF inline ; OpenAI/Grok demandent une conversion image préalable
 *     qu'on ne fait pas ici. Donc PDF = Gemini ou rien.
 *
 * Throws si aucun provider n'est configuré OU si tous échouent.
 */
export async function parseInvoiceImage(
  fileBase64: string,
  mimeType: SupportedMime,
): Promise<ParseAttempt> {
  if (mimeType === SUPPORTED_PDF_MIME_TYPE) {
    return parsePdfViaGemini(fileBase64);
  }

  const order: Array<"openai" | "gemini" | "grok"> = ["openai", "gemini", "grok"];
  const dataUrl = `data:${mimeType};base64,${fileBase64}`;

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

/**
 * Parse un PDF via l'API Gemini native. On contourne l'OpenAI-compat
 * proxy parce qu'il ne supporte pas `inline_data: application/pdf`.
 */
async function parsePdfViaGemini(pdfBase64: string): Promise<ParseAttempt> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error(
      "Aucun provider OCR configuré pour les PDF (GEMINI_API_KEY requise — OpenAI/Grok n'acceptent pas le PDF inline).",
    );
  }

  const model = PROVIDER_MODELS.gemini;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [
          {
            role: "user",
            parts: [
              { text: "Extrais les champs structurés de cette facture. Réponds avec le JSON demandé." },
              { inline_data: { mime_type: "application/pdf", data: pdfBase64 } },
            ],
          },
        ],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 600,
          responseMimeType: "application/json",
        },
      }),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`OCR PDF (Gemini) injoignable : ${msg}`);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`OCR PDF (Gemini) HTTP ${response.status} : ${body.slice(0, 200)}`);
  }

  const payload = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = payload.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
  if (!text) {
    throw new Error("OCR PDF (Gemini) : réponse vide.");
  }
  const fields = InvoiceFieldsSchema.parse(JSON.parse(stripCodeFence(text)));
  return { provider: "gemini", fields };
}

/** Enlève les fences markdown ` ```json ... ``` ` que certains modèles ajoutent. */
export function stripCodeFence(text: string): string {
  const fenced = text.match(/^```(?:json)?\s*([\s\S]*?)```$/);
  if (fenced) return fenced[1].trim();
  return text;
}

/** Validation côté serveur d'une string base64 : format + taille. La taille
 *  max varie selon le mime (image vs PDF). Le nom est conservé pour ne pas
 *  casser les imports existants — il accepte aussi les PDF maintenant. */
export function validateBase64Image(
  base64: string,
  mimeType: string,
): { ok: true; bytes: number } | { ok: false; error: string } {
  if (!SUPPORTED_MIME_TYPES.includes(mimeType as SupportedMime)) {
    return {
      ok: false,
      error: `Type non supporté. Utilisez ${SUPPORTED_MIME_TYPES.join(", ")}.`,
    };
  }
  // Strip data URL prefix if the client sent one.
  const clean = base64.replace(/^data:[^,]+,/, "");
  if (!/^[A-Za-z0-9+/=]+$/.test(clean)) {
    return { ok: false, error: "Format base64 invalide." };
  }
  // base64 -> bytes ratio = 3/4
  const approxBytes = Math.floor((clean.length * 3) / 4);
  const maxBytes = mimeType === SUPPORTED_PDF_MIME_TYPE ? MAX_PDF_BYTES : MAX_IMAGE_BYTES;
  if (approxBytes > maxBytes) {
    const kind = mimeType === SUPPORTED_PDF_MIME_TYPE ? "PDF" : "Image";
    return {
      ok: false,
      error: `${kind} trop volumineux (${(approxBytes / 1024 / 1024).toFixed(1)} MB > ${maxBytes / 1024 / 1024} MB).`,
    };
  }
  return { ok: true, bytes: approxBytes };
}

// ─── Supplier name matching ─────────────────────────────────────────

/**
 * Normalise un nom de fournisseur pour comparaison :
 * lower-case, suppression des accents, ponctuation et formes juridiques
 * (sarl, sas, eurl, sa, sasu, sci, gmbh, ltd, llc, inc), espaces collapsés.
 *
 * Pourquoi virer les formes juridiques : "Métro France SAS" et "METRO FRANCE"
 * doivent matcher. Les enseignes commerciales se présentent rarement sous leur
 * raison sociale exacte.
 */
export function normalizeSupplierName(raw: string): string {
  return raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // diacritics
    .replace(/[^a-z0-9\s]+/g, " ") // ponctuation
    .replace(/\b(sarl|sas|sasu|eurl|sa|sci|gmbh|ltd|llc|inc|co|corp)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

interface SupplierCandidate {
  id: number;
  name: string;
  shortName?: string | null;
}

/**
 * Trouve le meilleur fournisseur candidat pour un nom OCR.
 *
 * Algo (volontairement simple, pas de Levenshtein/JW pour l'instant) :
 *   1. exact match normalisé → score 1.0
 *   2. l'un contient l'autre (substring sur normalisé, min 4 caractères) → 0.9
 *   3. token-overlap : ≥ 60% des tokens du nom le plus court présents
 *      dans le plus long → score = ratio
 *
 * Seuil de retour : 0.6. En-dessous → null (l'utilisateur choisira manuellement).
 *
 * Note : on compare aussi contre `shortName` si présent. Un fournisseur
 * "Établissements Dupont & Fils" peut avoir shortName "Dupont".
 */
export function matchSupplierByName(
  ocrName: string | null | undefined,
  candidates: SupplierCandidate[],
): { supplierId: number; score: number } | null {
  if (!ocrName || !ocrName.trim()) return null;
  const normOcr = normalizeSupplierName(ocrName);
  if (!normOcr) return null;
  const ocrTokens = normOcr.split(" ").filter((t) => t.length >= 2);
  if (ocrTokens.length === 0) return null;

  let best: { supplierId: number; score: number } | null = null;

  for (const cand of candidates) {
    const names = [cand.name, cand.shortName].filter(
      (n): n is string => typeof n === "string" && n.length > 0,
    );
    for (const candName of names) {
      const normCand = normalizeSupplierName(candName);
      if (!normCand) continue;
      let score = 0;

      if (normOcr === normCand) {
        score = 1.0;
      } else if (
        normCand.length >= 4 &&
        (normOcr.includes(normCand) || normCand.includes(normOcr))
      ) {
        score = 0.9;
      } else {
        const candTokens = normCand.split(" ").filter((t) => t.length >= 2);
        if (candTokens.length === 0) continue;
        const [shorter, longer] =
          ocrTokens.length <= candTokens.length
            ? [ocrTokens, candTokens]
            : [candTokens, ocrTokens];
        // Refuse de matcher sur un seul token : "AB" tout seul ferait
        // un faux positif sur n'importe quelle phrase contenant "AB".
        if (shorter.length < 2) continue;
        const longerSet = new Set(longer);
        const overlap = shorter.filter((t) => longerSet.has(t)).length;
        const ratio = overlap / shorter.length;
        if (ratio >= 0.6) score = ratio;
      }

      if (score >= 0.6 && (!best || score > best.score)) {
        best = { supplierId: cand.id, score };
      }
    }
  }

  return best;
}
