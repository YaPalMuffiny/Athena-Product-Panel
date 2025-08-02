const handler = require('../../../../main/discord/core/handler/handler.js');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

/* eslint-disable no-unused-vars, no-constant-condition */
if (null) {
	const heartType = require('../../../../types/heart.js');
	const handlerType = require('../../../../types/discord/core/handler/handler.js');
}
/* eslint-enable no-unused-vars, no-constant-condition */

/**
 * Product panel handler with database support following AthenaBot template pattern.
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
		
		// Initialize cache following AthenaBot template pattern
		heart.core.discord.core.cache.manager.register(new heart.core.discord.core.cache.interface(heart, 'productCache'));
		
		// Store panel message IDs for tracking
		this.panelMessages = new Map(); // key: "channelId-panelId", value: messageId
		
		// Don't load from database immediately - wait for client to be ready
		this.databaseLoaded = false;
	}

	/**
	 * Get cache instance following AthenaBot template pattern
	 * @returns {Object} Cache interface
	 */
	getCache() {
		return this.heart.core.discord.core.cache.manager.get('productCache');
	}

	/**
	 * Load panel message tracking from MongoDB database using AthenaBot models
	 */
	async loadPanelMessagesFromDatabase() {
		if (this.databaseLoaded) return; // Already loaded
		
		try {
			const client = this.heart.core.discord?.client;
			if (!client) {
				this.heart.core.console.log(this.heart.core.console.type.warning, 'Discord client not ready, deferring panel message loading');
				return;
			}

			// Get ProductPanel model following AthenaBot template pattern
			const ProductPanelModel = this.heart.core.database.getModel('productPanel').getModel();
			
			// Get all panel messages for all guilds this bot is in
			const guildIds = client.guilds.cache.map(guild => guild.id);
			
			const panelMessages = await ProductPanelModel.find({
				guildId: { $in: guildIds },
				isActive: true
			}).exec();

			let loadedCount = 0;
			let removedCount = 0;

			for (const panelMessage of panelMessages) {
				try {
					// Verify the message still exists
					const guild = client.guilds.cache.get(panelMessage.guildId);
					if (!guild) {
						await ProductPanelModel.findByIdAndUpdate(panelMessage._id, { isActive: false });
						removedCount++;
						continue;
					}

					const channel = guild.channels.cache.get(panelMessage.channelId);
					if (!channel) {
						await ProductPanelModel.findByIdAndUpdate(panelMessage._id, { isActive: false });
						removedCount++;
						continue;
					}

					// Try to fetch the message to verify it exists
					try {
						await channel.messages.fetch(panelMessage.messageId);
						
						// Message exists, add to tracking
						const key = `${panelMessage.channelId}-${panelMessage.panelId}`;
						this.panelMessages.set(key, panelMessage.messageId);
						loadedCount++;

						// Set up collector for this existing message
						await this.setupExistingMessageCollector(channel, panelMessage.messageId, panelMessage.panelId);

					} catch (fetchErr) {
						// Message doesn't exist anymore, mark as inactive
						await ProductPanelModel.findByIdAndUpdate(panelMessage._id, { isActive: false });
						removedCount++;
					}

				} catch (err) {
					this.heart.core.console.log(this.heart.core.console.type.error, `Error processing panel message ${panelMessage._id}:`, err);
					new this.heart.core.error.interface(this.heart, err);
				}
			}

			this.heart.core.console.log(
				this.heart.core.console.type.log,
				`Loaded ${loadedCount} panel messages from database, removed ${removedCount} stale entries`
			);

			this.databaseLoaded = true;

		} catch (err) {
			this.heart.core.console.log(this.heart.core.console.type.error, 'Error loading panel messages from database:', err);
			new this.heart.core.error.interface(this.heart, err);
		}
	}

	/**
	 * Set up message collector for an existing panel message
	 */
	async setupExistingMessageCollector(channel, messageId, panelId) {
		try {
			const message = await channel.messages.fetch(messageId);
			
			const collector = message.createMessageComponentCollector({
				filter: (interaction) => interaction.customId.startsWith(`setup:product:`),
			});

			collector.on('collect', async (buttonInteraction) => {
				await this.handleChannelButtonInteraction(buttonInteraction, panelId);
			});

			collector.on('error', (err) => {
				this.heart.core.console.log(this.heart.core.console.type.error, `Collector error for panel ${panelId}:`, err);
				new this.heart.core.error.interface(this.heart, err);
			});

		} catch (err) {
			this.heart.core.console.log(this.heart.core.console.type.error, `Error setting up collector for existing message ${messageId}:`, err);
			new this.heart.core.error.interface(this.heart, err);
		}
	}

	/**
	 * Save panel message to MongoDB database using AthenaBot models
	 */
	async savePanelMessageToDatabase(guildId, channelId, messageId, panelId, panelType = 'modern', panelName = '', productCount = 0) {
		try {
			const ProductPanelModel = this.heart.core.database.getModel('productPanel').getModel();
			
			await ProductPanelModel.findOneAndUpdate(
				{ 
					guildId, 
					channelId, 
					panelId 
				},
				{
					guildId,
					channelId,
					messageId,
					panelId,
					panelType,
					panelName,
					productCount,
					lastUpdated: new Date(),
					isActive: true
				},
				{ 
					upsert: true, 
					new: true 
				}
			);

		} catch (err) {
			this.heart.core.console.log(this.heart.core.console.type.error, 'Error saving panel message to database:', err);
			new this.heart.core.error.interface(this.heart, err);
		}
	}

	/**
	 * Remove panel message from MongoDB database
	 */
	async removePanelMessageFromDatabase(guildId, channelId, panelId) {
		try {
			const ProductPanelModel = this.heart.core.database.getModel('productPanel').getModel();
			
			await ProductPanelModel.findOneAndUpdate(
				{ guildId, channelId, panelId },
				{ isActive: false, lastUpdated: new Date() }
			);

			this.panelMessages.delete(`${channelId}-${panelId}`);
		} catch (err) {
			this.heart.core.console.log(this.heart.core.console.type.error, 'Error removing panel message from database:', err);
			new this.heart.core.error.interface(this.heart, err);
		}
	}

	/**
	 * Clear all panel messages from MongoDB database
	 */
	async clearAllPanelMessagesFromDatabase() {
		try {
			const ProductPanelModel = this.heart.core.database.getModel('productPanel').getModel();
			const client = this.heart.core.discord?.client;
			
			if (!client) {
				throw new Error('Discord client not available');
			}

			// Get all guilds this bot is in
			const guildIds = client.guilds.cache.map(guild => guild.id);

			// Mark all panel messages as inactive for these guilds
			const result = await ProductPanelModel.updateMany(
				{ guildId: { $in: guildIds }, isActive: true },
				{ isActive: false, lastUpdated: new Date() }
			);

			this.panelMessages.clear();
			
			this.heart.core.console.log(
				this.heart.core.console.type.log,
				`Cleared ${result.modifiedCount} panel messages from database`
			);

		} catch (err) {
			this.heart.core.console.log(this.heart.core.console.type.error, 'Error clearing panel messages from database:', err);
			new this.heart.core.error.interface(this.heart, err);
		}
	}

	/**
	 * Track download in database using AthenaBot models
	 */
	async trackDownloadInDatabase(interaction, product, panelId, source, success = true, errorMessage = '') {
		try {
			const productConfig = this.heart.core.discord.core.config.manager.get('products').get();
			const loggingConfig = productConfig?.config?.logging || {};

			if (!loggingConfig.track_downloads) return;

			const ProductDownloadModel = this.heart.core.database.getModel('productDownload').getModel();
			
			// Get file size if enabled
			let fileSize = 0;
			if (loggingConfig.include_file_size && success) {
				try {
					const filePath = path.join(__dirname, '../../data/products/', product.file_path);
					const stats = fs.statSync(filePath);
					fileSize = stats.size;
				} catch (err) {
					// Ignore file size errors
				}
			}

			// Get user roles if enabled
			let userRoles = [];
			if (loggingConfig.include_user_roles && interaction.member) {
				userRoles = interaction.member.roles.cache.map(role => role.id);
			}

			const downloadRecord = new ProductDownloadModel({
				guildId: interaction.guild.id,
				userId: interaction.user.id,
				username: interaction.user.tag,
				productId: product.id,
				productName: product.name,
				panelId: panelId,
				panelType: panelId === 'legacy' ? 'legacy' : 'modern',
				source: source,
				channelId: source === 'channel_panel' ? interaction.channel.id : null,
				fileSize: fileSize,
				downloadTime: new Date(),
				userRoles: userRoles,
				success: success,
				errorMessage: errorMessage
			});

			await downloadRecord.save();

			// Also update user data following AthenaBot pattern
			if (success) {
				const userDoc = await this.heart.core.database.userData.get(interaction.guild.id, interaction.user.id);
				const downloads = userDoc.downloads || [];
				downloads.push({
					product_id: product.id,
					product_name: product.name,
					panel_id: panelId,
					source: source,
					channel_id: source === 'channel_panel' ? interaction.channel.id : null,
					timestamp: new Date(),
					guild_id: interaction.guild.id
				});
				
				await this.heart.core.database.userData.save(interaction.guild.id, interaction.user.id, { 
					downloads: downloads 
				});
			}

		} catch (err) {
			this.heart.core.console.log(this.heart.core.console.type.error, 'Error tracking download in database:', err);
			new this.heart.core.error.interface(this.heart, err);
		}
	}

	/**
	 * Sets up a specific panel in a given channel (used by setup command).
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
					await this.removePanelMessageFromDatabase(targetChannel.guild.id, targetChannel.id, panelId);
				}
			}

			await this.createPanelMessage(targetChannel, panelId, panel);
			
			this.heart.core.console.log(
				this.heart.core.console.type.log,
				`Panel ${panelId} setup in channel ${targetChannel.name} (${targetChannel.id})`
			);

		} catch (err) {
			this.heart.core.console.log(this.heart.core.console.type.error, `Error setting up panel ${panelId} in channel:`, err);
			new this.heart.core.error.interface(this.heart, err);
			throw err;
		}
	}

	/**
	 * Sets up the legacy panel in a given channel (used by setup command).
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
					await this.removePanelMessageFromDatabase(targetChannel.guild.id, targetChannel.id, 'legacy');
				}
			}

			await this.createLegacyPanelMessage(targetChannel, panel);
			
			this.heart.core.console.log(
				this.heart.core.console.type.log,
				`Legacy panel setup in channel ${targetChannel.name} (${targetChannel.id})`
			);

		} catch (err) {
			this.heart.core.console.log(this.heart.core.console.type.error, 'Error setting up legacy panel in channel:', err);
			new this.heart.core.error.interface(this.heart, err);
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
					new this.heart.core.error.interface(this.heart, err);
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
			new this.heart.core.error.interface(this.heart, err);
			throw err;
		}
	}

	/**
	 * Creates a panel message in the specified channel.
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

			// Store message ID for tracking in memory and database
			const messageKey = `${channel.id}-${panelId}`;
			this.panelMessages.set(messageKey, message.id);
			await this.savePanelMessageToDatabase(
				channel.guild.id, 
				channel.id, 
				message.id, 
				panelId, 
				'modern',
				panel.name || panelId,
				enabledProducts.length
			);

			// Set up persistent button collector
			const collector = message.createMessageComponentCollector({
				filter: (interaction) => interaction.customId.startsWith(`setup:product:`),
			});

			collector.on('collect', async (buttonInteraction) => {
				await this.handleChannelButtonInteraction(buttonInteraction, panelId);
			});

			collector.on('error', (err) => {
				this.heart.core.console.log(this.heart.core.console.type.error, `Collector error for panel ${panelId}:`, err);
				new this.heart.core.error.interface(this.heart, err);
			});

		} catch (err) {
			this.heart.core.console.log(this.heart.core.console.type.error, `Error creating panel message for ${panelId}:`, err);
			new this.heart.core.error.interface(this.heart, err);
			throw err;
		}
	}

	/**
	 * Creates a legacy panel message in the specified channel.
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

			// Store message ID for tracking in memory and database
			const messageKey = `${channel.id}-legacy`;
			this.panelMessages.set(messageKey, message.id);
			await this.savePanelMessageToDatabase(
				channel.guild.id, 
				channel.id, 
				message.id, 
				'legacy', 
				'legacy',
				'Legacy Panel',
				enabledProducts.length
			);

			// Set up persistent button collector
			const collector = message.createMessageComponentCollector({
				filter: (interaction) => interaction.customId.startsWith(`setup:product:`),
			});

			collector.on('collect', async (buttonInteraction) => {
				await this.handleChannelButtonInteraction(buttonInteraction, 'legacy');
			});

			collector.on('error', (err) => {
				this.heart.core.console.log(this.heart.core.console.type.error, 'Collector error for legacy panel:', err);
				new this.heart.core.error.interface(this.heart, err);
			});

		} catch (err) {
			this.heart.core.console.log(this.heart.core.console.type.error, 'Error creating legacy panel message:', err);
			new this.heart.core.error.interface(this.heart, err);
			throw err;
		}
	}

	/**
	 * Creates product buttons for channel panels.
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
					new this.heart.core.error.interface(this.heart, buttonErr);
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
				await this.trackDownloadInDatabase(buttonInteraction, { id: productId, name: 'Unknown Product' }, panelId, 'channel_panel', false, 'Product not found');
				return await buttonInteraction.reply({
					content: productConfig.config.advanced?.error_messages?.panel_not_found || '❌ Product not found.',
					ephemeral: true
				});
			}

			// Check if product is enabled
			if (product.enabled === false) {
				await this.trackDownloadInDatabase(buttonInteraction, product, panelId, 'channel_panel', false, 'Product disabled');
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

				await this.trackDownloadInDatabase(buttonInteraction, product, panelId, 'channel_panel', false, 'Insufficient permissions');
				return await buttonInteraction.reply({
					content: productConfig.config.advanced?.error_messages?.no_permission ||
						`❌ **Access Denied**\n\nYou need one of these roles to download this product:\n**${roleNames}**`,
					ephemeral: true
				});
			}

			// Check if file exists
			const filePath = path.join(__dirname, '../../data/products/', product.file_path);
			if (!fs.existsSync(filePath)) {
				await this.trackDownloadInDatabase(buttonInteraction, product, panelId, 'channel_panel', false, 'File not found');
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

			// Track successful download in database
			await this.trackDownloadInDatabase(buttonInteraction, product, panelId, 'channel_panel', true);

			// Log to channel if enabled
			await this.logDownloadToChannel(buttonInteraction, productConfig, product, panelId);

		} catch (err) {
			this.heart.core.console.log(this.heart.core.console.type.error, 'Error handling channel button interaction:', err);
			new this.heart.core.error.interface(this.heart, err);
			
			if (!buttonInteraction.replied) {
				await buttonInteraction.reply({
					content: '❌ An error occurred while processing your download.',
					ephemeral: true
				});
			}
		}
	}

	/**
	 * Log download to channel if enabled
	 */
	async logDownloadToChannel(buttonInteraction, productConfig, product, panelId) {
		try {
			const loggingConfig = productConfig.config.logging || {};

			if (loggingConfig.log_to_channel && loggingConfig.log_channel_id && loggingConfig.log_channel_downloads !== false) {
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
			}
		} catch (logErr) {
			this.heart.core.console.log(this.heart.core.console.type.error, 'Error logging to channel:', logErr);
			new this.heart.core.error.interface(this.heart, logErr);
		}
	}
};