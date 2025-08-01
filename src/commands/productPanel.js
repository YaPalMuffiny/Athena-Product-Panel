const { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    AttachmentBuilder, 
    StringSelectMenuBuilder, 
    StringSelectMenuOptionBuilder,
    ChannelType,
    PermissionFlagsBits 
} = require('discord.js');
const command = require('../../../../main/discord/core/commands/command.js');
const fs = require('fs');
const path = require('path');

module.exports = class productPanel extends command {
    constructor(heart, cmdConfig) {
        const productConfig = heart.core.discord.core.config.manager.get('products').get();

        super(heart, {
            name: 'productpanel',
            data: new SlashCommandBuilder()
                .setName(cmdConfig.commands.productpanel?.name || 'productpanel')
                .setDescription(cmdConfig.commands.productpanel?.description || 'Product panel management')
                // Show subcommand (personal panel)
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('show')
                        .setDescription('Display your personal product download panel')
                        .addStringOption(option =>
                            option.setName('panel')
                                .setDescription('Select which panel to display')
                                .setRequired(false)
                                .setAutocomplete(true)
                        )
                )
                // Setup subcommand
                .addSubcommandGroup(group =>
                    group
                        .setName('setup')
                        .setDescription('Setup product panels in channels')
                        // Setup in channel
                        .addSubcommand(subcommand =>
                            subcommand
                                .setName('channel')
                                .setDescription('Setup a product panel in a channel')
                                .addChannelOption(option =>
                                    option.setName('channel')
                                        .setDescription('The channel to setup the panel in')
                                        .setRequired(true)
                                        .addChannelTypes(ChannelType.GuildText)
                                )
                                .addStringOption(option =>
                                    option.setName('panel')
                                        .setDescription('Select which panel to setup')
                                        .setRequired(false)
                                        .setAutocomplete(true)
                                )
                        )
                )
                // Refresh subcommand (admin only)
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('refresh')
                        .setDescription('Manually refresh all existing product panels (Admin only)')
                )
                .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
            contextMenu: false,
            global: true,
            category: 'products',
            bypass: true,
            permissionLevel: productConfig.config.permissions.panel_command || 'member',
        });
    }

    async autocomplete(interaction) {
        try {
            const productConfig = this.heart.core.discord.core.config.manager.get('products').get();
            const focusedValue = interaction.options.getFocused();
            
            const choices = [];
            
            if (productConfig.config.panels) {
                Object.keys(productConfig.config.panels).forEach(panelId => {
                    choices.push({
                        name: productConfig.config.panels[panelId].name || panelId,
                        value: panelId
                    });
                });
            }
            
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
            this.heart.core.console.log(this.heart.core.console.type.error, 'Error in autocomplete:', err);
        }
    }

    async execute(interaction, langConfig) {
        try {
            const subcommand = interaction.options.getSubcommand();
            const subcommandGroup = interaction.options.getSubcommandGroup();

            if (subcommandGroup === 'setup') {
                if (subcommand === 'channel') {
                    await this.handleSetupChannel(interaction);
                }
            } else if (subcommand === 'show') {
                await this.handleShowPanel(interaction);
            } else if (subcommand === 'refresh') {
                await this.handleRefresh(interaction);
            }
        } catch (err) {
            this.heart.core.console.log(this.heart.core.console.type.error, `Error in productpanel command:`, err);
            await interaction.reply({
                content: '❌ An error occurred while processing this command.',
                ephemeral: true
            });
        }
    }

    /* ====================== */
    /* SHOW PANEL FUNCTIONALITY */
    /* ====================== */
    async handleShowPanel(interaction) {
        const productConfig = this.heart.core.discord.core.config.manager.get('products').get();
        const selectedPanel = interaction.options.getString('panel');
        
        if (productConfig.config.panels && Object.keys(productConfig.config.panels).length > 0) {
            if (!selectedPanel) {
                await this.showPanelSelection(interaction, productConfig);
            } else {
                await this.showSpecificPanel(interaction, productConfig, selectedPanel);
            }
        } else {
            await this.showLegacyPanel(interaction, productConfig);
        }
    }

    async showPanelSelection(interaction, productConfig) {
        const embed = new EmbedBuilder()
            .setTitle('🛍️ Personal Product Panel Selection')
            .setDescription('Please select which product panel you want to view:')
            .setColor('#0099ff')
            .setFooter({ text: 'This is your personal product panel - only you can see this.' })
            .setTimestamp();

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId(`iynx:athenabot:productPanel:personal_panel_select:${interaction.user.id}`)
            .setPlaceholder('Choose a product panel...');

        Object.entries(productConfig.config.panels).forEach(([panelId, panel]) => {
            selectMenu.addOptions(
                new StringSelectMenuOptionBuilder()
                    .setLabel(panel.name || panelId)
                    .setDescription(panel.description?.substring(0, 100) || 'Product panel')
                    .setValue(panelId)
                    .setEmoji(panel.emoji || '📦')
            );
        });

        const row = new ActionRowBuilder().addComponents(selectMenu);

        const reply = await interaction.reply({
            embeds: [embed],
            components: [row],
            ephemeral: true
        });

        const collector = reply.createMessageComponentCollector({ time: 300000 });

        collector.on('collect', async (selectInteraction) => {
            if (selectInteraction.customId === `iynx:athenabot:productPanel:personal_panel_select:${interaction.user.id}`) {
                const selectedPanelId = selectInteraction.values[0];
                await this.handlePanelSelection(selectInteraction, productConfig, selectedPanelId);
            }
        });
    }

    async handlePanelSelection(selectInteraction, productConfig, panelId) {
        const panel = productConfig.config.panels[panelId];
        if (!panel) {
            return await selectInteraction.reply({
                content: '❌ Panel not found.',
                ephemeral: true
            });
        }

        const embed = new EmbedBuilder()
            .setTitle(panel.title || '🛍️ Product Download Panel')
            .setDescription(panel.description || 'Select a product below to download:')
            .setColor(panel.embed_color || '#0099ff')
            .setFooter({ text: `${panel.footer_text || 'Product Downloads'} • Personal Panel - Only you can see this.` })
            .setTimestamp();

        if (panel.thumbnail_url) {
            embed.setThumbnail(panel.thumbnail_url);
        }

        const buttons = this.createProductButtons(panel.products || [], selectInteraction.user.id);

        await selectInteraction.update({
            embeds: [embed],
            components: buttons
        });

        const collector = selectInteraction.message.createMessageComponentCollector({ time: 300000 });

        collector.on('collect', async (buttonInteraction) => {
            if (buttonInteraction.customId.startsWith('iynx:athenabot:productPanel:personal_product_')) {
                await this.handleButtonInteraction(buttonInteraction, productConfig, panelId);
            }
        });
    }

    async showSpecificPanel(interaction, productConfig, panelId) {
        const panel = productConfig.config.panels[panelId];
        if (!panel) {
            return await interaction.reply({
                content: '❌ Panel not found.',
                ephemeral: true
            });
        }

        const embed = new EmbedBuilder()
            .setTitle(panel.title || '🛍️ Product Download Panel')
            .setDescription(panel.description || 'Select a product below to download:')
            .setColor(panel.embed_color || '#0099ff')
            .setFooter({ text: `${panel.footer_text || 'Product Downloads'} • Personal Panel - Only you can see this.` })
            .setTimestamp();

        if (panel.thumbnail_url) {
            embed.setThumbnail(panel.thumbnail_url);
        }

        const buttons = this.createProductButtons(panel.products || [], interaction.user.id);

        const reply = await interaction.reply({
            embeds: [embed],
            components: buttons,
            ephemeral: true
        });

        const collector = reply.createMessageComponentCollector({ time: 300000 });

        collector.on('collect', async (buttonInteraction) => {
            if (buttonInteraction.customId.startsWith('iynx:athenabot:productPanel:personal_product_')) {
                await this.handleButtonInteraction(buttonInteraction, productConfig, panelId);
            }
        });
    }

    async showLegacyPanel(interaction, productConfig) {
        const embed = new EmbedBuilder()
            .setTitle('🛍️ Personal Product Download Panel')
            .setDescription(productConfig.config.panel?.description || 'Select a product below to download:')
            .setColor(productConfig.config.panel?.embed_color || '#0099ff')
            .setFooter({ text: `${productConfig.config.panel?.footer_text || 'Product Downloads'} • Personal Panel - Only you can see this.` })
            .setTimestamp();

        if (productConfig.config.panel?.thumbnail_url) {
            embed.setThumbnail(productConfig.config.panel.thumbnail_url);
        }

        const buttons = this.createProductButtons(productConfig.config.products || [], interaction.user.id);

        const reply = await interaction.reply({
            embeds: [embed],
            components: buttons,
            ephemeral: true
        });

        const collector = reply.createMessageComponentCollector({ time: 300000 });

        collector.on('collect', async (buttonInteraction) => {
            if (buttonInteraction.customId.startsWith('iynx:athenabot:productPanel:personal_product_')) {
                await this.handleButtonInteraction(buttonInteraction, productConfig, 'legacy');
            }
        });
    }

    createProductButtons(products, userId) {
        const buttons = [];

        for (let i = 0; i < products.length; i += 5) {
            const row = new ActionRowBuilder();
            const rowProducts = products.slice(i, i + 5);

            for (const product of rowProducts) {
                const button = new ButtonBuilder()
                    .setCustomId(`iynx:athenabot:productPanel:personal_product_${product.id}:${userId}`)
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

    async handleButtonInteraction(buttonInteraction, productConfig, panelId) {
        try {
            const productId = buttonInteraction.customId
                .replace(/^iynx:athenabot:productPanel:personal_product_/, '')
                .replace(`:${buttonInteraction.user.id}`, '');
            
            let product;

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

            // Check if user has required role
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
                    content: `❌ You don't have the required role(s) to download this product.\nRequired roles: ${roleNames}`,
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

            // Create attachment and send
            const attachment = new AttachmentBuilder(filePath, { name: product.download_name || product.file_path });

            const downloadEmbed = new EmbedBuilder()
                .setTitle('✅ Product Downloaded')
                .setDescription(`**${product.name}**\n${product.description || 'No description available.'}`)
                .setColor('#00ff00')
                .setFooter({ text: 'This download is private and only visible to you.' })
                .setTimestamp();

            await buttonInteraction.reply({
                embeds: [downloadEmbed],
                files: [attachment],
                ephemeral: true
            });

            // Log download activity
            this.heart.core.console.log(
                this.heart.core.console.type.log, 
                `User ${buttonInteraction.user.tag} (${buttonInteraction.user.id}) downloaded product: ${product.name} from personal panel: ${panelId}`
            );

            // Save to database for tracking
            if (productConfig.config.logging?.track_downloads) {
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
            if (productConfig.config.logging?.log_to_channel && productConfig.config.logging.log_channel_id) {
                const logChannel = buttonInteraction.guild.channels.cache.get(productConfig.config.logging.log_channel_id);
                if (logChannel) {
                    const logEmbed = new EmbedBuilder()
                        .setTitle('📥 Product Downloaded (Personal Panel)')
                        .addFields(
                            { name: 'User', value: `${buttonInteraction.user.tag} (${buttonInteraction.user.id})`, inline: true },
                            { name: 'Product', value: product.name, inline: true },
                            { name: 'Panel', value: panelId, inline: true },
                            { name: 'Source', value: 'Personal Panel', inline: true },
                            { name: 'Time', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
                        )
                        .setColor('#00ff00')
                        .setTimestamp();

                    await logChannel.send({ embeds: [logEmbed] });
                }
            }

        } catch (err) {
            this.heart.core.console.log(this.heart.core.console.type.error, 'Error handling personal button interaction:', err);
            
            if (!buttonInteraction.replied) {
                await buttonInteraction.reply({
                    content: '❌ An error occurred while processing your request.',
                    ephemeral: true
                });
            }
        }
    }

    /* ====================== */
    /* SETUP PANEL FUNCTIONALITY */
    /* ====================== */
    async handleSetupChannel(interaction) {
        const productConfig = this.heart.core.discord.core.config.manager.get('products').get();
        const targetChannel = interaction.options.getChannel('channel');
        const selectedPanel = interaction.options.getString('panel');

        // Check permissions
        if (!targetChannel.permissionsFor(interaction.guild.members.me).has(['SendMessages', 'EmbedLinks'])) {
            return await interaction.reply({
                content: `❌ I don't have the required permissions in ${targetChannel}. I need **Send Messages** and **Embed Links** permissions.`,
                ephemeral: true
            });
        }

        // If no panel specified, show selection
        if (!selectedPanel) {
            if (productConfig.config.panels && Object.keys(productConfig.config.panels).length > 0) {
                return await this.showSetupPanelOptions(interaction, productConfig, targetChannel);
            } else if (productConfig.config.products && productConfig.config.products.length > 0) {
                // Setup legacy panel directly
                return await this.setupLegacyPanel(interaction, productConfig, targetChannel);
            } else {
                return await interaction.reply({
                    content: '❌ No product panels are configured. Please configure panels in your products config first.',
                    ephemeral: true
                });
            }
        }

        // Setup specific panel
        if (selectedPanel === 'legacy') {
            return await this.setupLegacyPanel(interaction, productConfig, targetChannel);
        } else {
            return await this.setupSpecificPanel(interaction, productConfig, selectedPanel, targetChannel);
        }
    }

    async showSetupPanelOptions(interaction, productConfig, targetChannel) {
        const embed = new EmbedBuilder()
            .setTitle('📋 Panel Setup Options')
            .setDescription(`Please specify which panel you want to setup in ${targetChannel}.\n\nAvailable panels:`)
            .setColor('#ffa500')
            .setTimestamp();

        let panelList = '';
        
        if (productConfig.config.panels) {
            Object.entries(productConfig.config.panels).forEach(([panelId, panel]) => {
                panelList += `• **${panel.name || panelId}** (\`${panelId}\`)\n`;
            });
        }
        
        if (productConfig.config.products && productConfig.config.products.length > 0) {
            panelList += `• **Legacy Panel** (\`legacy\`)\n`;
        }

        embed.addFields({ name: 'Available Panels', value: panelList || 'No panels configured' });
        embed.setFooter({ text: 'Use the panel parameter to specify which panel to setup.' });

        await interaction.reply({
            embeds: [embed],
            ephemeral: true
        });
    }

    async setupSpecificPanel(interaction, productConfig, panelId, targetChannel) {
        const panel = productConfig.config.panels[panelId];
        if (!panel) {
            return await interaction.reply({
                content: '❌ Panel not found.',
                ephemeral: true
            });
        }

        await interaction.deferReply({ ephemeral: true });

        try {
            const handler = this.heart.core.discord.core.handler.manager.get('productPanel');
            await handler.setupPanelInChannel(panelId, panel, targetChannel);

            const successEmbed = new EmbedBuilder()
                .setTitle('✅ Panel Setup Complete')
                .setDescription(`Successfully setup **${panel.name || panelId}** panel in ${targetChannel}`)
                .addFields(
                    { name: 'Panel', value: panel.name || panelId, inline: true },
                    { name: 'Channel', value: targetChannel.toString(), inline: true },
                    { name: 'Products', value: `${panel.products?.length || 0} products`, inline: true }
                )
                .setColor('#00ff00')
                .setTimestamp();

            await interaction.editReply({
                embeds: [successEmbed]
            });

        } catch (err) {
            this.heart.core.console.log(this.heart.core.console.type.error, 'Error setting up panel:', err);
            
            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Panel Setup Failed')
                .setDescription(`Failed to setup panel in ${targetChannel}. Please check the bot's permissions and try again.`)
                .setColor('#ff0000')
                .setTimestamp();

            await interaction.editReply({
                embeds: [errorEmbed]
            });
        }
    }

    async setupLegacyPanel(interaction, productConfig, targetChannel) {
        if (!productConfig.config.products || productConfig.config.products.length === 0) {
            return await interaction.reply({
                content: '❌ No legacy products are configured.',
                ephemeral: true
            });
        }

        await interaction.deferReply({ ephemeral: true });

        try {
            const handler = this.heart.core.discord.core.handler.manager.get('productPanel');
            await handler.setupLegacyPanelInChannel(targetChannel);

            const successEmbed = new EmbedBuilder()
                .setTitle('✅ Legacy Panel Setup Complete')
                .setDescription(`Successfully setup legacy product panel in ${targetChannel}`)
                .addFields(
                    { name: 'Panel Type', value: 'Legacy Panel', inline: true },
                    { name: 'Channel', value: targetChannel.toString(), inline: true },
                    { name: 'Products', value: `${productConfig.config.products.length} products`, inline: true }
                )
                .setColor('#00ff00')
                .setTimestamp();

            await interaction.editReply({
                embeds: [successEmbed]
            });

        } catch (err) {
            this.heart.core.console.log(this.heart.core.console.type.error, 'Error setting up legacy panel:', err);
            
            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Legacy Panel Setup Failed')
                .setDescription(`Failed to setup legacy panel in ${targetChannel}. Please check the bot's permissions and try again.`)
                .setColor('#ff0000')
                .setTimestamp();

            await interaction.editReply({
                embeds: [errorEmbed]
            });
        }
    }

    /* ====================== */
    /* REFRESH FUNCTIONALITY */
    /* ====================== */
    async handleRefresh(interaction) {
        // Check admin permissions
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return await interaction.reply({
                content: '❌ You need administrator permissions to use this command.',
                ephemeral: true
            });
        }

        await interaction.deferReply({ ephemeral: true });

        const handler = this.heart.core.discord.core.handler.manager.get('productPanel');
        
        if (!handler) {
            return await interaction.editReply({
                content: '❌ Product Panel handler not found. The plugin may not be loaded correctly.'
            });
        }

        try {
            // Get stats before refresh
            const statsBefore = {
                active_messages: handler.panelMessages?.size || 0
            };

            // Refresh panels using the handler's method
            const refreshResult = await handler.refreshAllPanelMessages();

            // Get current config for display
            const productConfig = this.heart.core.discord.core.config.manager.get('products').get();
            const statsAfter = {
                active_messages: handler.panelMessages?.size || 0,
                total_panels_configured: 0,
                multi_panels: productConfig.config.panels ? Object.keys(productConfig.config.panels).length : 0,
                legacy_panels: productConfig.config.products?.length > 0 ? 1 : 0
            };
            statsAfter.total_panels_configured = statsAfter.multi_panels + statsAfter.legacy_panels;

            const successEmbed = new EmbedBuilder()
                .setTitle('✅ Panels Refreshed Successfully')
                .setDescription('All existing product panel messages have been checked and updated.')
                .addFields(
                    { name: 'Panels Configured', value: `${statsAfter.total_panels_configured}`, inline: true },
                    { name: 'Multi-Panels Available', value: `${statsAfter.multi_panels}`, inline: true },
                    { name: 'Legacy Panel Available', value: statsAfter.legacy_panels > 0 ? '✅ Yes' : '❌ No', inline: true },
                    { name: 'Messages Updated', value: `${refreshResult.refreshCount}`, inline: true },
                    { name: 'Update Errors', value: `${refreshResult.errorCount}`, inline: true },
                    { name: 'Active Panel Messages', value: `${statsAfter.active_messages}`, inline: true }
                )
                .setColor('#00ff00')
                .setFooter({ text: 'Refresh completed • Only existing panels were updated' })
                .setTimestamp();

            await interaction.editReply({
                embeds: [successEmbed]
            });

            this.heart.core.console.log(
                this.heart.core.console.type.log,
                `Product panels manually refreshed by ${interaction.user.tag} (${interaction.user.id}) in guild ${interaction.guild.name}. Updated: ${refreshResult.refreshCount}, Errors: ${refreshResult.errorCount}`
            );

        } catch (err) {
            this.heart.core.console.log(this.heart.core.console.type.error, 'Error in refresh command:', err);
            
            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Refresh Failed')
                .setDescription('An error occurred while trying to refresh the panels. Check the console for more details.')
                .setColor('#ff0000')
                .setTimestamp();

            await interaction.editReply({
                embeds: [errorEmbed]
            });
        }
    }
};
