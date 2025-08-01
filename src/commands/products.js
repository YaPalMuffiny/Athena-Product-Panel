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
        const productConfig = heart.core.discord.core.config.manager.get('products').get();

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
            permissionLevel: productConfig.config.permissions.panel_command || 'member',
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
                    choices.push({
                        name: productConfig.config.panels[panelId].name || panelId,
                        value: panelId
                    });
                });
            }
            
            // Add legacy panel if products exist
            if (productConfig.config.products && productConfig.config.products.length > 0) {
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
        }
    }

    async execute(interaction, langConfig) {
        try {
            const productConfig = this.heart.core.discord.core.config.manager.get('products').get();
            const selectedPanel = interaction.options.getString('panel');
            
            // Check if any panels are configured
            const hasMultiPanels = productConfig.config.panels && Object.keys(productConfig.config.panels).length > 0;
            const hasLegacyProducts = productConfig.config.products && productConfig.config.products.length > 0;

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
            await interaction.reply({
                content: '❌ An error occurred while loading your product panel.',
                ephemeral: true
            });
        }
    }

    async showPanelSelection(interaction, productConfig) {
        const embed = new EmbedBuilder()
            .setTitle('🛍️ Choose Your Product Panel')
            .setDescription('Select which product panel you want to access:')
            .setColor('#0099ff')
            .setFooter({ text: 'Your personal product panel - only you can see this' })
            .setTimestamp();

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId(`products:panel_select:${interaction.user.id}`)
            .setPlaceholder('Choose a product panel...');

        // Add multi-panels
        Object.entries(productConfig.config.panels).forEach(([panelId, panel]) => {
            selectMenu.addOptions(
                new StringSelectMenuOptionBuilder()
                    .setLabel(panel.name || panelId)
                    .setDescription(panel.description?.substring(0, 100) || 'Product panel')
                    .setValue(panelId)
                    .setEmoji(panel.emoji || '📦')
            );
        });

        // Add legacy panel if exists
        if (productConfig.config.products && productConfig.config.products.length > 0) {
            selectMenu.addOptions(
                new StringSelectMenuOptionBuilder()
                    .setLabel('Legacy Panel')
                    .setDescription('Original product panel')
                    .setValue('legacy')
                    .setEmoji('🔧')
            );
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
            const panel = productConfig.config.panels[panelId];
            if (!panel) {
                return await interaction.reply({
                    content: '❌ Panel not found.',
                    ephemeral: true
                });
            }
            await this.displayPanel(interaction, productConfig, panelId);
        }
    }

    async showLegacyPanel(interaction, productConfig) {
        await this.displayPanel(interaction, productConfig, 'legacy');
    }

    async displayPanel(interaction, productConfig, panelId) {
        let panel, products;

        if (panelId === 'legacy') {
            panel = productConfig.config.panel || {};
            products = productConfig.config.products || [];
        } else {
            panel = productConfig.config.panels[panelId];
            products = panel.products || [];
        }

        if (products.length === 0) {
            const embed = new EmbedBuilder()
                .setTitle('📦 No Products Available')
                .setDescription('This panel has no products configured.')
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
            .setColor(panel.embed_color || '#0099ff')
            .setFooter({ text: `${panel.footer_text || 'Product Downloads'} • Personal Panel` })
            .setTimestamp();

        if (panel.thumbnail_url) {
            embed.setThumbnail(panel.thumbnail_url);
        }

        const buttons = this.createProductButtons(products, interaction.user.id, panelId);

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
            time: 600000 
        });

        collector.on('collect', async (buttonInteraction) => {
            if (buttonInteraction.customId.startsWith(`products:download:`)) {
                await this.handleProductDownload(buttonInteraction, productConfig, panelId);
            }
        });
    }

    createProductButtons(products, userId, panelId) {
        const buttons = [];

        for (let i = 0; i < products.length; i += 5) {
            const row = new ActionRowBuilder();
            const rowProducts = products.slice(i, i + 5);

            for (const product of rowProducts) {
                const button = new ButtonBuilder()
                    .setCustomId(`products:download:${product.id}:${panelId}:${userId}`)
                    .setLabel(product.name)
                    .setStyle(ButtonStyle.Primary);

                if (product.emoji) {
                    button.setEmoji(product.emoji);
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
                product = productConfig.config.products?.find(p => p.id === productId);
            } else {
                const panel = productConfig.config.panels[panelId];
                product = panel?.products?.find(p => p.id === productId);
            }

            if (!product) {
                return await buttonInteraction.reply({
                    content: '❌ Product not found.',
                    ephemeral: true
                });
            }

            // Check user permissions
            const member = buttonInteraction.member;
            const hasRequiredRole = product.required_roles.some(roleId => 
                member.roles.cache.has(roleId)
            );

            if (!hasRequiredRole) {
                const roleNames = product.required_roles.map(roleId => {
                    const role = buttonInteraction.guild.roles.cache.get(roleId);
                    return role ? role.name : 'Unknown Role';
                }).join(', ');

                return await buttonInteraction.reply({
                    content: `❌ **Access Denied**\n\nYou need one of these roles to download this product:\n**${roleNames}**`,
                    ephemeral: true
                });
            }

            // Check if file exists
            const filePath = path.join(__dirname, '../../data/products/', product.file_path);
            if (!fs.existsSync(filePath)) {
                return await buttonInteraction.reply({
                    content: '❌ Product file not found. Please contact an administrator.',
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
                    { name: 'Panel', value: panelId === 'legacy' ? 'Legacy Panel' : panelId, inline: true }
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

            // Track download in database if enabled
            const loggingConfig = productConfig.config.logging || {};
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
            }

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
};