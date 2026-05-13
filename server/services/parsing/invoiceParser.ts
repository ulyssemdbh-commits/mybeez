/**
 * Invoice OCR parser — extrait les champs d'une facture image ou PDF.
 *
 * Stratégie :
 *   - Images (jpeg/png/webp) : Vision API local via provider chain
 *     OpenAI > Gemini > Grok sur OpenAI-compat. Pattern inchangé.
 *   - PDF : délégué à ulysseclaude `/api/external/parse-invoice` qui fait
 *     pdf-parse → Gemini 2.5 Flash texte → fallback OpenAI gpt-4.1-mini.
 *     Pipeline éprouvée production-grade (cf. suguval). Évite la
 *     duplication et la fragilité de l'ancien `parsePdfViaGemini`
 *     (PDF brut inline → JSON tronqué à 600 tokens).
 *
 * Adaptations myBeez :
 *   - Validation Zod stricte sur la sortie (uniforme image/PDF)
 *   - Mapping `ParsedPurchaseInvoice` (ulysseclaude) → `InvoiceFields` (myBeez)
 *   - Pas de stockage local du fichier (pure inline base64, jeté après)
 *
 * Helpers de matching fournisseur exposés (`normalizeSupplierName`,
 * `matchSupplierByName`) pour pré-sélection automatique côté route.
 *
 * Env vars (PDF path) :
 *   - `ULYSSECLAUDE_PARSE_URL` : default
 *     `https://moe.ulyssepro.org/api/external/parse-invoice`
 *   - `ULYSSECLAUDE_PARSE_TOKEN` : Bearer token (≥32 chars). Si absent, le
 *     path PDF throw "Aucun provider OCR configuré".
 */

import { z } from "zod";
import { getAI } from "../core/openaiClient";
import { moduleLogger } from "../../lib/logger";

const log = moduleLogger("InvoiceParser");

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

/**
 * Erreur typée quand le provider OCR a renvoyé du texte que l'on ne
 * sait pas convertir en JSON parsable. Utilisée par la route pour
 * répondre 422 (donnée upstream invalide) au lieu de 502 (qui
 * sous-entend une infra cassée alors que l'app va bien).
 */
export class InvoiceOcrParseError extends Error {
  readonly provider: "openai" | "gemini" | "grok";
  readonly rawSample: string;
  constructor(provider: "openai" | "gemini" | "grok", rawSample: string) {
    super(
      "L'OCR a renvoyé un format inattendu. Réessayez ou saisissez l'achat manuellement.",
    );
    this.name = "InvoiceOcrParseError";
    this.provider = provider;
    this.rawSample = rawSample;
  }
}

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
    return parsePdfViaUlysseclaude(fileBase64);
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
      const raw = safeParseInvoiceJson(text, provider);
      const fields = InvoiceFieldsSchema.parse(raw);
      return { provider, fields };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      lastError = `${provider}: ${msg}`;
      log.warn({ provider, err }, "provider attempt failed");
      continue;
    }
  }

  if (!triedAny) {
    throw new Error("Aucun provider OCR configuré (OPENAI_API_KEY / GEMINI_API_KEY / XAI_API_KEY).");
  }
  throw new Error(`OCR a échoué sur tous les providers. Dernier : ${lastError}`);
}

/**
 * Forme du payload retourné par ulysseclaude `/api/external/parse-invoice`.
 * On définit le strict minimum dont on a besoin pour le mapping —
 * ulysseclaude renvoie d'autres champs (siret, address, vatNumber,
 * vatBreakdown, currency) qu'on ignore ici pour la première itération.
 */
const UlysseclaudeResponseSchema = z.object({
  success: z.literal(true),
  source: z.enum(["ai-text", "ai-text-fallback", "ai-vision"]),
  data: z.object({
    vendor: z.object({
      name: z.string().nullable(),
    }),
    invoiceNumber: z.string().nullable(),
    invoiceDate: z.string().nullable(),
    dueDate: z.string().nullable(),
    totalHT: z.number().nullable(),
    totalTTC: z.number().nullable(),
    totalVAT: z.number().nullable(),
    vatBreakdown: z
      .array(
        z.object({
          rate: z.number(),
          baseHT: z.number(),
          vatAmount: z.number(),
        }),
      )
      .nullable(),
    paymentMethod: z.string().nullable(),
  }),
});

const ULYSSECLAUDE_DEFAULT_URL = "https://moe.ulyssepro.org/api/external/parse-invoice";

/** Normalise une string OCR date vers `YYYY-MM-DD` ou null si non parseable. */
function normaliseIsoDate(raw: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : null;
}

/**
 * Mappe la réponse ulysseclaude (forme `ParsedPurchaseInvoice`) vers la
 * forme `InvoiceFields` attendue par myBeez et son schéma Zod.
 *
 * Différences clés :
 *   - `vendor.name` → `supplierName`
 *   - `totalHT/TTC/VAT` → `totalHt/Ttc` + `tvaAmount`
 *   - `vatBreakdown[0].rate` → `tvaRate` (premier taux trouvé)
 *   - `category` non extrait par ulysseclaude (V1) → null
 */
function mapUlysseclaudeToInvoiceFields(
  data: z.infer<typeof UlysseclaudeResponseSchema>["data"],
): InvoiceFields {
  const tvaRate =
    data.vatBreakdown && data.vatBreakdown.length > 0 ? data.vatBreakdown[0].rate : null;
  return {
    supplierName: data.vendor.name,
    invoiceNumber: data.invoiceNumber,
    invoiceDate: normaliseIsoDate(data.invoiceDate),
    totalHt: data.totalHT,
    totalTtc: data.totalTTC,
    tvaRate,
    tvaAmount: data.totalVAT,
    dueDate: normaliseIsoDate(data.dueDate),
    category: null,
    paymentMethod: data.paymentMethod,
  };
}

/**
 * Parse un PDF en déléguant à ulysseclaude. La pipeline upstream gère
 * pdf-parse → Gemini text → fallback OpenAI, avec extraction défensive.
 *
 * Throws :
 *   - `Error("Aucun provider OCR configuré...")` si `ULYSSECLAUDE_PARSE_TOKEN`
 *     manquant. La route mappe ça vers 503.
 *   - `InvoiceOcrParseError` si l'upstream renvoie 422 (donnée non
 *     extractible). Mappé vers 422 côté myBeez.
 *   - `Error` générique sinon. Mappé vers 502.
 */
async function parsePdfViaUlysseclaude(pdfBase64: string): Promise<ParseAttempt> {
  const token = process.env.ULYSSECLAUDE_PARSE_TOKEN;
  if (!token) {
    throw new Error(
      "Aucun provider OCR configuré pour les PDF (ULYSSECLAUDE_PARSE_TOKEN manquant).",
    );
  }
  const url = process.env.ULYSSECLAUDE_PARSE_URL || ULYSSECLAUDE_DEFAULT_URL;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        fileBase64: pdfBase64,
        mimeType: SUPPORTED_PDF_MIME_TYPE,
      }),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`OCR PDF (ulysseclaude) injoignable : ${msg}`);
  }

  if (response.status === 422) {
    // Upstream a tenté l'extraction mais le format est inattendu.
    // On préserve l'UX existante (toast "L'OCR a renvoyé un format inattendu").
    const body = await response.text().catch(() => "");
    log.warn({ status: 422, bodyPreview: body.slice(0, 200) }, "ulysseclaude 422");
    throw new InvoiceOcrParseError("gemini", body.slice(0, 200));
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `OCR PDF (ulysseclaude) HTTP ${response.status} : ${body.slice(0, 200)}`,
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`OCR PDF (ulysseclaude) réponse JSON invalide : ${msg}`);
  }

  const parsed = UlysseclaudeResponseSchema.parse(payload);
  const fields = InvoiceFieldsSchema.parse(mapUlysseclaudeToInvoiceFields(parsed.data));
  log.info(
    { source: parsed.source, vendor: fields.supplierName, totalTtc: fields.totalTtc },
    "ulysseclaude parse ok",
  );
  return { provider: "gemini", fields };
}

/** Enlève les fences markdown ` ```json ... ``` ` que certains modèles ajoutent. */
export function stripCodeFence(text: string): string {
  const fenced = text.match(/^```(?:json)?\s*([\s\S]*?)```$/);
  if (fenced) return fenced[1].trim();
  return text;
}

/**
 * Parse défensif de la sortie OCR. `responseMimeType: application/json`
 * côté Gemini ne garantit pas un JSON parfait à 100% — on a déjà observé
 * en prod des sorties avec une clé non quotée à mi-chemin.
 *
 * Stratégie :
 *   1. strip des fences markdown éventuelles
 *   2. JSON.parse direct
 *   3. fallback : extraire la 1re sous-séquence `{ ... }` (du 1er `{` au
 *      dernier `}`) et re-tenter
 *   4. throw `InvoiceOcrParseError` (route → 422) si tout échoue
 *
 * @throws {InvoiceOcrParseError}
 */
export function safeParseInvoiceJson(
  text: string,
  provider: "openai" | "gemini" | "grok",
): unknown {
  const stripped = stripCodeFence(text);
  try {
    return JSON.parse(stripped);
  } catch {}
  const firstBrace = stripped.indexOf("{");
  const lastBrace = stripped.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try {
      return JSON.parse(stripped.slice(firstBrace, lastBrace + 1));
    } catch {}
  }
  throw new InvoiceOcrParseError(provider, stripped.slice(0, 200));
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
