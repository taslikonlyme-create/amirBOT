import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { getLevelingConfig } from '../../services/leveling/leveling.js';
import { getWeeklyLevelingPrefix } from '../../utils/database/keys.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
  data: new SlashCommandBuilder()
    .setName('weeklyleaderboard')
    .setDescription("Shows this period's activity leaderboard")
    .setDMPermission(false),
  category: 'Leveling',

  async execute(interaction, config, client) {
    await InteractionHelper.safeDefer(interaction);

    const levelingConfig = await getLevelingConfig(client, interaction.guildId);
    if (!levelingConfig?.enabled) {
      await InteractionHelper.safeEditReply(interaction, {
        embeds: [
          new EmbedBuilder()
            .setColor('#f1c40f')
            .setDescription('The leveling system is currently disabled on this server.')
        ],
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const prefix = getWeeklyLevelingPrefix(interaction.guildId);
    const listedKeys = await client.db.list(prefix);
    const keys = Array.isArray(listedKeys) ? listedKeys : [];
    const leaderboard = [];

    for (const key of keys) {
      if (typeof key !== 'string' || !key.startsWith(prefix)) continue;

      const weeklyData = await client.db.get(key);
      const xp = Math.max(0, Number(weeklyData?.xp) || 0);
      const levels = Math.max(0, Number(weeklyData?.levels) || 0);
      if (xp > 0 || levels > 0) {
        leaderboard.push({ userId: key.slice(prefix.length), xp, levels });
      }
    }

    leaderboard.sort((a, b) => b.xp - a.xp || b.levels - a.levels);

    if (leaderboard.length === 0) {
      await InteractionHelper.safeEditReply(interaction, {
        embeds: [
          new EmbedBuilder()
            .setColor('#f1c40f')
            .setTitle('Weekly Activity Leaderboard')
            .setDescription('No activity has been recorded for this period yet.')
        ],
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const rows = await Promise.all(
      leaderboard.slice(0, 10).map(async (entry, index) => {
        const member = await interaction.guild.members.fetch(entry.userId).catch(() => null);
        const user = member?.user.toString() || `<@${entry.userId}>`;
        const rank = ['🥇', '🥈', '🥉'][index] || `**${index + 1}.**`;
        return `${rank} ${user} — **${entry.xp} XP** earned, **${entry.levels}** level(s) gained`;
      })
    );

    const embed = new EmbedBuilder()
      .setTitle('Weekly Activity Leaderboard')
      .setColor('#2ecc71')
      .setDescription('Activity since the last weekly reset, ranked by XP earned.')
      .addFields({ name: 'Rankings', value: rows.join('\n') })
      .setTimestamp();

    await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    logger.debug(`Weekly activity leaderboard displayed for guild ${interaction.guildId}`);
  }
};
