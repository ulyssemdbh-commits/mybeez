/**
 * Onboarding routes — public signup that creates a user AND their first tenant.
 *
 *   POST /api/onboarding/signup-with-tenant
 *   GET  /api/onboarding/check-slug?slug=...
 *
 * The user is auto-logged-in on success and redirected to their tenant
 * subdomain by the front-end using the `tenantUrl` returned in the body.
 *
 * Email verification stays the same async flow as plain signup — the
 * user can use the app immediately, the verify link arrives by mail.
 */

import type { Express, Request, Response } from "express";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { tenants } from "../../shared/schema/tenants";
import { businessTemplates } from "../../shared/schema/templates";
import { userService, EmailAlreadyExistsError } from "../services/auth/userService";
import { tenantService } from "../services/tenantService";
import { userTenantService } from "../services/auth/userTenantService";
import { sendVerificationEmail } from "../services/auth/mailService";
import { PASSWORD_LIMITS } from "../services/auth/passwordService";

function getAppBaseUrl(req: Request): string {
  if (process.env.APP_BASE_URL) return process.env.APP_BASE_URL.replace(/\/+$/, "");
  return `${req.protocol}://${req.get("host") ?? "localhost"}`;
}

function getPrimaryRootDomain(): string {
  const raw = process.env.ROOT_DOMAINS || "mybeez-ai.com,localhost";
  return raw.split(",")[0]!.trim().toLowerCase();
}

function tenantUrlFor(slug: string): string {
  // Use HTTPS in prod; in dev (NODE_ENV !== production) use the request scheme.
  const root = getPrimaryRootDomain();
  const proto = process.env.NODE_ENV === "production" ? "https" : "http";
  return `${proto}://${slug}.${root}`;
}

/** Strict slug rules: 3-30 chars, lowercase, digits, hyphens. */
const slugRegex = /^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])?$/;

const RESERVED_SLUGS = new Set([
  "www", "api", "admin", "auth", "app", "static", "assets",
  "123admin", "onboarding", "mail", "support", "help", "docs",
  "blog", "status", "cdn", "img", "images", "files", "uploads",
  "login", "signup", "logout", "verify", "reset", "forgot-password",
]);

async function isSlugAvailable(slug: string): Promise<boolean> {
  if (RESERVED_SLUGS.has(slug)) return false;
  const [row] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, slug));
  return !row;
}

async function suggestAvailableSlug(base: string): Promise<string> {
  let candidate = base;
  let i = 2;
  while (!(await isSlugAvailable(candidate))) {
    candidate = `${base}-${i}`;
    i++;
    if (i > 50) break;
  }
  return candidate;
}

const signupSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(PASSWORD_LIMITS.min).max(PASSWORD_LIMITS.max),
  fullName: z.string().min(1).max(120).optional(),
  tenantName: z.string().min(1).max(120),
  tenantSlug: z
    .string()
    .min(3)
    .max(30)
    .regex(slugRegex, "3 à 30 caractères, lettres minuscules, chiffres et tirets uniquement"),
  templateId: z.number().int().positive(),
});

export function registerOnboardingRoutes(app: Express): void {
  app.get("/api/onboarding/check-slug", async (req: Request, res: Response) => {
    try {
      const slug = String(req.query.slug ?? "").trim().toLowerCase();
      if (!slugRegex.test(slug)) {
        return res.json({ available: false, reason: "format" });
      }
      if (RESERVED_SLUGS.has(slug)) {
        return res.json({ available: false, reason: "reserved" });
      }
      const free = await isSlugAvailable(slug);
      if (free) return res.json({ available: true });
      const suggestion = await suggestAvailableSlug(slug);
      return res.json({ available: false, reason: "taken", suggestion });
    } catch (error) {
      console.error("[onboarding] check-slug error:", error);
      res.status(500).json({ error: "Erreur" });
    }
  });

  app.post("/api/onboarding/signup-with-tenant", async (req: Request, res: Response) => {
    try {
      const data = signupSchema.parse(req.body);

      // Validate template exists AND is a sub-template (top-level templates
      // are the verticales themselves, not pickable for a tenant).
      const [template] = await db
        .select({ id: businessTemplates.id, parentId: businessTemplates.parentId, slug: businessTemplates.slug })
        .from(businessTemplates)
        .where(eq(businessTemplates.id, data.templateId));
      if (!template) {
        return res.status(400).json({ error: "Template inconnu" });
      }
      if (template.parentId === null) {
        return res.status(400).json({ error: "Choisissez un sous-type d'activité, pas un vertical entier" });
      }

      if (!(await isSlugAvailable(data.tenantSlug))) {
        const suggestion = await suggestAvailableSlug(data.tenantSlug);
        return res.status(409).json({
          error: "Cette URL est déjà prise",
          field: "tenantSlug",
          suggestion,
        });
      }

      // 1. Create user. Throws on email collision.
      let user;
      try {
        user = await userService.create({
          email: data.email,
          password: data.password,
          fullName: data.fullName ?? null,
          locale: "fr",
        });
      } catch (e) {
        if (e instanceof EmailAlreadyExistsError) {
          return res.status(409).json({ error: "Cet email est déjà utilisé", field: "email" });
        }
        throw e;
      }

      // 2. Create tenant. PIN auth purgée — pas de pinCode/adminCode à fournir
      // (les colonnes restent dans le schema en nullable, écrites à NULL).
      const tenant = await tenantService.create({
        name: data.tenantName,
        slug: data.tenantSlug,
        templateId: data.templateId,
        businessType: template.slug,
      });

      // 3. Link user as Owner.
      await userTenantService.upsert(user.id, tenant.id, "owner");

      // 4. Issue verification token + send email (best-effort).
      try {
        const token = await userService.issueEmailVerificationToken(user.id);
        const verifyUrl = `${getAppBaseUrl(req)}/auth/verify?token=${encodeURIComponent(token)}`;
        await sendVerificationEmail({ email: user.email, fullName: user.fullName }, verifyUrl);
      } catch (mailErr) {
        console.error("[onboarding] verification email failed:", mailErr);
      }

      // 5. Auto-login the new user.
      const session = req.session as unknown as { userId?: number; currentTenantId?: number };
      session.userId = user.id;
      session.currentTenantId = tenant.id;
      await userService.recordLogin(user.id);

      res.status(201).json({
        user: {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
        },
        tenant: {
          id: tenant.id,
          slug: tenant.slug,
          name: tenant.name,
        },
        tenantUrl: tenantUrlFor(tenant.slug),
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Données invalides", details: error.errors });
      }
      console.error("[onboarding] signup error:", error);
      res.status(500).json({ error: "Erreur de création du compte" });
    }
  });
}
