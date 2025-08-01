const { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    AttachmentBuilder, 
    StringSelectMenuBuilder, 
    StringSelectMenuOptionBuilder
} = require('discord.js');
const command = require('../../../../main/discord/core/commands/command.js');
const fs = require('fs');
const path = require('path');

module.exports = class personalPanel extends command {
    constructor(heart, cmdConfig) {
        // Get config safely with error handling
        let productConfig;
        try {
            productConfig = heart.core.discord.core.config.manager.get('products').get();
        } catch (err) {
            heart.core.console.log(heart.core.console.type.error, 'Error getting products config in command constructor:', err);
            productConfig = { config: { permissions: {} } }; // Default fallback
        }

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
            permissionLevel: productConfig.config.permissions?.personal_panel || 'member',
        });
    }

    async autocomplete(interaction) {
        try {
            const productConfig = this.heart.core.discord.core.config.manager.get('products').get();
            const focusedValue = interaction.options.getFocused();
            
            const choices = [];
            
            // Add multi-panels
            if (productConfig.config.panels) {
                Object.keys(productConfig.config.panels).forEach(panelId => {
                    const panel = productConfig.config.panels[panelId];
                    if (panel.enabled !== false) { // Include if not explicitly disabled
                        choices.push({
                            name: panel.name || panelId,
                            value: panelId
                        });
                    }
                });
            }
            
            // Add legacy panel if enabled and has products
            if (productConfig.config.legacy?.enabled && productConfig.config.legacy.products?.length > 0) {
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
            await interaction.respond([]);
        }
    }

    async execute(interaction, langConfig) {
        try {
            const productConfig = this.heart.core.discord.core.config.manager.get('products').get();
            const selectedPanel = interaction.options.getString('panel');
            
            // Check if any panels are configured
            const hasMultiPanels = productConfig.config.panels && 
                Object.values(productConfig.config.panels).some(panel => panel.enabled !== false && panel.products?.length > 0);
            const hasLegacyProducts = productConfig.config.legacy?.enabled && 
                productConfig.config.legacy.products && productConfig.config.legacy.products.length > 0;

            if (!hasMultiPanels && !hasLegacyProducts) {
                return await interaction.reply({
                    content: '❌ No product panels are configured. Contact an administrator.',
                    ephemeral: true
                });
            }

            if (hasMultiPanels && !selectedPanel) {
                await this.showPanelSelection(interaction, productConfig);
            } else if (selectedPanel) {
                await this.showSpecificPanel(interaction, productConfig, selectedPanel);
            } else {
                // Only legacy products available
                await this.showLegacyPanel(interaction, productConfig);
            }

        } catch (err) {
            this.heart.core.console.log(this.heart.core.console.type.error, 'Error in products command:', err);
            
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: '❌ An error occurred while loading your product panel.',
                    ephemeral: true
                });
            }
        }
    }

    async showPanelSelection(interaction, productConfig) {
        const embed = new EmbedBuilder()
            .setTitle('🛍️ Choose Your Product Panel')
            .setDescription('Select which product panel you want to access:')
            .setColor(productConfig.config.global?.default_embed_color || '#0099ff')
            .setFooter({ text: 'Your personal product panel - only you can see this' })
            .setTimestamp();

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId(`products:panel_select:${interaction.user.id}`)
            .setPlaceholder('Choose a product panel...');

        // Add multi-panels
        if (productConfig.config.panels) {
            Object.entries(productConfig.config.panels).forEach(([panelId, panel]) => {
                if (panel.enabled !== false && panel.products?.length > 0) {
                    selectMenu.addOptions(
                        new StringSelectMenuOptionBuilder()
                            .setLabel(panel.name || panelId)
                            .setDescription((panel.description?.substring(0, 100) || 'Product panel') + (panel.description?.length > 100 ? '...' : ''))
                            .setValue(panelId)
                            .setEmoji(panel.emoji || '📦')
                    );
                }
            });
        }

        // Add legacy panel if exists
        if (productConfig.config.legacy?.enabled && productConfig.config.legacy.products?.length > 0) {
            selectMenu.addOptions(
                new StringSelectMenuOptionBuilder()
                    .setLabel('Legacy Panel')
                    .setDescription('Original product panel')
                    .setValue('legacy')
                    .setEmoji('🔧')
            );
        }

        // Check if we have any options
        if (selectMenu.options.length === 0) {
            return await interaction.reply({
                content: '❌ No enabled panels with products found.',
                ephemeral: true
            });
        }

        const row = new ActionRowBuilder().addComponents(selectMenu);

        const reply = await interaction.reply({
            embeds: [embed],
            components: [row],
            ephemeral: true
        });

        const collector = reply.createMessageComponentCollector({ 
            filter: (i) => i.user.id === interaction.user.id,
            time: 300000 
        });

        collector.on('collect', async (selectInteraction) => {
            if (selectInteraction.customId === `products:panel_select:${interaction.user.id}`) {
                const selectedPanelId = selectInteraction.values[0];
                await this.displayPanel(selectInteraction, productConfig, selectedPanelId);
            }
        });

        collector.on('end', async () => {
            try {
                await interaction.editReply({ components: [] });
            } catch (err) {
                // Ignore edit errors after interaction expires
            }
        });
    }

    async showSpecificPanel(interaction, productConfig, panelId) {
        if (panelId === 'legacy') {
            await this.showLegacyPanel(interaction, productConfig);
        } else {
            const panel = productConfig.config.panels?.[panelId];
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
        if (!productConfig.config.legacy?.enabled || !productConfig.config.legacy.products?.length) {
            return await interaction.reply({
                content: '❌ Legacy panel is not enabled or has no products.',
                ephemeral: true
            });
        }
        await this.displayPanel(interaction, productConfig, 'legacy');
    }

    async displayPanel(interaction, productConfig, panelId) {
        let panel, products;

        if (panelId === 'legacy') {
            panel = productConfig.config.legacy?.panel || {};
            products = productConfig.config.legacy?.products || [];
        } else {
            panel = productConfig.config.panels?.[panelId];
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
            .setColor(panel.embed_color || productConfig.config.global?.default_embed_color || '#0099ff')
            .setFooter({ text: `${panel.footer_text || 'Product Downloads'} • Personal Panel` })
            .setTimestamp();

        if (panel.thumbnail_url) {
            embed.setThumbnail(panel.thumbnail_url);
        }

        const buttons = this.createProductButtons(enabledProducts, interaction.user.id, panelId);

        const replyOptions = {
            embeds: [embed],
            components: buttons,
            ephemeral: true
        };

        let reply;
        if (interaction.replied || interaction.deferred) {
            reply = await interaction.editReply(replyOptions);
        } else {
            reply = await interaction.reply(replyOptions);
        }

        const collector = reply.createMessageComponentCollector({ 
            filter: (i) => i.user.id === interaction.user.id,
            time: productConfig.config.advanced?.interaction_timeout || 600000 
        });

        collector.on('collect', async (buttonInteraction) => {
            if (buttonInteraction.customId.startsWith(`products:download:`)) {
                await this.handleProductDownload(buttonInteraction, productConfig, panelId);
            }
        });

        collector.on('end', async () => {
            try {
                await interaction.editReply({ components: [] });
            } catch (err) {
                // Ignore edit errors after interaction expires
            }
        });
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
            }

            buttons.push(row);
        }

        return buttons;
    }

    async handleProductDownload(buttonInteraction, productConfig, panelId) {
        try {
            const customIdParts = buttonInteraction.customId.split(':');
            const productId = customIdParts[2];
            
            let product;

            // Find the product
            if (panelId === 'legacy') {
                product = productConfig.config.legacy?.products?.find(p => p.id === productId);
            } else {
                const panel = productConfig.config.panels?.[panelId];
                product = panel?.products?.find(p => p.id === productId);
            }

            if (!product) {
                return await buttonInteraction.reply({
                    content: productConfig.config.advanced?.error_messages?.panel_not_found || '❌ Product not found.',
                    ephemeral: true
                });
            }

            // Check if product is enabled
            if (product.enabled === false) {
                return await buttonInteraction.reply({
                    content: '❌ This product is currently disabled.',
                    ephemeral: true
                });
            }

            // Check user permissions
            const member = buttonInteraction.member;
            const hasRequiredRole = product.required_roles?.some(roleId => 
                member.roles.cache.has(roleId)
            );

            if (!hasRequiredRole) {
                const roleNames = product.required_roles?.map(roleId => {
                    const role = buttonInteraction.guild.roles.cache.get(roleId);
                    return role ? role.name : 'Unknown Role';
                }).join(', ') || 'Required roles not configured';

                return await buttonInteraction.reply({
                    content: productConfig.config.advanced?.error_messages?.no_permission || 
                        `❌ **Access Denied**\n\nYou need one of these roles to download this product:\n**${roleNames}**`,
                    ephemeral: true
                });
            }

            // Check if file exists
            const filePath = path.join(__dirname, '../../data/products/', product.file_path);
            if (!fs.existsSync(filePath)) {
                return await buttonInteraction.reply({
                    content: productConfig.config.advanced?.error_messages?.file_not_found || 
                        '❌ Product file not found. Please contact an administrator.',
                    ephemeral: true
                });
            }

            // Create and send file
            const attachment = new AttachmentBuilder(filePath, { 
                name: product.download_name || product.file_path 
            });

            const downloadEmbed = new EmbedBuilder()
                .setTitle('✅ Download Ready')
                .setDescription(`**${product.name}**\n\n${product.description || 'No description available.'}`)
                .addFields(
                    { name: 'File Name', value: product.download_name || product.file_path, inline: true },
                    { name: 'Panel', value: panelId === 'legacy' ? 'Legacy Panel' : (productConfig.config.panels?.[panelId]?.name || panelId), inline: true }
                )
                .setColor('#00ff00')
                .setFooter({ text: 'Download is private and only visible to you' })
                .setTimestamp();

            await buttonInteraction.reply({
                embeds: [downloadEmbed],
                files: [attachment],
                ephemeral: true
            });

            // Log the download
            this.heart.core.console.log(
                this.heart.core.console.type.log, 
                `Personal download: ${buttonInteraction.user.tag} (${buttonInteraction.user.id}) downloaded "${product.name}" from panel "${panelId}"`
            );

            // Track download in database and log to channel
            await this.trackDownload(buttonInteraction, productConfig, product, panelId);

        } catch (err) {
            this.heart.core.console.log(this.heart.core.console.type.error, 'Error handling product download:', err);
            
            if (!buttonInteraction.replied) {
                await buttonInteraction.reply({
                    content: '❌ An error occurred while processing your download.',
                    ephemeral: true
                });
            }
        }
    }

    async trackDownload(buttonInteraction, productConfig, product, panelId) {
        const loggingConfig = productConfig.config.logging || {};

        // Track download in database if enabled
        if (loggingConfig.track_downloads && loggingConfig.log_personal_downloads !== false) {
            try {
                const userDoc = await this.heart.core.database.userData.get(buttonInteraction.guild.id, buttonInteraction.user.id);
                const downloads = userDoc.downloads || [];
                downloads.push({
                    product_id: product.id,
                    product_name: product.name,
                    panel_id: panelId,
                    source: 'personal_panel',
                    timestamp: new Date(),
                    guild_id: buttonInteraction.guild.id
                });
                
                await this.heart.core.database.userData.save(buttonInteraction.guild.id, buttonInteraction.user.id, { 
                    downloads: downloads 
                });
            } catch (dbErr) {
                this.heart.core.console.log(this.heart.core.console.type.error, 'Error saving download to database:', dbErr);
            }
        }

        // Log to channel if enabled
        if (loggingConfig.log_to_channel && loggingConfig.log_channel_id && loggingConfig.log_personal_downloads !== false) {
            try {
                const logChannel = buttonInteraction.guild.channels.cache.get(loggingConfig.log_channel_id);
                if (logChannel) {
                    const logEmbed = new EmbedBuilder()
                        .setTitle('📥 Personal Download')
                        .addFields(
                            { name: 'User', value: `${buttonInteraction.user.tag} (${buttonInteraction.user.id})`, inline: true },
                            { name: 'Product', value: product.name, inline: true },
                            { name: 'Panel', value: panelId, inline: true },
                            { name: 'Time', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
                        )
                        .setColor('#0099ff')
                        .setTimestamp();

                    await logChannel.send({ embeds: [logEmbed] });
                }
            } catch (logErr) {
                this.heart.core.console.log(this.heart.core.console.type.error, 'Error logging to channel:', logErr);
            }
        }
    }
};