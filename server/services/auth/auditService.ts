/**
 * Audit log writer — PR #13b.
 *
 * Ecrit dans la table `audit_log` (definie dans `shared/schema/users.ts`).
 * Consomme par les routes auth/MFA, les routes de gestion tenant
 * sensible, et les mutations business (purchases / expenses / suppliers).
 *
 * Convention `event` : `domain.action.outcome` en kebab-case par segment.
 * Exemples : `auth.login.success`, `auth.login.failure`, `mfa.disabled`,
 * `purchases.created`, `tenant.role.changed`.
 *
 * Properties cles :
 *   - **fail-soft** : un echec DB ne casse JAMAIS la requete utilisateur.
 *     Le but de l'audit log est *post-hoc* (comprendre apres-coup ce qui
 *     s'est passe). Si on bloque la requete sur une erreur d'audit, un
 *     incident DB devient un incident produit. Donc try/catch + console.error
 *     uniquement.
 *   - **scrub des secrets** : la `metadata` JSON est nettoyee avant
 *     insertion (passwords, tokens, secrets MFA jamais persistes meme
 *     accidentellement).
 *   - **IP + UA capturees** : pour pouvoir tracer geo/device en cas
 *     d'incident. Express trust-proxy doit etre activee pour que `req.ip`
 *     reflete la vraie IP derriere CF/nginx (deja configure cote
 *     server/index.ts).
 */

import type { Request } from "express";
import { db } from "../../db";
import { auditLog } from "../../../shared/schema/users";
import { moduleLogger } from "../../lib/logger";

const log = moduleLogger("Audit");

/** Cles a JAMAIS persister, meme via accident copy/paste depuis req.body. */
const SENSITIVE_KEYS = new Set([
  "password",
  "newpassword",
  "currentpassword",
  "passwordhash",
  "token",
  "refreshtoken",
  "accesstoken",
  "verificationtoken",
  "resettoken",
  "totpcode",
  "totpsecret",
  "mfasecret",
  "recoverycode",
  "imagebase64",
  "filebase64",
  "pdfbase64",
  "apikey",
  "secret",
  "authorization",
  "cookie",
]);

/** Profondeur max de scan recursif pour eviter d'exploser sur des
 *  objets cycliques ou monstrueux. Au-dela, on tronque. */
const MAX_DEPTH = 4;
/** Taille max d'une string dans la metadata. Au-dela, tronquee. */
const MAX_STRING_LEN = 500;

/**
 * Scrub recursif. Retourne un objet *clone* sans valeurs sensibles, avec
 * les chaines tronquees a MAX_STRING_LEN. Idempotent et pur.
 */
export function scrubMetadata(input: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) return "[truncated:max-depth]";
  if (input === null || input === undefined) return input;
  if (typeof input === "string") {
    return input.length > MAX_STRING_LEN ? input.slice(0, MAX_STRING_LEN) + "…" : input;
  }
  if (typeof input === "number" || typeof input === "boolean") return input;
  if (Array.isArray(input)) {
    return input.slice(0, 50).map((v) => scrubMetadata(v, depth + 1));
  }
  if (typeof input === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      const norm = k.toLowerCase().replace(/[_\-\s]/g, "");
      if (SENSITIVE_KEYS.has(norm)) {
        out[k] = "[redacted]";
        continue;
      }
      out[k] = scrubMetadata(v, depth + 1);
    }
    return out;
  }
  // bigint, function, symbol — on ignore.
  return undefined;
}

interface RecordAuditArgs {
  /** Requete Express (pour IP, UA, session). */
  req: Request;
  /** Identifiant stable de l'evenement (ex. `auth.login.success`). */
  event: string;
  /** Override le userId capture sur la session (utile pour login.failure
   *  quand on connait l'id mais qu'il n'est pas encore dans la session). */
  userId?: number | null;
  /** Override le tenantId capture sur req.tenantId (utile pour les
   *  events qui mentionnent un tenant pas encore resolu via le middleware). */
  tenantId?: number | null;
  /** Donnees additionnelles non-sensibles. Sera scrubbed avant insert. */
  metadata?: Record<string, unknown>;
}

/**
 * Ecrit une entree d'audit log. JAMAIS rejete : capture toute erreur en
 * interne. Le caller peut donc oublier l'await sans risque.
 */
export async function recordAudit(args: RecordAuditArgs): Promise<void> {
  try {
    const session = (args.req.session ?? {}) as {
      userId?: number;
      mfaPendingUserId?: number;
    };
    const userId =
      args.userId !== undefined ? args.userId : (session.userId ?? null);
    const tenantId =
      args.tenantId !== undefined ? args.tenantId : (args.req.tenantId ?? null);

    const ip = args.req.ip ?? null;
    const ua = args.req.get?.("user-agent") ?? null;

    const metadata = (scrubMetadata(args.metadata ?? {}) as Record<string, unknown>) ?? {};

    await db.insert(auditLog).values({
      userId: userId ?? null,
      tenantId: tenantId ?? null,
      event: args.event,
      metadata,
      ipAddress: ip,
      userAgent: ua ? ua.slice(0, 500) : null,
    });
  } catch (err) {
    // Fail-soft : on logue mais on ne propage pas. Un incident DB ne doit
    // pas devenir un incident produit a cause de l'audit.
    log.error({ err, event: args.event }, "failed to record event");
  }
}
