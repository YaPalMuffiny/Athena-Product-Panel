const { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    StringSelectMenuBuilder, 
    StringSelectMenuOptionBuilder,
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
 * Personal product panel command following AthenaBot template pattern.
 * @class
 * @extends commandType
 */
module.exports = class personalPanel extends command {
    /**
     * Creates an instance of the command.
     * @param {heartType} heart - The heart of the bot.
     * @param {Object} cmdConfig - The command configuration.
     */
    constructor(heart, cmdConfig) {
        super(heart, {
            name: 'products',
            data: new SlashCommandBuilder()
                .setName('products')
                .setDescription('Access your personal product download panel')
                .addStringOption(option =>
                    option.setName('panel')
                        .setDescription('Select which panel to display')
                        .setRequired(false)
                        .setAutocomplete(true)
                ),
            contextMenu: false,
            global: true,
            category: 'products',
            bypass: false,
            permissionLevel: 'member',
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
                Object.entries(config.config.panels).forEach(([panelId, panel]) => {
                    if (panel.enabled !== false && panel.products?.length > 0) {
                        choices.push({
                            name: panel.name || panelId,
                            value: panelId
                        });
                    }
                });
            }
            
            // Add legacy panel if enabled and has products
            if (config?.config?.legacy?.enabled && config.config.legacy.products?.length > 0) {
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
            this.heart.core.console.log(this.heart.core.console.type.error, 'Error in products autocomplete:', err);
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
            const productConfig = this.heart.core.discord.core.config.manager.get('products');
            if (!productConfig) {
                return await interaction.reply({
                    content: '❌ Product configuration not found. Please contact an administrator.',
                    ephemeral: true
                });
            }

            const config = productConfig.get();
            
            // Basic permission check - anyone with member role can use
            if (!interaction.member) {
                return await interaction.reply({
                    content: '❌ This command can only be used in a server.',
                    ephemeral: true
                });
            }
            
            const selectedPanel = interaction.options.getString('panel');
            
            // Check if any panels are configured
            const hasMultiPanels = config?.config?.panels && 
                Object.values(config.config.panels).some(panel => panel.enabled !== false && panel.products?.length > 0);
            const hasLegacyProducts = config?.config?.legacy?.enabled && 
                config.config.legacy.products && config.config.legacy.products.length > 0;

            if (!hasMultiPanels && !hasLegacyProducts) {
                return await interaction.reply({
                    content: '❌ No product panels are configured. Contact an administrator.',
                    ephemeral: true
                });
            }

            if (hasMultiPanels && !selectedPanel) {
                await this.showPanelSelection(interaction, config);
            } else if (selectedPanel) {
                await this.showSpecificPanel(interaction, config, selectedPanel);
            } else {
                // Only legacy products available
                await this.showLegacyPanel(interaction, config);
            }

        } catch (err) {
            this.heart.core.console.log(this.heart.core.console.type.error, `An issue occurred while executing command ${this.getName()}:`, err);
            new this.heart.core.error.interface(this.heart, err);
            
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: '❌ An unexpected error occurred while processing your request.',
                    ephemeral: true
                });
            }
        }
    }

    async showPanelSelection(interaction, productConfig) {
        try {
            const embed = new EmbedBuilder()
                .setTitle('🛍️ Choose Your Product Panel')
                .setDescription('Select which product panel you want to access:')
                .setColor(productConfig?.config?.global?.default_embed_color || '#0099ff')
                .setFooter({ text: 'Your personal product panel - only you can see this' })
                .setTimestamp();

            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId(`products:panel_select:${interaction.user.id}`)
                .setPlaceholder('Choose a product panel...');

            let optionsAdded = 0;

            // Add multi-panels
            if (productConfig?.config?.panels) {
                Object.entries(productConfig.config.panels).forEach(([panelId, panel]) => {
                    if (panel.enabled !== false && panel.products?.length > 0) {
                        const enabledCount = panel.products.filter(p => p.enabled !== false).length;
                        if (enabledCount > 0) {
                            selectMenu.addOptions(
                                new StringSelectMenuOptionBuilder()
                                    .setLabel((panel.name || panelId).substring(0, 100))
                                    .setDescription((panel.description?.substring(0, 100) || `${enabledCount} products available`) + (panel.description?.length > 100 ? '...' : ''))
                                    .setValue(panelId)
                                    .setEmoji(panel.emoji || '📦')
                            );
                            optionsAdded++;
                        }
                    }
                });
            }

            // Add legacy panel if exists
            if (productConfig?.config?.legacy?.enabled && productConfig.config.legacy.products?.length > 0) {
                const enabledCount = productConfig.config.legacy.products.filter(p => p.enabled !== false).length;
                if (enabledCount > 0) {
                    selectMenu.addOptions(
                        new StringSelectMenuOptionBuilder()
                            .setLabel('Legacy Panel')
                            .setDescription(`${enabledCount} legacy products available`)
                            .setValue('legacy')
                            .setEmoji('🔧')
                    );
                    optionsAdded++;
                }
            }

            // Check if we have any options
            if (optionsAdded === 0) {
                return await interaction.reply({
                    content: '❌ No enabled panels with products found.',
                    ephemeral: true
                });
            }

            const row = new ActionRowBuilder().addComponents(selectMenu);

            await interaction.reply({
                embeds: [embed],
                components: [row],
                ephemeral: true
            });

        } catch (err) {
            this.heart.core.console.log(this.heart.core.console.type.error, 'Error showing panel selection:', err);
            new this.heart.core.error.interface(this.heart, err);
            if (!interaction.replied) {
                await interaction.reply({
                    content: '❌ Error showing panel selection.',
                    ephemeral: true
                });
            }
        }
    }

    async showSpecificPanel(interaction, productConfig, panelId) {
        if (panelId === 'legacy') {
            await this.showLegacyPanel(interaction, productConfig);
        } else {
            const panel = productConfig?.config?.panels?.[panelId];
            if (!panel || panel.enabled === false) {
                return await interaction.reply({
                    content: '❌ Panel not found or disabled.',
                    ephemeral: true
                });
            }
            await this.displayPanel(interaction, productConfig, panelId);
        }
    }

    async showLegacyPanel(interaction, productConfig) {
        if (!productConfig?.config?.legacy?.enabled || !productConfig.config.legacy.products?.length) {
            return await interaction.reply({
                content: '❌ Legacy panel is not enabled or has no products.',
                ephemeral: true
            });
        }
        await this.displayPanel(interaction, productConfig, 'legacy');
    }

    async displayPanel(interaction, productConfig, panelId) {
        try {
            let panel, products;

            if (panelId === 'legacy') {
                panel = productConfig?.config?.legacy?.panel || {};
                products = productConfig?.config?.legacy?.products || [];
            } else {
                panel = productConfig?.config?.panels?.[panelId];
                if (!panel) {
                    return await interaction.reply({
                        content: '❌ Panel not found.',
                        ephemeral: true
                    });
                }
                products = panel.products || [];
            }

            // Filter enabled products
            const enabledProducts = products.filter(p => p.enabled !== false);

            if (enabledProducts.length === 0) {
                const embed = new EmbedBuilder()
                    .setTitle('📦 No Products Available')
                    .setDescription('This panel has no enabled products.')
                    .setColor('#ff9900')
                    .setTimestamp();

                return await interaction.reply({
                    embeds: [embed],
                    ephemeral: true
                });
            }

            const embed = new EmbedBuilder()
                .setTitle(panel.title || '🛍️ Product Downloads')
                .setDescription(panel.description || 'Click the buttons below to download products:')
                .setColor(panel.embed_color || productConfig?.config?.global?.default_embed_color || '#0099ff')
                .setFooter({ text: `${panel.footer_text || 'Product Downloads'} • Personal Panel` })
                .setTimestamp();

            if (panel.thumbnail_url) {
                embed.setThumbnail(panel.thumbnail_url);
            }

            const buttons = this.createProductButtons(enabledProducts, interaction.user.id, panelId);

            if (buttons.length === 0) {
                return await interaction.reply({
                    content: '❌ No valid buttons could be created for this panel.',
                    ephemeral: true
                });
            }

            const replyOptions = {
                embeds: [embed],
                components: buttons,
                ephemeral: true
            };

            if (interaction.replied || interaction.deferred) {
                await interaction.editReply(replyOptions);
            } else {
                await interaction.reply(replyOptions);
            }

        } catch (err) {
            this.heart.core.console.log(this.heart.core.console.type.error, 'Error displaying panel:', err);
            new this.heart.core.error.interface(this.heart, err);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: '❌ Error displaying panel.',
                    ephemeral: true
                });
            }
        }
    }

    createProductButtons(products, userId, panelId) {
        const buttons = [];
        const maxProductsPerPanel = 25; // Discord limit: 5 rows x 5 buttons

        // Limit products to Discord's button limit
        const limitedProducts = products.slice(0, maxProductsPerPanel);

        for (let i = 0; i < limitedProducts.length; i += 5) {
            const row = new ActionRowBuilder();
            const rowProducts = limitedProducts.slice(i, i + 5);

            for (const product of rowProducts) {
                try {
                    if (!product.id || !product.name) {
                        this.heart.core.console.log(this.heart.core.console.type.warning, `Skipping product with missing id or name:`, product);
                        continue;
                    }

                    const button = new ButtonBuilder()
                        .setCustomId(`products:download:${product.id}:${panelId}:${userId}`)
                        .setLabel(product.name.length > 80 ? product.name.substring(0, 77) + '...' : product.name)
                        .setStyle(ButtonStyle.Primary);

                    if (product.emoji) {
                        try {
                            button.setEmoji(product.emoji);
                        } catch (err) {
                            // Invalid emoji, skip setting it
                            this.heart.core.console.log(this.heart.core.console.type.warning, `Invalid emoji for product ${product.id}: ${product.emoji}`);
                        }
                    }

                    row.addComponents(button);
                } catch (err) {
                    this.heart.core.console.log(this.heart.core.console.type.error, `Error creating button for product ${product.id}:`, err);
                    new this.heart.core.error.interface(this.heart, err);
                }
            }

            if (row.components.length > 0) {
                buttons.push(row);
            }
        }

        return buttons;
    }
};