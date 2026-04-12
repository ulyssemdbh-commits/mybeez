/**
 * discordBotService — myBeez stub.
 *
 * Used by:
 *   - server/routes/checklist.ts → POST /:tenant/send-discord  (sendShoppingList)
 *   - server/routes/suguval.ts   → GET /discord/guilds, GET /discord/channels,
 *                                   POST /discord/send             (isReady, getGuilds, getChannels, sendMessage)
 *
 * This is a no-op stub. To activate Discord:
 *   1. Install the discord.js package: `npm install discord.js`
 *   2. Set DISCORD_BOT_TOKEN in your .env
 *   3. Replace the method bodies below with the real discord.js implementation.
 */

interface Guild {
  id: string;
  name: string;
}

interface Channel {
  id: string;
  name: string;
  type: string;
}

interface SendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

interface ShoppingListResult {
  success: boolean;
  itemsSent: number;
  error?: string;
}

class DiscordBotService {
  private readonly token: string | undefined;

  constructor() {
    this.token = process.env.DISCORD_BOT_TOKEN;
    if (!this.token) {
      console.warn(
        "[Discord] DISCORD_BOT_TOKEN not set — Discord features are disabled.",
      );
    }
  }

  /** Returns true when the bot is configured and ready to send messages. */
  isReady(): boolean {
    return !!this.token;
  }

  /** Returns the list of guilds (servers) the bot belongs to. */
  async getGuilds(): Promise<Guild[]> {
    if (!this.isReady()) return [];
    // TODO: replace with discord.js Client.guilds.cache.map(...)
    console.warn("[Discord] getGuilds — stub, returning empty list");
    return [];
  }

  /** Returns text channels for a given guild ID. */
  async getChannels(guildId: string): Promise<Channel[]> {
    if (!this.isReady()) return [];
    // TODO: replace with discord.js Guild.channels.cache.filter(TextChannel)
    console.warn(`[Discord] getChannels(${guildId}) — stub, returning empty list`);
    return [];
  }

  /** Sends a plain text message to a channel. */
  async sendMessage(channelId: string, message: string): Promise<boolean> {
    if (!this.isReady()) {
      console.warn("[Discord] sendMessage — bot not ready (token missing)");
      return false;
    }
    // TODO: replace with discord.js TextChannel.send(message)
    console.log(`[Discord] sendMessage to channel ${channelId}:\n${message}`);
    return false; // stub: always fails until implemented
  }

  /**
   * Sends the shopping list for a tenant to Discord.
   * Called by POST /:tenant/send-discord in checklist.ts.
   *
   * @param tenantId  The restaurant ID ("val" | "maillane")
   * @param summary   Array of checked items returned by getCheckedItemsForToday()
   */
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

    // Build the message
    const byCategory: Record<string, string[]> = {};
    for (const item of summary) {
      if (!byCategory[item.categoryName]) byCategory[item.categoryName] = [];
      byCategory[item.categoryName].push(item.itemName);
    }

    const lines = [
      `**Liste des courses — ${tenantId.toUpperCase()}**`,
      "",
      ...Object.entries(byCategory).map(
        ([cat, items]) => `**${cat}**\n${items.map((i) => `  • ${i}`).join("\n")}`,
      ),
      "",
      `_Total : ${summary.length} articles_`,
    ];

    const message = lines.join("\n");

    // TODO: resolve the correct channel from config and call sendMessage()
    console.log(`[Discord] sendShoppingList for ${tenantId}:\n${message}`);

    return {
      success: false,
      itemsSent: 0,
      error: "Discord integration not yet implemented — replace stub with discord.js",
    };
  }
}

export const discordBotService = new DiscordBotService();
