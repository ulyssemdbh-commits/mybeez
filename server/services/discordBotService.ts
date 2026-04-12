/**
 * Discord Bot Service — myBeez
 *
 * Sends shopping lists and alerts to Discord channels.
 * Requires DISCORD_BOT_TOKEN and DISCORD_CHANNEL_ID env vars.
 */

interface ShoppingListResult {
  success: boolean;
  itemsSent: number;
  error?: string;
}

class DiscordBotService {
  private token: string | null = null;
  private channelId: string | null = null;

  constructor() {
    this.token = process.env.DISCORD_BOT_TOKEN || null;
    this.channelId = process.env.DISCORD_CHANNEL_ID || null;
    if (this.token) {
      console.log("[Discord] Bot configured");
    } else {
      console.log("[Discord] Bot not configured (DISCORD_BOT_TOKEN not set)");
    }
  }

  isReady(): boolean {
    return !!this.token && !!this.channelId;
  }

  async sendMessage(channelId: string, content: string): Promise<boolean> {
    if (!this.token) {
      console.warn("[Discord] Cannot send — bot not configured");
      return false;
    }

    try {
      const response = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
        method: "POST",
        headers: {
          Authorization: `Bot ${this.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ content }),
      });

      if (!response.ok) {
        const err = await response.text();
        console.error(`[Discord] Send failed (${response.status}):`, err);
        return false;
      }

      return true;
    } catch (err: any) {
      console.error("[Discord] Send error:", err.message);
      return false;
    }
  }

  async sendShoppingList(
    tenantId: string,
    summary: Array<{ itemName: string; categoryName: string; zoneName?: string }>,
  ): Promise<ShoppingListResult> {
    if (!this.isReady()) {
      return {
        success: false,
        itemsSent: 0,
        error: "Discord bot not configured (DISCORD_BOT_TOKEN missing)",
      };
    }

    if (summary.length === 0) {
      return { success: true, itemsSent: 0 };
    }

    const byCategory: Record<string, string[]> = {};
    for (const item of summary) {
      if (!byCategory[item.categoryName]) byCategory[item.categoryName] = [];
      byCategory[item.categoryName].push(item.itemName);
    }

    const restaurantName = tenantId === "val" ? "Valentine" : tenantId === "maillane" ? "Maillane" : tenantId;
    const today = new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });

    const lines = [
      `🛒 **Liste des courses — ${restaurantName}**`,
      `📅 ${today}`,
      "",
      ...Object.entries(byCategory).map(
        ([cat, items]) => `**${cat}** (${items.length})\n${items.map((i) => `  • ${i}`).join("\n")}`,
      ),
      "",
      `_Total : ${summary.length} articles_`,
    ];

    const message = lines.join("\n");
    const sent = await this.sendMessage(this.channelId!, message);

    return {
      success: sent,
      itemsSent: sent ? summary.length : 0,
      error: sent ? undefined : "Failed to send Discord message",
    };
  }

  async sendAlert(tenantId: string, title: string, message: string): Promise<boolean> {
    if (!this.isReady()) return false;

    const restaurantName = tenantId === "val" ? "Valentine" : "Maillane";
    return this.sendMessage(
      this.channelId!,
      `⚠️ **${title}** — ${restaurantName}\n${message}`,
    );
  }
}

export const discordBotService = new DiscordBotService();
