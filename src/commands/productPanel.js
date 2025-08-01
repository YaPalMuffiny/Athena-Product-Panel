const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } = require('discord.js');
const command = require('../../../../main/discord/core/commands/command.js');
const fs = require('fs');
const path = require('path');

/* eslint-disable no-unused-vars, no-constant-condition */
if (null) {
	const heartType = require('../../../../types/heart.js');
	const commandType = require('../../../../types/discord/core/commands/commands.js');
	const { CommandInteraction } = require('discord.js');
}
/* eslint-enable no-unused-vars, no-constant-condition  */

/**
 * Product Panel command class with multiple panel support.
 * @class
 * @extends commandType
 */
module.exports = class productPanel extends command {
	/**
     * Creates an instance of the command.
     * @param {heartType} heart - The heart of the bot.
     * @param {Object} cmdConfig - The command configuration.
     */
	constructor(heart, cmdConfig) {
		const productConfig = heart.core.discord.core.config.manager.get('products').get();

		super(heart, {
			name: 'productpanel',
			data: new SlashCommandBuilder()
				.setName(cmdConfig.commands.productpanel?.name || 'productpanel')
				.setDescription(cmdConfig.commands.productpanel?.description || 'Display the product download panel')
				.addStringOption(option =>
					option.setName('panel')
						.setDescription('Select which panel to display')
						.setRequired(false)
						.setAutocomplete(true)
				),
			contextMenu: false,
			global: true,
			category: 'products',
			bypass: true,
			permissionLevel: productConfig.config.permissions.panel_command,
		});
	}

	/**
	 * Handle autocomplete for panel selection.
	 * @param {AutocompleteInteraction} interaction - The autocomplete interaction.
	 */
	async autocomplete(interaction) {
		try {
			const productConfig = this.heart.core.discord.core.config.manager.get('products').get();
			const focusedValue = interaction.options.getFocused();
			
			const choices = Object.keys(productConfig.config.panels || {}).map(panelId => ({
				name: productConfig.config.panels[panelId].name || panelId,
				value: panelId
			}));

			const filtered = choices.filter(choice => 
				choice.name.toLowerCase().includes(focusedValue.toLowerCase())
			);

			await interaction.respond(filtered.slice(0, 25));
		} catch (err) {
			this.heart.core.console.log(this.heart.core.console.type.error, 'Error in autocomplete:', err);
		}
	}

	/**
     * Executes the command.
     * @param {CommandInteraction} interaction - The interaction object.
     * @param {Object} langConfig - The language configuration.
     */
	async execute(interaction, langConfig) {
		try {
			const productConfig = this.heart.core.discord.core.config.manager.get('products').get();
			const selectedPanel = interaction.options.getString('panel');
			
			// Check if multiple panels are configured
			if (productConfig.config.panels && Object.keys(productConfig.config.panels).length > 0) {
				if (!selectedPanel) {
					// Show panel selection menu
					return await this.showPanelSelection(interaction, productConfig);
				} else {
					// Show specific panel
					return await this.showSpecificPanel(interaction, productConfig, selectedPanel);
				}
			} else {
				// Fall back to legacy single panel mode
				return await this.showLegacyPanel(interaction, productConfig);
			}

		} catch (err) {
			this.heart.core.console.log(this.heart.core.console.type.error, `An issue occurred while executing command ${this.getName()}`);
			new this.heart.core.error.interface(this.heart, err);
			await interaction.reply({ 
				embeds: [this.heart.core.util.discord.generateErrorEmbed(langConfig.lang.unexpected_command_error.replace(/%command%/g, `/${interaction.commandName}`))], 
				ephemeral: true 
			});
		}
	}

	/**
	 * Shows panel selection dropdown.
	 * @param {CommandInteraction} interaction - The interaction object.
	 * @param {Object} productConfig - The product configuration.
	 */
	async showPanelSelection(interaction, productConfig) {
		const embed = new EmbedBuilder()
			.setTitle('🛍️ Product Panel Selection')
			.setDescription('Please select which product panel you want to view:')
			.setColor('#0099ff')
			.setTimestamp();

		const selectMenu = new StringSelectMenuBuilder()
			.setCustomId(`iynx:athenabot:productPanel:panel_select:${interaction.user.id}`)
			.setPlaceholder('Choose a product panel...');

		Object.entries(productConfig.config.panels).forEach(([panelId, panel]) => {
			selectMenu.addOptions(
				new StringSelectMenuOptionBuilder()
					.setLabel(panel.name || panelId)
					.setDescription(panel.description || 'Product panel')
					.setValue(panelId)
					.setEmoji(panel.emoji || '📦')
			);
		});

		const row = new ActionRowBuilder().addComponents(selectMenu);

		const reply = await interaction.reply({
			embeds: [embed],
			components: [row],
			ephemeral: false
		});

		// Set up select menu collector
		const collector = reply.createMessageComponentCollector({
			time: 300000 // 5 minutes
		});

		collector.on('collect', async (selectInteraction) => {
			if (selectInteraction.customId === `iynx:athenabot:productPanel:panel_select:${interaction.user.id}`) {
				const selectedPanelId = selectInteraction.values[0];
				await this.handlePanelSelection(selectInteraction, productConfig, selectedPanelId);
			}
		});
	}

	/**
	 * Handles panel selection from dropdown.
	 * @param {SelectMenuInteraction} selectInteraction - The select menu interaction.
	 * @param {Object} productConfig - The product configuration.
	 * @param {string} panelId - The selected panel ID.
	 */
	async handlePanelSelection(selectInteraction, productConfig, panelId) {
		const panel = productConfig.config.panels[panelId];
		if (!panel) {
			return await selectInteraction.reply({
				content: '❌ Panel not found.',
				ephemeral: true
			});
		}

		// Create new embed and buttons for selected panel
		const embed = new EmbedBuilder()
			.setTitle(panel.title || '🛍️ Product Download Panel')
			.setDescription(panel.description || 'Select a product below to download:')
			.setColor(panel.embed_color || '#0099ff')
			.setTimestamp();

		if (panel.thumbnail_url) {
			embed.setThumbnail(panel.thumbnail_url);
		}

		if (panel.footer_text) {
			embed.setFooter({ text: panel.footer_text });
		}

		// Create buttons for products in this panel
		const buttons = this.createProductButtons(panel.products || [], selectInteraction.user.id);

		await selectInteraction.update({
			embeds: [embed],
			components: buttons
		});

		// Set up button collector for product downloads
		const collector = selectInteraction.message.createMessageComponentCollector({
			time: 300000 // 5 minutes
		});

		collector.on('collect', async (buttonInteraction) => {
			if (buttonInteraction.customId.startsWith('iynx:athenabot:productPanel:product_')) {
				await this.handleButtonInteraction(buttonInteraction, productConfig, panelId);
			}
		});
	}

	/**
	 * Shows a specific panel directly.
	 * @param {CommandInteraction} interaction - The interaction object.
	 * @param {Object} productConfig - The product configuration.
	 * @param {string} panelId - The panel ID to show.
	 */
	async showSpecificPanel(interaction, productConfig, panelId) {
		const panel = productConfig.config.panels[panelId];
		if (!panel) {
			return await interaction.reply({
				content: '❌ Panel not found.',
				ephemeral: true
			});
		}

		// Create embed for specific panel
		const embed = new EmbedBuilder()
			.setTitle(panel.title || '🛍️ Product Download Panel')
			.setDescription(panel.description || 'Select a product below to download:')
			.setColor(panel.embed_color || '#0099ff')
			.setTimestamp();

		if (panel.thumbnail_url) {
			embed.setThumbnail(panel.thumbnail_url);
		}

		if (panel.footer_text) {
			embed.setFooter({ text: panel.footer_text });
		}

		// Create buttons for products in this panel
		const buttons = this.createProductButtons(panel.products || [], interaction.user.id);

		const reply = await interaction.reply({
			embeds: [embed],
			components: buttons,
			ephemeral: false
		});

		// Set up button collector
		const collector = reply.createMessageComponentCollector({
			time: 300000 // 5 minutes
		});

		collector.on('collect', async (buttonInteraction) => {
			if (buttonInteraction.customId.startsWith('iynx:athenabot:productPanel:product_')) {
				await this.handleButtonInteraction(buttonInteraction, productConfig, panelId);
			}
		});
	}

	/**
	 * Shows legacy single panel (backwards compatibility).
	 * @param {CommandInteraction} interaction - The interaction object.
	 * @param {Object} productConfig - The product configuration.
	 */
	async showLegacyPanel(interaction, productConfig) {
		// Create embed
		const embed = new EmbedBuilder()
			.setTitle('🛍️ Product Download Panel')
			.setDescription(productConfig.config.panel.description || 'Select a product below to download:')
			.setColor(productConfig.config.panel.embed_color || '#0099ff')
			.setTimestamp();

		if (productConfig.config.panel.thumbnail_url) {
			embed.setThumbnail(productConfig.config.panel.thumbnail_url);
		}

		if (productConfig.config.panel.footer_text) {
			embed.setFooter({ text: productConfig.config.panel.footer_text });
		}

		// Create buttons for legacy products
		const buttons = this.createProductButtons(productConfig.config.products || [], interaction.user.id);

		const reply = await interaction.reply({
			embeds: [embed],
			components: buttons,
			ephemeral: false
		});

		// Set up button collector
		const collector = reply.createMessageComponentCollector({
			time: 300000 // 5 minutes
		});

		collector.on('collect', async (buttonInteraction) => {
			if (buttonInteraction.customId.startsWith('iynx:athenabot:productPanel:product_')) {
				await this.handleButtonInteraction(buttonInteraction, productConfig, 'legacy');
			}
		});
	}

	/**
	 * Creates product buttons from products array.
	 * @param {Array} products - Array of product objects.
	 * @param {string} userId - The user ID for the interaction.
	 * @returns {Array} Array of ActionRowBuilder components.
	 */
	createProductButtons(products, userId) {
		const buttons = [];

		for (let i = 0; i < products.length; i += 5) {
			const row = new ActionRowBuilder();
			const rowProducts = products.slice(i, i + 5);

			for (const product of rowProducts) {
				const button = new ButtonBuilder()
					.setCustomId(`iynx:athenabot:productPanel:product_${product.id}:${userId}`)
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

	/**
     * Handles button interactions for product downloads.
     * @param {ButtonInteraction} buttonInteraction - The button interaction object.
     * @param {Object} productConfig - The product configuration.
     * @param {string} panelId - The panel ID where the button was clicked.
     */
	async handleButtonInteraction(buttonInteraction, productConfig, panelId) {
		try {
			const productId = buttonInteraction.customId.replace(/^iynx:athenabot:productPanel:product_/, '').replace(`:${buttonInteraction.user.id}`, '');
			let product;

			// Find product in the correct panel or legacy products
			if (panelId === 'legacy') {
				product = productConfig.config.products.find(p => p.id === productId);
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
				.setTimestamp();

			await buttonInteraction.reply({
				embeds: [downloadEmbed],
				files: [attachment],
				ephemeral: true
			});

			// Log download activity
			this.heart.core.console.log(
				this.heart.core.console.type.log, 
				`User ${buttonInteraction.user.tag} (${buttonInteraction.user.id}) downloaded product: ${product.name} from panel: ${panelId}`
			);

			// Optional: Save to database for tracking
			if (productConfig.config.logging.track_downloads) {
				const userDoc = await this.heart.core.database.userData.get(buttonInteraction.guild.id, buttonInteraction.user.id);
				const downloads = userDoc.downloads || [];
				downloads.push({
					product_id: product.id,
					product_name: product.name,
					panel_id: panelId,
					timestamp: new Date(),
					guild_id: buttonInteraction.guild.id
				});
				
				await this.heart.core.database.userData.save(buttonInteraction.guild.id, buttonInteraction.user.id, { 
					downloads: downloads 
				});
			}

			// Log to channel if enabled
			if (productConfig.config.logging.log_to_channel && productConfig.config.logging.log_channel_id) {
				const logChannel = buttonInteraction.guild.channels.cache.get(productConfig.config.logging.log_channel_id);
				if (logChannel) {
					const logEmbed = new EmbedBuilder()
						.setTitle('📥 Product Downloaded')
						.addFields(
							{ name: 'User', value: `${buttonInteraction.user.tag} (${buttonInteraction.user.id})`, inline: true },
							{ name: 'Product', value: product.name, inline: true },
							{ name: 'Panel', value: panelId, inline: true },
							{ name: 'Time', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
						)
						.setColor('#00ff00')
						.setTimestamp();

					await logChannel.send({ embeds: [logEmbed] });
				}
			}

		} catch (err) {
			this.heart.core.console.log(this.heart.core.console.type.error, `An issue occurred while handling product button interaction`);
			new this.heart.core.error.interface(this.heart, err);
			
			if (!buttonInteraction.replied) {
				await buttonInteraction.reply({
					content: '❌ An error occurred while processing your request.',
					ephemeral: true
				});
			}
		}
	}
};