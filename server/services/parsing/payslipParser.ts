/**
 * Payslip OCR parser — extrait les champs d'un bulletin de paie image ou PDF.
 *
 * Stratégie alignée sur `invoiceParser.ts` :
 *   - Provider chain OpenAI → Gemini → Grok pour les images (jpeg/png/webp)
 *     via l'interface OpenAI-compat (data URL inline)
 *   - PDF traité par l'API Gemini native (`inline_data` mime application/pdf),
 *     car le proxy OpenAI-compat de Gemini ne supporte pas l'inline PDF.
 *     Si pas de GEMINI_API_KEY → 503 côté route.
 *
 * Pourquoi pas `pdf-parse` ? Les bulletins de paie circulent souvent en photo
 * ou en PDF scanné (employeur tradi qui scanne un papier). Vision API gère
 * les deux uniformément. `pdf-parse` n'aurait fonctionné que sur les PDF
 * natifs numériques (cas le plus simple) et aurait fait double pipeline.
 *
 * On réutilise les helpers communs (`validateBase64Image`, `stripCodeFence`,
 * `SUPPORTED_MIME_TYPES`) exposés par `invoiceParser.ts` plutôt que de
 * recréer un module partagé : la surface est minuscule et dupliquer
 * créerait deux sources de vérité pour les MIME supportés.
 */

import { z } from "zod";
import { getAI } from "../core/openaiClient";
import {
  stripCodeFence,
  SUPPORTED_PDF_MIME_TYPE,
  type SupportedMime,
} from "./invoiceParser";

const ISO_DATE = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Format YYYY-MM-DD attendu")
  .nullable();

const PERIOD = z
  .string()
  .regex(/^\d{4}-\d{2}$/, "Format YYYY-MM attendu")
  .nullable();

const NUM_OR_NULL = z.number().finite().nullable();

/** Forme stricte de ce qu'on attend du modèle Vision pour un bulletin de paie. */
export const PayslipFieldsSchema = z.object({
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  socialSecurityNumber: z.string().nullable(),
  period: PERIOD,
  grossSalary: NUM_OR_NULL,
  netSalary: NUM_OR_NULL,
  socialCharges: NUM_OR_NULL,
  employerCharges: NUM_OR_NULL,
  totalEmployerCost: NUM_OR_NULL,
  bonuses: NUM_OR_NULL,
  overtime: NUM_OR_NULL,
  deductions: NUM_OR_NULL,
  paidDate: ISO_DATE,
});

export type PayslipFields = z.infer<typeof PayslipFieldsSchema>;

const SYSTEM_PROMPT = `Tu es un assistant qui extrait des champs structurés à partir d'un bulletin de paie français (image scannée, photo ou PDF).

Tu dois retourner UNIQUEMENT un JSON valide avec exactement ces clés :
- firstName (string|null) : prénom du salarié
- lastName (string|null) : nom de famille du salarié
- socialSecurityNumber (string|null) : numéro de sécurité sociale (15 chiffres, conserver les espaces si présents)
- period (string|null) : mois de paie au format YYYY-MM (ex "2026-04" pour avril 2026). Si la période est "Période du 01/04/2026 au 30/04/2026", c'est 2026-04.
- grossSalary (number|null) : salaire brut total en EUR (juste le nombre, point décimal)
- netSalary (number|null) : net à payer en EUR (avant impôt prélevé à la source si distinct ; sinon le net à payer affiché)
- socialCharges (number|null) : total des cotisations salariales (charges salariales) en EUR
- employerCharges (number|null) : total des cotisations patronales (charges patronales) en EUR
- totalEmployerCost (number|null) : coût total employeur en EUR (souvent intitulé "Coût total" ou "Coût employeur")
- bonuses (number|null) : total des primes / gratifications en EUR (0 si absent)
- overtime (number|null) : montant des heures supplémentaires en EUR (0 si absent)
- deductions (number|null) : autres retenues / acomptes / saisies sur salaire en EUR (0 si absent)
- paidDate (string|null) : date de versement YYYY-MM-DD si visible (souvent en pied de bulletin)

Règles strictes :
- Si un champ n'est pas lisible ou absent, mets null. Ne devine pas.
- Pour les nombres, utilise le point décimal (1234.56 pas 1 234,56).
- Les bulletins français utilisent souvent la virgule décimale et l'espace comme séparateur de milliers : convertis avant de retourner.
- Pour les dates, format YYYY-MM-DD obligatoire.
- Pour la période YYYY-MM, mets le mois auquel correspond le bulletin (mois travaillé), pas la date d'édition.
- Réponds avec le JSON pur, sans préfixe \`\`\`json ni explication.`;

interface ParseAttempt {
  provider: "openai" | "gemini" | "grok";
  fields: PayslipFields;
}

const PROVIDER_MODELS: Record<"openai" | "gemini" | "grok", string> = {
  openai: "gpt-4o-mini",
  gemini: "gemini-2.5-flash",
  grok: "grok-2-vision-latest",
};

/**
 * Parse un bulletin de paie via Vision API.
 *
 *   - Image (jpeg/png/webp) : provider chain OpenAI → Gemini → Grok via
 *     l'interface OpenAI-compat (data URL inline).
 *   - PDF : appel direct Gemini natif (`inline_data` mime
 *     `application/pdf`). PDF = Gemini ou rien.
 *
 * Throws si aucun provider configuré OU tous échouent.
 */
export async function parsePayslipImage(
  fileBase64: string,
  mimeType: SupportedMime,
): Promise<ParseAttempt> {
  if (mimeType === SUPPORTED_PDF_MIME_TYPE) {
    return parsePdfViaGemini(fileBase64);
  }

  const order: Array<"openai" | "gemini" | "grok"> = ["openai", "gemini", "grok"];
  const dataUrl = `data:${mimeType};base64,${fileBase64}`;

  let lastError = "";
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
                text: "Extrais les champs structurés de ce bulletin de paie. Réponds avec le JSON demandé.",
              },
              {
                type: "image_url",
                image_url: { url: dataUrl },
              },
            ],
          },
        ],
        max_tokens: 800,
        temperature: 0,
      });

      const text = response.choices?.[0]?.message?.content?.trim() ?? "";
      const json = stripCodeFence(text);
      const raw = JSON.parse(json);
      const fields = PayslipFieldsSchema.parse(raw);
      return { provider, fields };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      lastError = `${provider}: ${msg}`;
      console.warn(`[PayslipParser] ${lastError}`);
      continue;
    }
  }

  if (!triedAny) {
    throw new Error(
      "Aucun provider OCR configuré (OPENAI_API_KEY / GEMINI_API_KEY / XAI_API_KEY).",
    );
  }
  throw new Error(`OCR a échoué sur tous les providers. Dernier : ${lastError}`);
}

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
              {
                text: "Extrais les champs structurés de ce bulletin de paie. Réponds avec le JSON demandé.",
              },
              { inline_data: { mime_type: "application/pdf", data: pdfBase64 } },
            ],
          },
        ],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 800,
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
  const fields = PayslipFieldsSchema.parse(JSON.parse(stripCodeFence(text)));
  return { provider: "gemini", fields };
}
