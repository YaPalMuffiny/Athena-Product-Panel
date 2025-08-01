// src/handler/productPanelHandler.js - Fixed handler with proper error handling
const handler = require('../../../../main/discord/core/handler/handler.js');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

/**
 * Product panel handler with optimized setup and channel functionality.
 * @class
 * @extends handlerType
 */
module.exports = class productPanelHandler extends handler {
	constructor(heart) {
		super(heart, 'productPanel');
		
		// Initialize cache
		try {
			heart.core.discord.core.cache.manager.register(new heart.core.discord.core.cache.interface(heart, 'productCache'));
		} catch (err) {
			this.heart.core.console.log(this.heart.core.console.type.error, 'Error registering product cache:', err);
		}
		
		// Store panel message IDs for tracking
		this.panelMessages = new Map(); // key: "channelId-panelId", value: messageId
		
		// Don't load from database immediately - wait for client to be ready
		this.databaseLoaded = false;
	}

	getCache() {
		try {
			return this.heart.core.discord.core.cache.manager.get('productCache');
		} catch (err) {
			this.heart.core.console.log(this.heart.core.console.type.error, 'Error getting product cache:', err);
			return null;
		}
	}

	/**
	 * Load panel message tracking from database
	 */
	async loadPanelMessagesFromDatabase() {
		if (this.databaseLoaded) return; // Already loaded
		
		try {
			const cache = this.getCache();
			if (!cache) {
				this.heart.core.console.log(this.heart.core.console.type.warning, 'Product cache not available, skipping database load');
				return;
			}

			const panelData = await cache.get('panel_messages');
			if (panelData) {
				this.panelMessages = new Map(Object.entries(panelData));
				this.heart.core.console.log(
					this.heart.core.console.type.log,
					`Loaded ${this.panelMessages.size} panel messages from database`
				);
			}
			this.databaseLoaded = true;
		} catch (err) {
			this.heart.core.console.log(this.heart.core.console.type.error, 'Error loading panel messages from database:', err);
		}
	}

	/**
	 * Save panel message tracking to database
	 */
	async savePanelMessagesToDatabase() {
		try {
			const cache = this.getCache();
			if (!cache) {
				this.heart.core.console.log(this.heart.core.console.type.warning, 'Product cache not available, skipping database save');
				return;
			}

			const panelData = Object.fromEntries(this.panelMessages);
			await cache.set('panel_messages', panelData);
		} catch (err) {
			this.heart.core.console.log(this.heart.core.console.type.error, 'Error saving panel messages to database:', err);
		}
	}

	/**
	 * Remove panel message from database
	 */
	async removePanelMessageFromDatabase(channelId, panelId) {
		try {
			this.panelMessages.delete(`${channelId}-${panelId}`);
			await this.savePanelMessagesToDatabase();
		} catch (err) {
			this.heart.core.console.log(this.heart.core.console.type.error, 'Error removing panel message from database:', err);
		}
	}

	/**
	 * Clear all panel messages from database
	 */
	async clearAllPanelMessagesFromDatabase() {
		try {
			const cache = this.getCache();
			if (cache) {
				await cache.delete('panel_messages');
			}
			this.panelMessages.clear();
		} catch (err) {
			this.heart.core.console.log(this.heart.core.console.type.error, 'Error clearing panel messages from database:', err);
		}
	}

	/**
	 * Sets up a specific panel in a given channel (used by setup command).
	 * @param {string} panelId - The panel ID.
	 * @param {Object} panel - The panel configuration.
	 * @param {Object} targetChannel - The specific channel to setup in.
	 */
	async setupPanelInChannel(panelId, panel, targetChannel) {
		try {
			// Check permissions
			const botPermissions = targetChannel.permissionsFor(targetChannel.guild.members.me);
			if (!botPermissions || !botPermissions.has(['SendMessages', 'EmbedLinks'])) {
				throw new Error(`Missing permissions in channel ${targetChannel.name}`);
			}

			// Ensure database is loaded
			await this.loadPanelMessagesFromDatabase();

			// Check if panel already exists in this channel
			const existingKey = `${targetChannel.id}-${panelId}`;
			if (this.panelMessages.has(existingKey)) {
				const existingMessageId = this.panelMessages.get(existingKey);
				try {
					const existingMessage = await targetChannel.messages.fetch(existingMessageId);
					if (existingMessage) {
						throw new Error(`Panel "${panelId}" already exists in channel ${targetChannel.name}`);
					}
				} catch (fetchErr) {
					// Message doesn't exist anymore, remove from tracking
					this.panelMessages.delete(existingKey);
					await this.savePanelMessagesToDatabase();
				}
			}

			await this.createPanelMessage(targetChannel, panelId, panel);
			
			this.heart.core.console.log(
				this.heart.core.console.type.log,
				`Panel ${panelId} setup in channel ${targetChannel.name} (${targetChannel.id})`
			);

		} catch (err) {
			this.heart.core.console.log(this.heart.core.console.type.error, `Error setting up panel ${panelId} in channel:`, err);
			throw err;
		}
	}

	/**
	 * Sets up the legacy panel in a given channel (used by setup command).
	 * @param {Object} targetChannel - The specific channel to setup in.
	 */
	async setupLegacyPanelInChannel(targetChannel) {
		try {
			const productConfig = this.heart.core.discord.core.config.manager.get('products').get();
			const panel = productConfig.config.legacy?.panel || {};
			
			// Check permissions
			const botPermissions = targetChannel.permissionsFor(targetChannel.guild.members.me);
			if (!botPermissions || !botPermissions.has(['SendMessages', 'EmbedLinks'])) {
				throw new Error(`Missing permissions in channel ${targetChannel.name}`);
			}

			// Ensure database is loaded
			await this.loadPanelMessagesFromDatabase();

			// Check if legacy panel already exists in this channel
			const existingKey = `${targetChannel.id}-legacy`;
			if (this.panelMessages.has(existingKey)) {
				const existingMessageId = this.panelMessages.get(existingKey);
				try {
					const existingMessage = await targetChannel.messages.fetch(existingMessageId);
					if (existingMessage) {
						throw new Error(`Legacy panel already exists in channel ${targetChannel.name}`);
					}
				} catch (fetchErr) {
					// Message doesn't exist anymore, remove from tracking
					this.panelMessages.delete(existingKey);
					await this.savePanelMessagesToDatabase();
				}
			}

			await this.createLegacyPanelMessage(targetChannel, panel);
			
			this.heart.core.console.log(
				this.heart.core.console.type.log,
				`Legacy panel setup in channel ${targetChannel.name} (${targetChannel.id})`
			);

		} catch (err) {
			this.heart.core.console.log(this.heart.core.console.type.error, 'Error setting up legacy panel in channel:', err);
			throw err;
		}
	}

	/**
	 * Clear all existing panel messages (used by /setuppanel clear command).
	 */
	async clearAllPanelMessages() {
		try {
			// Ensure data is loaded from database first
			await this.loadPanelMessagesFromDatabase();
			
			let removedCount = 0;
			let errorCount = 0;
			const channelsAffected = new Set();

			this.heart.core.console.log(this.heart.core.console.type.log, `Starting clear of ${this.panelMessages.size} panel messages...`);

			// Get Discord client
			const client = this.heart.core.discord?.client;
			if (!client) {
				throw new Error('Discord client not available');
			}

			// Clear all tracked panel messages
			for (const [messageKey, messageId] of this.panelMessages.entries()) {
				try {
					const [channelId, panelId] = messageKey.split('-');
					
					// Get the channel
					const channel = client.channels.cache.get(channelId);
					if (!channel) {
						this.heart.core.console.log(this.heart.core.console.type.warning, `Channel ${channelId} not found, removing from tracking`);
						continue;
					}

					// Try to fetch and delete the message
					try {
						const message = await channel.messages.fetch(messageId);
						await message.delete();
						channelsAffected.add(channelId);
						removedCount++;
						
						this.heart.core.console.log(
							this.heart.core.console.type.log,
							`Deleted panel message ${messageId} from channel ${channel.name} (${channelId})`
						);
					} catch (fetchErr) {
						this.heart.core.console.log(this.heart.core.console.type.warning, `Message ${messageId} not found in ${channel.name}, removing from tracking`);
					}

				} catch (err) {
					this.heart.core.console.log(this.heart.core.console.type.error, `Error clearing message ${messageKey}:`, err);
					errorCount++;
				}
			}

			// Clear all from database and memory
			await this.clearAllPanelMessagesFromDatabase();

			this.heart.core.console.log(
				this.heart.core.console.type.log, 
				`Panel clear complete: ${removedCount} removed, ${errorCount} errors, ${channelsAffected.size} channels affected`
			);

			return { 
				removedCount, 
				errorCount, 
				channelsAffected: channelsAffected.size,
				totalTracked: 0 // All cleared
			};

		} catch (err) {
			this.heart.core.console.log(this.heart.core.console.type.error, 'Error in clear all panel messages:', err);
			throw err;
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
			// Get enabled products only
			const enabledProducts = (panel.products || []).filter(p => p.enabled !== false);
			
			if (enabledProducts.length === 0) {
				throw new Error(`Panel ${panelId} has no enabled products`);
			}

			// Create embed
			const embed = new EmbedBuilder()
				.setTitle(panel.title || '🛍️ Product Download Panel')
				.setDescription(panel.description || 'Click the buttons below to download products. Downloads will be sent privately to you.')
				.setColor(panel.embed_color || '#0099ff')
				.setFooter({ text: `${panel.footer_text || 'Product Downloads'} • Downloads are private` })
				.setTimestamp();

			if (panel.thumbnail_url) {
				embed.setThumbnail(panel.thumbnail_url);
			}

			// Create buttons for products
			const buttons = this.createChannelProductButtons(enabledProducts, panelId);

			if (buttons.length === 0) {
				throw new Error(`No buttons created for panel ${panelId}`);
			}

			const message = await channel.send({
				embeds: [embed],
				components: buttons
			});

			// Store message ID for tracking
			const messageKey = `${channel.id}-${panelId}`;
			this.panelMessages.set(messageKey, message.id);
			await this.savePanelMessagesToDatabase();

			// Set up persistent button collector
			const collector = message.createMessageComponentCollector({
				filter: (interaction) => interaction.customId.startsWith(`setup:product:`),
			});

			collector.on('collect', async (buttonInteraction) => {
				await this.handleChannelButtonInteraction(buttonInteraction, panelId);
			});

			collector.on('error', (err) => {
				this.heart.core.console.log(this.heart.core.console.type.error, `Collector error for panel ${panelId}:`, err);
			});

		} catch (err) {
			this.heart.core.console.log(this.heart.core.console.type.error, `Error creating panel message for ${panelId}:`, err);
			throw err;
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
			const legacyProducts = productConfig.config.legacy?.products || [];
			
			// Get enabled products only
			const enabledProducts = legacyProducts.filter(p => p.enabled !== false);
			
			if (enabledProducts.length === 0) {
				throw new Error('Legacy panel has no enabled products');
			}

			// Create embed
			const embed = new EmbedBuilder()
				.setTitle(panel.title || '🛍️ Product Download Panel')
				.setDescription(panel.description || 'Click the buttons below to download products. Downloads will be sent privately to you.')
				.setColor(panel.embed_color || '#0099ff')
				.setFooter({ text: `${panel.footer_text || 'Product Downloads'} • Downloads are private` })
				.setTimestamp();

			if (panel.thumbnail_url) {
				embed.setThumbnail(panel.thumbnail_url);
			}

			// Create buttons for legacy products
			const buttons = this.createChannelProductButtons(enabledProducts, 'legacy');

			if (buttons.length === 0) {
				throw new Error('No buttons created for legacy panel');
			}

			const message = await channel.send({
				embeds: [embed],
				components: buttons
			});

			// Store message ID for tracking
			const messageKey = `${channel.id}-legacy`;
			this.panelMessages.set(messageKey, message.id);
			await this.savePanelMessagesToDatabase();

			// Set up persistent button collector
			const collector = message.createMessageComponentCollector({
				filter: (interaction) => interaction.customId.startsWith(`setup:product:`),
			});

			collector.on('collect', async (buttonInteraction) => {
				await this.handleChannelButtonInteraction(buttonInteraction, 'legacy');
			});

			collector.on('error', (err) => {
				this.heart.core.console.log(this.heart.core.console.type.error, 'Collector error for legacy panel:', err);
			});

		} catch (err) {
			this.heart.core.console.log(this.heart.core.console.type.error, 'Error creating legacy panel message:', err);
			throw err;
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
		const maxProducts = 25; // Discord limit: 5 rows x 5 buttons

		// Limit to Discord's button constraints
		const limitedProducts = products.slice(0, maxProducts);

		for (let i = 0; i < limitedProducts.length; i += 5) {
			const row = new ActionRowBuilder();
			const rowProducts = limitedProducts.slice(i, i + 5);

			for (const product of rowProducts) {
				try {
					const button = new ButtonBuilder()
						.setCustomId(`setup:product:${product.id}:${panelId}`)
						.setLabel(product.name.length > 80 ? product.name.substring(0, 77) + '...' : product.name)
						.setStyle(ButtonStyle.Primary);

					if (product.emoji) {
						try {
							button.setEmoji(product.emoji);
						} catch (emojiErr) {
							// Invalid emoji, skip setting it
							this.heart.core.console.log(this.heart.core.console.type.warning, `Invalid emoji for product ${product.id}: ${product.emoji}`);
						}
					}

					row.addComponents(button);
				} catch (buttonErr) {
					this.heart.core.console.log(this.heart.core.console.type.error, `Error creating button for product ${product.id}:`, buttonErr);
				}
			}

			if (row.components.length > 0) {
				buttons.push(row);
			}
		}

		return buttons;
	}

	/**
	 * Handles button interactions from channel panels.
	 * @param {ButtonInteraction} buttonInteraction - The button interaction object.
	 * @param {string} panelId - The panel ID where the button was clicked.
	 */
	async handleChannelButtonInteraction(buttonInteraction, panelId) {
		try {
			const productConfig = this.heart.core.discord.core.config.manager.get('products').get();
			const customIdParts = buttonInteraction.customId.split(':');
			const productId = customIdParts[2];
			
			let product;

			// Find product in the correct panel or legacy products
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

			// Check if user has required role
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

			// Create attachment and send
			const attachment = new AttachmentBuilder(filePath, { name: product.download_name || product.file_path });

			const downloadEmbed = new EmbedBuilder()
				.setTitle('✅ Download Ready')
				.setDescription(`**${product.name}**\n\n${product.description || 'No description available.'}`)
				.addFields(
					{ name: 'File Name', value: product.download_name || product.file_path, inline: true },
					{ name: 'Panel', value: panelId === 'legacy' ? 'Legacy Panel' : (productConfig.config.panels?.[panelId]?.name || panelId), inline: true },
					{ name: 'Source', value: 'Channel Panel', inline: true }
				)
				.setColor('#00ff00')
				.setFooter({ text: 'Download is private and only visible to you' })
				.setTimestamp();

			await buttonInteraction.reply({
				embeds: [downloadEmbed],
				files: [attachment],
				ephemeral: true
			});

			// Log download activity
			this.heart.core.console.log(
				this.heart.core.console.type.log, 
				`Channel download: ${buttonInteraction.user.tag} (${buttonInteraction.user.id}) downloaded "${product.name}" from panel "${panelId}" in ${buttonInteraction.channel.name}`
			);

			// Save to database for tracking and log to channel
			await this.trackChannelDownload(buttonInteraction, productConfig, product, panelId);

		} catch (err) {
			this.heart.core.console.log(this.heart.core.console.type.error, 'Error handling channel button interaction:', err);
			
			if (!buttonInteraction.replied) {
				await buttonInteraction.reply({
					content: '❌ An error occurred while processing your download.',
					ephemeral: true
				});
			}
		}
	}

	/**
	 * Track channel download in database and log to channel
	 */
	async trackChannelDownload(buttonInteraction, productConfig, product, panelId) {
		const loggingConfig = productConfig.config.logging || {};

		// Save to database for tracking
		if (loggingConfig.track_downloads && loggingConfig.log_channel_downloads !== false) {
			try {
				const userDoc = await this.heart.core.database.userData.get(buttonInteraction.guild.id, buttonInteraction.user.id);
				const downloads = userDoc.downloads || [];
				downloads.push({
					product_id: product.id,
					product_name: product.name,
					panel_id: panelId,
					source: 'channel_panel',
					channel_id: buttonInteraction.channel.id,
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
		if (loggingConfig.log_to_channel && loggingConfig.log_channel_id && loggingConfig.log_channel_downloads !== false) {
			try {
				const logChannel = buttonInteraction.guild.channels.cache.get(loggingConfig.log_channel_id);
				if (logChannel) {
					const logEmbed = new EmbedBuilder()
						.setTitle('📥 Channel Panel Download')
						.addFields(
							{ name: 'User', value: `${buttonInteraction.user.tag} (${buttonInteraction.user.id})`, inline: true },
							{ name: 'Product', value: product.name, inline: true },
							{ name: 'Panel', value: panelId, inline: true },
							{ name: 'Channel', value: `${buttonInteraction.channel.name} (${buttonInteraction.channel.id})`, inline: true },
							{ name: 'Time', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
						)
						.setColor('#ff6600')
						.setTimestamp();

					await logChannel.send({ embeds: [logEmbed] });
				}
			} catch (logErr) {
				this.heart.core.console.log(this.heart.core.console.type.error, 'Error logging to channel:', logErr);
			}
		}
	}
};