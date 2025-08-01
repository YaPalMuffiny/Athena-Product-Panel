const handler = require('../../../../main/discord/core/handler/handler.js');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

/* eslint-disable no-unused-vars, no-constant-condition */
if (null) {
	const heartType = require('../../../../types/heart.js');
	const handlerType = require('../../../../types/discord/core/handler/handler.js');
}
/* eslint-enable no-unused-vars, no-constant-condition  */

/**
 * A class representing the product panel handler.
 * @class
 * @extends handlerType
 */
module.exports = class productPanelHandler extends handler {
	/**
     * Creates an instance of the handler.
     * @param {heartType} heart - The heart of the bot.
     */
	constructor(heart) {
		super(heart, 'productPanel');
		heart.core.discord.core.cache.manager.register(new heart.core.discord.core.cache.interface(heart, 'productCache'));
		
		// Store panel message IDs for tracking
		this.panelMessages = new Map();
	}

	/**
	 * Gets the product cache.
	 * @returns {Object} The product cache interface.
	 */
	getCache() {
		return this.heart.core.discord.core.cache.manager.get('productCache');
	}

	/**
	 * Gets a product by ID.
	 * @param {string} productId - The product ID to search for.
	 * @returns {Object|null} The product object or null if not found.
	 */
	getProductById(productId) {
		const productConfig = this.heart.core.discord.core.config.manager.get('products').get();
		return productConfig.config.products.find(p => p.id === productId) || null;
	}

	/**
	 * Checks if a user has access to a specific product.
	 * @param {Object} member - The Discord member object.
	 * @param {string} productId - The product ID to check access for.
	 * @returns {boolean} True if the user has access, false otherwise.
	 */
	hasProductAccess(member, productId) {
		const product = this.getProductById(productId);
		if (!product) return false;

		return product.required_roles.some(roleId => member.roles.cache.has(roleId));
	}

	/**
	 * Gets all products that a user has access to.
	 * @param {Object} member - The Discord member object.
	 * @returns {Array} Array of products the user can access.
	 */
	getUserAccessibleProducts(member) {
		const productConfig = this.heart.core.discord.core.config.manager.get('products').get();
		return productConfig.config.products.filter(product => 
			product.required_roles.some(roleId => member.roles.cache.has(roleId))
		);
	}

	/**
	 * Sets up a specific panel in its designated channel.
	 * @param {string} panelId - The panel ID.
	 * @param {Object} panel - The panel configuration.
	 */
	async setupPanelInChannel(panelId, panel) {
		try {
			if (!panel.channel_id) return;

			// Get all guilds the bot is in
			for (const [guildId, guild] of this.heart.core.discord.client.guilds.cache) {
				const channel = guild.channels.cache.get(panel.channel_id);
				if (!channel) continue;

				// Check permissions
				if (!channel.permissionsFor(guild.members.me).has(['SendMessages', 'EmbedLinks'])) {
					this.heart.core.console.log(
						this.heart.core.console.type.warning,
						`Missing permissions in channel ${channel.name} (${channel.id}) for panel ${panelId}`
					);
					continue;
				}

				await this.createPanelMessage(channel, panelId, panel);
			}
		} catch (err) {
			this.heart.core.console.log(this.heart.core.console.type.error, `Error setting up panel ${panelId} in channel:`, err);
		}
	}

	/**
	 * Sets up the legacy panel in its designated channel.
	 */
	async setupLegacyPanelInChannel() {
		try {
			const productConfig = this.heart.core.discord.core.config.manager.get('products').get();
			const panel = productConfig.config.panel;
			
			if (!panel.channel_id) return;

			// Get all guilds the bot is in
			for (const [guildId, guild] of this.heart.core.discord.client.guilds.cache) {
				const channel = guild.channels.cache.get(panel.channel_id);
				if (!channel) continue;

				// Check permissions
				if (!channel.permissionsFor(guild.members.me).has(['SendMessages', 'EmbedLinks'])) {
					this.heart.core.console.log(
						this.heart.core.console.type.warning,
						`Missing permissions in channel ${channel.name} (${channel.id}) for legacy panel`
					);
					continue;
				}

				await this.createLegacyPanelMessage(channel, panel);
			}
		} catch (err) {
			this.heart.core.console.log(this.heart.core.console.type.error, 'Error setting up legacy panel in channel:', err);
		}
	}

	/**
	 * Creates a panel message in the specified channel.
	 * @param {Object} channel - The Discord channel object.
	 * @param {string} panelId - The panel ID.
	 * @param {Object} panel - The panel configuration.
	 */
	async createPanelMessage(channel, panelId, panel) {
		try {
			const productConfig = this.heart.core.discord.core.config.manager.get('products').get();

			// Delete old panel message if configured
			if (productConfig.config.channels?.delete_old_messages) {
				const oldMessageId = this.panelMessages.get(`${channel.id}-${panelId}`);
				if (oldMessageId) {
					try {
						const oldMessage = await channel.messages.fetch(oldMessageId);
						await oldMessage.delete();
					} catch (err) {
						// Message might already be deleted, ignore error
					}
				}
			}

			// Create embed
			const embed = new EmbedBuilder()
				.setTitle(panel.title || '🛍️ Product Download Panel')
				.setDescription(panel.description || 'Click the buttons below to download products. Downloads will be sent privately to you.')
				.setColor(panel.embed_color || '#0099ff')
				.setFooter({ text: `${panel.footer_text || 'Product Downloads'} • Anyone can use this panel, downloads are private.` })
				.setTimestamp();

			if (panel.thumbnail_url) {
				embed.setThumbnail(panel.thumbnail_url);
			}

			// Create buttons for products
			const buttons = this.createChannelProductButtons(panel.products || [], panelId);

			const message = await channel.send({
				embeds: [embed],
				components: buttons
			});

			// Store message ID for future reference
			this.panelMessages.set(`${channel.id}-${panelId}`, message.id);

			// Set up button collector that doesn't expire
			const collector = message.createMessageComponentCollector({
				filter: (interaction) => interaction.customId.startsWith(`iynx:athenabot:productPanel:channel_product_`),
			});

			collector.on('collect', async (buttonInteraction) => {
				await this.handleChannelButtonInteraction(buttonInteraction, productConfig, panelId);
			});

			this.heart.core.console.log(
				this.heart.core.console.type.log,
				`Panel ${panelId} setup in channel ${channel.name} (${channel.id})`
			);

		} catch (err) {
			this.heart.core.console.log(this.heart.core.console.type.error, `Error creating panel message for ${panelId}:`, err);
		}
	}

	/**
	 * Creates a legacy panel message in the specified channel.
	 * @param {Object} channel - The Discord channel object.
	 * @param {Object} panel - The panel configuration.
	 */
	async createLegacyPanelMessage(channel, panel) {
		try {
			const productConfig = this.heart.core.discord.core.config.manager.get('products').get();

			// Delete old panel message if configured
			if (productConfig.config.channels?.delete_old_messages) {
				const oldMessageId = this.panelMessages.get(`${channel.id}-legacy`);
				if (oldMessageId) {
					try {
						const oldMessage = await channel.messages.fetch(oldMessageId);
						await oldMessage.delete();
					} catch (err) {
						// Message might already be deleted, ignore error
					}
				}
			}

			// Create embed
			const embed = new EmbedBuilder()
				.setTitle('🛍️ Product Download Panel')
				.setDescription(panel.description || 'Click the buttons below to download products. Downloads will be sent privately to you.')
				.setColor(panel.embed_color || '#0099ff')
				.setFooter({ text: `${panel.footer_text || 'Product Downloads'} • Anyone can use this panel, downloads are private.` })
				.setTimestamp();

			if (panel.thumbnail_url) {
				embed.setThumbnail(panel.thumbnail_url);
			}

			// Create buttons for legacy products
			const buttons = this.createChannelProductButtons(productConfig.config.products || [], 'legacy');

			const message = await channel.send({
				embeds: [embed],
				components: buttons
			});

			// Store message ID for future reference
			this.panelMessages.set(`${channel.id}-legacy`, message.id);

			// Set up button collector that doesn't expire
			const collector = message.createMessageComponentCollector({
				filter: (interaction) => interaction.customId.startsWith(`iynx:athenabot:productPanel:channel_product_`),
			});

			collector.on('collect', async (buttonInteraction) => {
				await this.handleChannelButtonInteraction(buttonInteraction, productConfig, 'legacy');
			});

			this.heart.core.console.log(
				this.heart.core.console.type.log,
				`Legacy panel setup in channel ${channel.name} (${channel.id})`
			);

		} catch (err) {
			this.heart.core.console.log(this.heart.core.console.type.error, 'Error creating legacy panel message:', err);
		}
	}

	/**
	 * Creates product buttons for channel panels.
	 * @param {Array} products - Array of product objects.
	 * @param {string} panelId - The panel ID.
	 * @returns {Array} Array of ActionRowBuilder components.
	 */
	createChannelProductButtons(products, panelId) {
		const buttons = [];

		for (let i = 0; i < products.length; i += 5) {
			const row = new ActionRowBuilder();
			const rowProducts = products.slice(i, i + 5);

			for (const product of rowProducts) {
				const button = new ButtonBuilder()
					.setCustomId(`iynx:athenabot:productPanel:channel_product_${product.id}:${panelId}`)
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
	 * Handles button interactions from channel panels.
	 * @param {ButtonInteraction} buttonInteraction - The button interaction object.
	 * @param {Object} productConfig - The product configuration.
	 * @param {string} panelId - The panel ID where the button was clicked.
	 */
	async handleChannelButtonInteraction(buttonInteraction, productConfig, panelId) {
		try {
			const customIdParts = buttonInteraction.customId.split(':');
			const productInfo = customIdParts[customIdParts.length - 2]; // Get product_id part
			const productId = productInfo.replace('channel_product_', '');
			
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
				.setFooter({ text: 'This download is private and only visible to you.' })
				.setTimestamp();

			await buttonInteraction.reply({
				embeds: [downloadEmbed],
				files: [attachment],
				ephemeral: true // Keep downloads ephemeral for privacy
			});

			// Log download activity
			this.heart.core.console.log(
				this.heart.core.console.type.log, 
				`User ${buttonInteraction.user.tag} (${buttonInteraction.user.id}) downloaded product: ${product.name} from channel panel: ${panelId}`
			);

			// Optional: Save to database for tracking
			if (productConfig.config.logging.track_downloads) {
				const userDoc = await this.heart.core.database.userData.get(buttonInteraction.guild.id, buttonInteraction.user.id);
				const downloads = userDoc.downloads || [];
				downloads.push({
					product_id: product.id,
					product_name: product.name,
					panel_id: panelId,
					source: 'channel_panel',
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
						.setTitle('📥 Product Downloaded (Channel Panel)')
						.addFields(
							{ name: 'User', value: `${buttonInteraction.user.tag} (${buttonInteraction.user.id})`, inline: true },
							{ name: 'Product', value: product.name, inline: true },
							{ name: 'Panel', value: panelId, inline: true },
							{ name: 'Source', value: 'Channel Panel', inline: true },
							{ name: 'Time', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
						)
						.setColor('#00ff00')
						.setTimestamp();

					await logChannel.send({ embeds: [logEmbed] });
				}
			}

		} catch (err) {
			this.heart.core.console.log(this.heart.core.console.type.error, 'Error handling channel button interaction:', err);
			
			if (!buttonInteraction.replied) {
				await buttonInteraction.reply({
					content: '❌ An error occurred while processing your request.',
					ephemeral: true
				});
			}
		}
	}

	/**
	 * Logs a product download.
	 * @param {Object} interaction - The Discord interaction object.
	 * @param {Object} product - The product object.
	 */
	async logDownload(interaction, product) {
		try {
			const productConfig = this.heart.core.discord.core.config.manager.get('products').get();
			
			// Log to console
			this.heart.core.console.log(
				this.heart.core.console.type.log,
				`Product Download - User: ${interaction.user.tag} | Product: ${product.name} | Guild: ${interaction.guild.name}`
			);

			// Log to channel if enabled
			if (productConfig.config.logging.log_to_channel && productConfig.config.logging.log_channel_id) {
				const logChannel = interaction.guild.channels.cache.get(productConfig.config.logging.log_channel_id);
				if (logChannel) {
					const logEmbed = new EmbedBuilder()
						.setTitle('📥 Product Downloaded')
						.addFields(
							{ name: 'User', value: `${interaction.user.tag} (${interaction.user.id})`, inline: true },
							{ name: 'Product', value: product.name, inline: true },
							{ name: 'Time', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
						)
						.setColor('#00ff00')
						.setTimestamp();

					await logChannel.send({ embeds: [logEmbed] });
				}
			}
		} catch (err) {
			this.heart.core.console.log(this.heart.core.console.type.error, 'Error logging product download:', err);
		}
	}
};