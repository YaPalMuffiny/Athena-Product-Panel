const { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    ChannelType,
    PermissionFlagsBits,
    MessageFlags
} = require('discord.js');
const command = require('../../../../main/discord/core/commands/command.js');

/* eslint-disable no-unused-vars, no-constant-condition */
if (null) {
	const heartType = require('../../../../types/heart.js');
	const commandType = require('../../../../types/discord/core/commands/commands.js');
	const { CommandInteraction } = require('discord.js');
}
/* eslint-enable no-unused-vars, no-constant-condition */

/**
 * Setup panel command following AthenaBot template pattern.
 * @class
 * @extends commandType
 */
module.exports = class setupPanel extends command {
    /**
     * Creates an instance of the command.
     * @param {heartType} heart - The heart of the bot.
     * @param {Object} cmdConfig - The command configuration.
     */
    constructor(heart, cmdConfig) {
        // Get product config following AthenaBot template pattern
        const productConfig = heart.core.discord.core.config.manager.get('products').get();

        super(heart, {
            name: 'setuppanel',
            data: new SlashCommandBuilder()
                .setName(cmdConfig.commands?.setuppanel?.name || 'setuppanel')
                .setDescription(cmdConfig.commands?.setuppanel?.description || 'Setup product panels in channels (Admin only)')
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('create')
                        .setDescription('Create a product panel in a channel')
                        .addChannelOption(option =>
                            option.setName('channel')
                                .setDescription('The channel to create the panel in')
                                .setRequired(true)
                                .addChannelTypes(ChannelType.GuildText)
                        )
                        .addStringOption(option =>
                            option.setName('panel')
                                .setDescription('Select which panel to create')
                                .setRequired(false)
                                .setAutocomplete(true)
                        )
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('list')
                        .setDescription('List all available panels and their status')
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('clear')
                        .setDescription('Clear all panel messages from channels')
                        .addBooleanOption(option =>
                            option.setName('confirm')
                                .setDescription('Confirm you want to clear all panels')
                                .setRequired(true)
                        )
                )
                .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
            contextMenu: false,
            global: true,
            category: 'admin',
            bypass: true, // Make sure this is set to true following template pattern
            permissionLevel: productConfig.config.permissions.channel_setup,
        });
    }

    async autocomplete(interaction) {
        try {
            const productConfig = this.heart.core.discord.core.config.manager.get('products');
            if (!productConfig) {
                return await interaction.respond([]);
            }
            
            const config = productConfig.get();
            const focusedValue = interaction.options.getFocused();
            
            const choices = [];
            
            // Add multi-panels
            if (config?.config?.panels) {
                Object.keys(config.config.panels).forEach(panelId => {
                    const panel = config.config.panels[panelId];
                    if (panel.enabled !== false) {
                        choices.push({
                            name: panel.name || panelId,
                            value: panelId
                        });
                    }
                });
            }
            
            // Add legacy panel if products exist
            if (config?.config?.legacy?.enabled && config.config.legacy.products && config.config.legacy.products.length > 0) {
                choices.push({
                    name: 'Legacy Panel',
                    value: 'legacy'
                });
            }

            const filtered = choices.filter(choice => 
                choice.name.toLowerCase().includes(focusedValue.toLowerCase())
            );

            await interaction.respond(filtered.slice(0, 25));
        } catch (err) {
            this.heart.core.console.log(this.heart.core.console.type.error, 'Error in setuppanel autocomplete:', err);
            new this.heart.core.error.interface(this.heart, err);
            await interaction.respond([]);
        }
    }

    /**
     * Executes the command.
     * @param {CommandInteraction} interaction - The interaction object.
     * @param {Object} langConfig - The language configuration.
     */
    async execute(interaction, langConfig) {
        try {
            // Check admin permissions (basic check following template pattern)
            if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
                return await interaction.reply({
                    content: '❌ You need administrator permissions to use this command.',
                    ephemeral: true
                });
            }

            const subcommand = interaction.options.getSubcommand();

            switch (subcommand) {
                case 'create':
                    await this.handleCreate(interaction);
                    break;
                case 'list':
                    await this.handleList(interaction);
                    break;
                case 'clear':
                    await this.handleClear(interaction);
                    break;
            }

        } catch (err) {
            this.heart.core.console.log(this.heart.core.console.type.error, `An issue occurred while executing command ${this.getName()}:`, err);
            new this.heart.core.error.interface(this.heart, err);
            
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    embeds: [this.heart.core.util.discord.generateErrorEmbed(langConfig.lang?.unexpected_command_error?.replace(/%command%/g, `/${interaction.commandName}`) || 'An unexpected error occurred')],
                    flags: MessageFlags.Ephemeral
                });
            }
        }
    }

    async handleCreate(interaction) {
        try {
            const productConfig = this.heart.core.discord.core.config.manager.get('products').get();
            const targetChannel = interaction.options.getChannel('channel');
            const selectedPanel = interaction.options.getString('panel');

            // Check bot permissions in target channel
            const botPerms = targetChannel.permissionsFor(interaction.guild.members.me);
            if (!botPerms.has(['SendMessages', 'EmbedLinks'])) {
                return await interaction.reply({
                    content: `❌ I don't have the required permissions in ${targetChannel}.\n\n**Required Permissions:**\n• Send Messages\n• Embed Links`,
                    ephemeral: true
                });
            }

            // Check if any panels are configured
            const hasMultiPanels = productConfig.config.panels && Object.keys(productConfig.config.panels).length > 0;
            const hasLegacyProducts = productConfig.config.legacy?.enabled && productConfig.config.legacy.products && productConfig.config.legacy.products.length > 0;

            if (!hasMultiPanels && !hasLegacyProducts) {
                return await interaction.reply({
                    content: '❌ No product panels are configured. Please configure panels in your products config first.',
                    ephemeral: true
                });
            }

            // If no panel specified and multiple options available, show available panels
            if (!selectedPanel && hasMultiPanels) {
                return await this.showAvailablePanels(interaction, productConfig, targetChannel);
            }

            // Determine which panel to create
            let panelToCreate = selectedPanel;
            if (!panelToCreate) {
                panelToCreate = hasLegacyProducts ? 'legacy' : Object.keys(productConfig.config.panels)[0];
            }

            await this.createPanel(interaction, productConfig, targetChannel, panelToCreate);
        } catch (err) {
            this.heart.core.console.log(this.heart.core.console.type.error, 'Error in handleCreate:', err);
            new this.heart.core.error.interface(this.heart, err);
            throw err;
        }
    }

    async showAvailablePanels(interaction, productConfig, targetChannel) {
        const embed = new EmbedBuilder()
            .setTitle('📋 Available Panels')
            .setDescription(`Please specify which panel you want to create in ${targetChannel}.\n\nRun the command again with the \`panel\` parameter.`)
            .setColor('#ffa500')
            .setTimestamp();

        let panelList = '';
        
        if (productConfig.config.panels) {
            Object.entries(productConfig.config.panels).forEach(([panelId, panel]) => {
                const productCount = panel.products?.length || 0;
                const enabledCount = panel.products?.filter(p => p.enabled !== false).length || 0;
                panelList += `• **${panel.name || panelId}** (\`${panelId}\`) - ${enabledCount}/${productCount} products enabled\n`;
            });
        }
        
        if (productConfig.config.legacy?.enabled && productConfig.config.legacy.products && productConfig.config.legacy.products.length > 0) {
            const enabledCount = productConfig.config.legacy.products.filter(p => p.enabled !== false).length;
            panelList += `• **Legacy Panel** (\`legacy\`) - ${enabledCount}/${productConfig.config.legacy.products.length} products enabled\n`;
        }

        embed.addFields({ name: 'Available Panels', value: panelList || 'No panels configured' });
        embed.setFooter({ text: 'Use: /setuppanel create channel:#your-channel panel:panel-id' });

        await interaction.reply({
            embeds: [embed],
            ephemeral: true
        });
    }

    async createPanel(interaction, productConfig, targetChannel, panelId) {
        await interaction.deferReply({ ephemeral: true });

        try {
            const handler = this.heart.core.discord.core.handler.manager.get('productPanel');
            
            if (panelId === 'legacy') {
                if (!productConfig.config.legacy?.enabled || !productConfig.config.legacy.products || productConfig.config.legacy.products.length === 0) {
                    return await interaction.editReply({
                        content: '❌ No legacy products are configured or legacy panel is disabled.'
                    });
                }
                await handler.setupLegacyPanelInChannel(targetChannel);
            } else {
                const panel = productConfig.config.panels[panelId];
                if (!panel) {
                    return await interaction.editReply({
                        content: '❌ Panel not found.'
                    });
                }
                if (panel.enabled === false) {
                    return await interaction.editReply({
                        content: '❌ Panel is disabled.'
                    });
                }
                await handler.setupPanelInChannel(panelId, panel, targetChannel);
            }

            const successEmbed = new EmbedBuilder()
                .setTitle('✅ Panel Created Successfully')
                .setDescription(`Product panel has been created in ${targetChannel}`)
                .addFields(
                    { name: 'Panel', value: panelId === 'legacy' ? 'Legacy Panel' : (productConfig.config.panels[panelId]?.name || panelId), inline: true },
                    { name: 'Channel', value: targetChannel.toString(), inline: true },
                    { name: 'Products', value: panelId === 'legacy' 
                        ? `${productConfig.config.legacy.products.filter(p => p.enabled !== false).length}` 
                        : `${productConfig.config.panels[panelId]?.products?.filter(p => p.enabled !== false).length || 0}`, inline: true }
                )
                .setColor('#00ff00')
                .setFooter({ text: 'Panel is now active and ready for use' })
                .setTimestamp();

            await interaction.editReply({
                embeds: [successEmbed]
            });

            this.heart.core.console.log(
                this.heart.core.console.type.log,
                `Panel "${panelId}" created by ${interaction.user.tag} in channel ${targetChannel.name} (${targetChannel.id})`
            );

        } catch (err) {
            this.heart.core.console.log(this.heart.core.console.type.error, 'Error creating panel:', err);
            new this.heart.core.error.interface(this.heart, err);
            
            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Panel Creation Failed')
                .setDescription(`Failed to create panel in ${targetChannel}.\n\n**Error:** ${err.message}\n\nCheck the bot's permissions and configuration.`)
                .setColor('#ff0000')
                .setTimestamp();

            await interaction.editReply({
                embeds: [errorEmbed]
            });
        }
    }

    async handleList(interaction) {
        try {
            const productConfig = this.heart.core.discord.core.config.manager.get('products').get();
            const handler = this.heart.core.discord.core.handler.manager.get('productPanel');

            const embed = new EmbedBuilder()
                .setTitle('📊 Panel Configuration Status')
                .setColor('#0099ff')
                .setTimestamp();

            let configInfo = '';
            let statusInfo = '';

            // Multi-panels
            if (productConfig.config.panels && Object.keys(productConfig.config.panels).length > 0) {
                configInfo += '**Multi-Panels:**\n';
                Object.entries(productConfig.config.panels).forEach(([panelId, panel]) => {
                    const productCount = panel.products?.length || 0;
                    const enabledCount = panel.products?.filter(p => p.enabled !== false).length || 0;
                    const status = panel.enabled === false ? ' (DISABLED)' : '';
                    configInfo += `• ${panel.name || panelId} (${enabledCount}/${productCount} products)${status}\n`;
                });
                configInfo += '\n';
            }

            // Legacy panel
            if (productConfig.config.legacy?.enabled && productConfig.config.legacy.products && productConfig.config.legacy.products.length > 0) {
                const enabledCount = productConfig.config.legacy.products.filter(p => p.enabled !== false).length;
                configInfo += `**Legacy Panel:**\n• ${enabledCount}/${productConfig.config.legacy.products.length} products configured\n\n`;
            }

            if (!configInfo) {
                configInfo = 'No panels configured\n';
            }

            // Active panels status
            const activePanels = handler.panelMessages.size;
            const databaseLoaded = handler.databaseLoaded;
            statusInfo += `**Active Panels:** ${activePanels} messages\n`;
            statusInfo += `**Database Status:** ${databaseLoaded ? 'Loaded' : 'Not loaded'}\n`;
            
            if (activePanels > 0) {
                statusInfo += '**Channels with panels:**\n';
                const channelIds = new Set();
                for (const [messageKey] of handler.panelMessages) {
                    const channelId = messageKey.split('-')[0];
                    channelIds.add(channelId);
                }
                
                for (const channelId of channelIds) {
                    const channel = interaction.guild.channels.cache.get(channelId);
                    if (channel) {
                        statusInfo += `• ${channel.name}\n`;
                    }
                }
            }

            embed.addFields(
                { name: 'Configuration', value: configInfo },
                { name: 'Status', value: statusInfo }
            );

            await interaction.reply({
                embeds: [embed],
                ephemeral: true
            });
        } catch (err) {
            this.heart.core.console.log(this.heart.core.console.type.error, 'Error in handleList:', err);
            new this.heart.core.error.interface(this.heart, err);
            throw err;
        }
    }

    async handleClear(interaction) {
        try {
            const confirm = interaction.options.getBoolean('confirm');
            
            if (!confirm) {
                return await interaction.reply({
                    content: '❌ You must confirm to clear all panels. Set `confirm` to `True`.',
                    ephemeral: true
                });
            }

            await interaction.deferReply({ ephemeral: true });

            const handler = this.heart.core.discord.core.handler.manager.get('productPanel');
            const result = await handler.clearAllPanelMessages();

            const embed = new EmbedBuilder()
                .setTitle('🗑️ Panels Cleared')
                .setDescription('All product panel messages have been removed from channels and database.')
                .addFields(
                    { name: 'Messages Removed', value: `${result.removedCount}`, inline: true },
                    { name: 'Errors', value: `${result.errorCount}`, inline: true },
                    { name: 'Channels Affected', value: `${result.channelsAffected}`, inline: true }
                )
                .setColor(result.errorCount > 0 ? '#ff9900' : '#00ff00')
                .setFooter({ text: 'All panel tracking has been cleared from memory and database' })
                .setTimestamp();

            await interaction.editReply({
                embeds: [embed]
            });

            this.heart.core.console.log(
                this.heart.core.console.type.log,
                `All panels cleared by ${interaction.user.tag}: ${result.removedCount} removed, ${result.errorCount} errors`
            );

        } catch (err) {
            this.heart.core.console.log(this.heart.core.console.type.error, 'Error clearing panels:', err);
            new this.heart.core.error.interface(this.heart, err);
            
            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Clear Failed')
                .setDescription(`An error occurred while clearing panels.\n\n**Error:** ${err.message}`)
                .setColor('#ff0000')
                .setTimestamp();

            await interaction.editReply({
                embeds: [errorEmbed]
            });
        }
    }
};