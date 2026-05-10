/**
 * Email delivery via Resend (https://resend.com).
 *
 * Fail-soft in dev: if `RESEND_API_KEY` is missing, mails are logged
 * to stdout instead of sent. This lets a developer test the auth flow
 * end-to-end locally without provisioning Resend, while production
 * boot still loudly warns once at startup if the key is missing.
 *
 * Templates are intentionally minimal text/html. UX polish + i18n can
 * come later; the security pieces (token in URL, expiry hint, no PII
 * in subject) matter more than the design at this stage.
 */

import { Resend } from "resend";
import { moduleLogger } from "../../lib/logger";

const log = moduleLogger("Mail");

interface MailRecipient {
  email: string;
  fullName?: string | null;
}

interface MailAttachment {
  filename: string;
  content: Buffer;
}

interface SendArgs {
  to: MailRecipient;
  subject: string;
  text: string;
  html: string;
  attachments?: MailAttachment[];
}

const FROM_DEFAULT = "myBeez <noreply@mybeez-ai.com>";

function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  const apiKey = env.RESEND_API_KEY;
  const from = env.MAIL_FROM ?? FROM_DEFAULT;
  return { apiKey, from };
}

let cachedClient: Resend | null = null;
function getClient(apiKey: string): Resend {
  if (!cachedClient) cachedClient = new Resend(apiKey);
  return cachedClient;
}

/**
 * Reset the cached Resend client. Used by tests; not exported in
 * production paths.
 */
export function _resetMailClientForTests() {
  cachedClient = null;
}

async function send(args: SendArgs): Promise<{ delivered: boolean; provider: "resend" | "console" }> {
  const cfg = loadConfig();
  if (!cfg.apiKey) {
    const attachSummary = args.attachments?.length
      ? {
          count: args.attachments.length,
          totalBytes: args.attachments.reduce((s, a) => s + a.content.length, 0),
        }
      : undefined;
    log.info(
      {
        to: args.to.email,
        subject: args.subject,
        text: args.text,
        ...(attachSummary ? { attachments: attachSummary } : {}),
      },
      "dev mode: no RESEND_API_KEY, printing email instead of sending",
    );
    return { delivered: false, provider: "console" };
  }
  const client = getClient(cfg.apiKey);
  const payload: Parameters<typeof client.emails.send>[0] = {
    from: cfg.from,
    to: args.to.email,
    subject: args.subject,
    text: args.text,
    html: args.html,
  };
  if (args.attachments?.length) {
    payload.attachments = args.attachments.map((a) => ({
      filename: a.filename,
      content: a.content,
    }));
  }
  const result = await client.emails.send(payload);
  if (result.error) {
    throw new Error(`Resend send failed: ${result.error.message ?? "unknown"}`);
  }
  return { delivered: true, provider: "resend" };
}

// ============================== Templates ==============================

export function buildVerificationEmail(to: MailRecipient, verifyUrl: string): SendArgs {
  const greeting = to.fullName ? `Bonjour ${to.fullName},` : "Bonjour,";
  const text = `${greeting}

Bienvenue sur myBeez. Pour activer votre compte, cliquez sur le lien ci-dessous (valable 24h) :

${verifyUrl}

Si vous n'avez pas créé ce compte, ignorez ce message.

— L'équipe myBeez`;
  const html = `<p>${greeting}</p>
<p>Bienvenue sur myBeez. Pour activer votre compte, cliquez sur le lien ci-dessous (valable 24h) :</p>
<p><a href="${verifyUrl}">Activer mon compte</a></p>
<p>Si vous n'avez pas créé ce compte, ignorez ce message.</p>
<p>— L'équipe myBeez</p>`;
  return {
    to,
    subject: "Confirmez votre adresse email myBeez",
    text,
    html,
  };
}

export function buildPasswordResetEmail(to: MailRecipient, resetUrl: string): SendArgs {
  const greeting = to.fullName ? `Bonjour ${to.fullName},` : "Bonjour,";
  const text = `${greeting}

Vous avez demandé la réinitialisation de votre mot de passe myBeez. Cliquez sur le lien ci-dessous (valable 1h) :

${resetUrl}

Si vous n'êtes pas à l'origine de cette demande, ignorez ce message — votre mot de passe actuel reste valide.

— L'équipe myBeez`;
  const html = `<p>${greeting}</p>
<p>Vous avez demandé la réinitialisation de votre mot de passe myBeez. Cliquez sur le lien ci-dessous (valable 1h) :</p>
<p><a href="${resetUrl}">Réinitialiser mon mot de passe</a></p>
<p>Si vous n'êtes pas à l'origine de cette demande, ignorez ce message — votre mot de passe actuel reste valide.</p>
<p>— L'équipe myBeez</p>`;
  return {
    to,
    subject: "Réinitialisation de votre mot de passe myBeez",
    text,
    html,
  };
}

interface DocumentBundleArgs {
  to: MailRecipient;
  tenantName: string;
  fileNames: string[];
  subject?: string;
  message?: string;
}

export function buildDocumentBundleEmail(args: DocumentBundleArgs): SendArgs {
  const { to, tenantName, fileNames } = args;
  const greeting = to.fullName ? `Bonjour ${to.fullName},` : "Bonjour,";
  const subject = args.subject?.trim() || `Documents — ${tenantName}`;
  const intro = args.message?.trim()
    || `Veuillez trouver ci-joint ${fileNames.length === 1 ? "le document" : `les ${fileNames.length} documents`} envoyé${fileNames.length === 1 ? "" : "s"} par ${tenantName}.`;
  const listText = fileNames.map((n) => `  - ${n}`).join("\n");
  const listHtml = fileNames.map((n) => `<li>${n}</li>`).join("");
  const text = `${greeting}

${intro}

${listText}

— ${tenantName} (via myBeez)`;
  const html = `<p>${greeting}</p>
<p>${intro}</p>
<ul>${listHtml}</ul>
<p>— ${tenantName} (via myBeez)</p>`;
  return {
    to,
    subject,
    text,
    html,
  };
}

// ============================== Public API ==============================

export async function sendVerificationEmail(to: MailRecipient, verifyUrl: string) {
  return send(buildVerificationEmail(to, verifyUrl));
}

export async function sendPasswordResetEmail(to: MailRecipient, resetUrl: string) {
  return send(buildPasswordResetEmail(to, resetUrl));
}

/**
 * Sends a bundle of files to a recipient (e.g. invoice, payslip,
 * supplier docs). Used by the management/files/send-email-bulk hook.
 * Caller is responsible for capping total attachment size — Resend
 * rejects payloads above ~40MB.
 */
export async function sendDocumentBundle(
  args: DocumentBundleArgs & { attachments: MailAttachment[] },
) {
  const built = buildDocumentBundleEmail(args);
  return send({ ...built, attachments: args.attachments });
}

/**
 * One-shot warning at boot if Resend is not configured. Call from the
 * server bootstrap so the operator notices in the logs.
 */
export function warnIfMailNotConfigured() {
  const cfg = loadConfig();
  if (!cfg.apiKey) {
    log.warn(
      "RESEND_API_KEY is not set. Auth emails (verify/reset) will be logged to stdout, not sent. Suitable for dev only.",
    );
  }
}
