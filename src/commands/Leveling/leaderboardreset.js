import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, MessageFlags } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { checkUserPermissions } from '../../utils/permissionGuard.js';
import { getLevelingConfig } from '../../services/leveling/leveling.js';
import { getWeeklyLevelingPrefix } from '../../utils/database/keys.js';
import { createEmbed } from '../../utils/embeds.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
  data: new SlashCommandBuilder()
    .setName('leaderboardreset')
    .setDescription('Reset the weekly activity leaderboard without changing levels')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false),
  category: 'Leveling',

  async execute(interaction, config, client) {
    await InteractionHelper.safeDefer(interaction);

    const hasPermission = await checkUserPermissions(
      interaction,
      PermissionFlagsBits.ManageGuild,
      'You need ManageGuild permission to use this command.'
    );
    if (!hasPermission) return;

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
    const keys = Array.isArray(listedKeys)
      ? listedKeys.filter(key => typeof key === 'string' && key.startsWith(prefix))
      : [];

    if (keys.length === 0) {
      await InteractionHelper.safeEditReply(interaction, {
        embeds: [
          createEmbed({
            title: 'No Weekly Data',
            description: 'There is no weekly activity data to reset.',
            color: 'warning'
          })
        ],
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    let deleted = 0;
    let failed = 0;

    for (const key of keys) {
      if (await client.db.delete(key)) {
        deleted += 1;
      } else {
        failed += 1;
      }
    }

    if (failed > 0) {
      logger.error(
        `[ADMIN] ${interaction.user.tag} partially reset the weekly activity leaderboard in guild ${interaction.guildId}: deleted ${deleted}, failed ${failed}`
      );

      await InteractionHelper.safeEditReply(interaction, {
        embeds: [
          createEmbed({
            title: 'Leaderboard Reset Incomplete',
            description: `Reset data for ${deleted} member(s), but failed for ${failed} member(s). Check the bot logs.`,
            color: 'error'
          })
        ]
      });
      return;
    }

    await InteractionHelper.safeEditReply(interaction, {
      embeds: [
        createEmbed({
          title: 'Weekly Leaderboard Reset',
          description: `Successfully reset weekly activity for ${deleted} member(s). Their levels and total XP were not changed.`,
          color: 'success'
        })
      ]
    });

    logger.info(
      `[ADMIN] User ${interaction.user.tag} reset weekly activity in guild ${interaction.guildId}; deleted ${deleted} records`
    );
  }
};
