/**
 * Alfred — AI Assistant for myBeez
 *
 * Tenant-agnostic: the system prompt is built dynamically from the
 * tenant's name and vocabulary overrides, so a salon, a garage and a
 * boulangerie each get an Alfred that talks about their world.
 *
 * Provider chain: OpenAI → Gemini → Grok (xAI) fallback.
 */

import { getAI } from "../core/openaiClient";
import { tenantService } from "../tenantService";
import type { Tenant } from "../../../shared/schema/tenants";
import { buildSystemPrompt } from "./prompt";

export { buildSystemPrompt };

export interface AlfredMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AlfredResponse {
  text: string;
  provider: string;
  tokensUsed?: number;
}

interface ChecklistContext {
  total: number;
  checked: number;
  unchecked: number;
  uncheckedItems: string[];
}

interface ChatContext {
  checklist?: ChecklistContext;
  stats?: Record<string, unknown>;
}

class AlfredService {
  private conversationHistory: Map<string, AlfredMessage[]> = new Map();

  private async resolveTenant(tenantSlug: string): Promise<Tenant> {
    const tenant = await tenantService.getBySlug(tenantSlug);
    if (!tenant) {
      throw new Error(`Alfred: unknown tenant slug "${tenantSlug}"`);
    }
    return tenant;
  }

  async chat(
    tenantSlug: string,
    userMessage: string,
    context?: ChatContext,
  ): Promise<AlfredResponse> {
    const tenant = await this.resolveTenant(tenantSlug);
    const sessionKey = tenant.slug;

    if (!this.conversationHistory.has(sessionKey)) {
      this.conversationHistory.set(sessionKey, []);
    }
    const history = this.conversationHistory.get(sessionKey)!;

    let contextBlock = "";
    if (context?.checklist) {
      const { total, checked, unchecked, uncheckedItems } = context.checklist;
      contextBlock += `\n\n[Checklist du jour — ${tenant.name}]\nTotal: ${total} | Cochés: ${checked} | Restants: ${unchecked}`;
      if (uncheckedItems?.length > 0) {
        contextBlock += `\nNon cochés: ${uncheckedItems.slice(0, 20).join(", ")}`;
      }
    }
    if (context?.stats) {
      contextBlock += `\n\n[Stats]: ${JSON.stringify(context.stats)}`;
    }

    const messages: AlfredMessage[] = [
      { role: "system", content: buildSystemPrompt(tenant) + contextBlock },
      ...history.slice(-10),
      { role: "user", content: userMessage },
    ];

    const providers = ["openai", "gemini", "grok"] as const;
    let lastError = "";

    for (const provider of providers) {
      try {
        const ai = getAI(provider);
        if (!ai) {
          lastError = `${provider}: not configured`;
          continue;
        }

        const response = await ai.chat.completions.create({
          model:
            provider === "openai"
              ? "gpt-4o-mini"
              : provider === "gemini"
                ? "gemini-2.0-flash"
                : "grok-3-mini",
          messages: messages.map((m) => ({ role: m.role, content: m.content })),
          max_tokens: 1024,
          temperature: 0.7,
        });

        const text = response.choices?.[0]?.message?.content || "";
        if (!text) {
          lastError = `${provider}: empty response`;
          continue;
        }

        history.push({ role: "user", content: userMessage });
        history.push({ role: "assistant", content: text });
        if (history.length > 20) {
          history.splice(0, history.length - 20);
        }

        return {
          text,
          provider,
          tokensUsed: response.usage?.total_tokens,
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        lastError = `${provider}: ${msg}`;
        console.warn(`[Alfred] ${lastError}`);
        continue;
      }
    }

    return {
      text: "Désolé, je suis temporairement indisponible. Veuillez réessayer dans quelques instants.",
      provider: "fallback",
    };
  }

  async analyzeChecklist(
    tenantSlug: string,
    categories: Array<{ name: string; items?: unknown[] }>,
    summary: ChecklistContext,
  ): Promise<AlfredResponse> {
    const tenant = await this.resolveTenant(tenantSlug);
    const pct = summary.total > 0 ? Math.round((summary.checked / summary.total) * 100) : 0;

    const prompt = `Analyse cette checklist du jour pour ${tenant.name} :

- ${summary.checked}/${summary.total} items cochés (${pct}%)
- ${summary.unchecked} items restants : ${summary.uncheckedItems.join(", ")}

Catégories : ${categories.map((c) => `${c.name} (${c.items?.length ?? 0} items)`).join(", ")}

Donne-moi un résumé rapide et des suggestions.`;

    return this.chat(tenantSlug, prompt, { checklist: summary });
  }

  clearHistory(tenantSlug: string): void {
    this.conversationHistory.delete(tenantSlug);
  }
}

export const alfredService = new AlfredService();
