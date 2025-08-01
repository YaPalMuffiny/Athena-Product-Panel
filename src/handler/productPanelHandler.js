// src/handler/productPanelHandler.js - Manual-only handler
const handler = require('../../../../main/discord/core/handler/handler.js');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

/**
 * Product panel handler with manual-only functionality.
 * @class
 * @extends handlerType
 */
module.exports = class productPanelHandler extends handler {
	constructor(heart) {
		super(heart, 'productPanel');
		heart.core.discord.core.cache.manager.register(new heart.core.discord.core.cache.interface(heart, 'productCache'));
		
		// Store panel message IDs for tracking
		this.panelMessages = new Map(); // key: "channelId-panelId", value: messageId
	}

	getCache() {
		return this.heart.core.discord.core.cache.manager.get('productCache');
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
			if (!targetChannel.permissionsFor(targetChannel.guild.members.me).has(['SendMessages', 'EmbedLinks'])) {
				throw new Error(`Missing permissions in channel ${targetChannel.name}`);
			}

			await this.createPanelMessage(targetChannel, panelId, panel);
			
			this.heart.core.console.log(
				this.heart.core.console.type.log,
				`Panel ${panelId} manually setup in channel ${targetChannel.name} (${targetChannel.id})`
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
			const panel = productConfig.config.panel || {};
			
			// Check permissions
			if (!targetChannel.permissionsFor(targetChannel.guild.members.me).has(['SendMessages', 'EmbedLinks'])) {
				throw new Error(`Missing permissions in channel ${targetChannel.name}`);
			}

			await this.createLegacyPanelMessage(targetChannel, panel);
			
			this.heart.core.console.log(
				this.heart.core.console.type.log,
				`Legacy panel manually setup in channel ${targetChannel.name} (${targetChannel.id})`
			);

		} catch (err) {
			this.heart.core.console.log(this.heart.core.console.type.error, 'Error setting up legacy panel in channel:', err);
			throw err;
		}
	}

	/**
	 * Refresh all existing panel messages (used by /refresh command).
	 */
	async refreshAllPanelMessages() {
		try {
			const productConfig = this.heart.core.discord.core.config.manager.get('products').get();
			let refreshCount = 0;
			let errorCount = 0;

			this.heart.core.console.log(this.heart.core.console.type.log, `Starting refresh of ${this.panelMessages.size} panel messages...`);

			// Refresh all tracked panel messages
			for (const [messageKey, messageId] of this.panelMessages.entries()) {
				try {
					const [channelId, panelId] = messageKey.split('-');
					
					// Get the channel
					const channel = this.heart.core.discord.client.channels.cache.get(channelId);
					if (!channel) {
						this.heart.core.console.log(this.heart.core.console.type.warning, `Channel ${channelId} not found, removing from tracking`);
						this.panelMessages.delete(messageKey);
						continue;
					}

					// Try to fetch the message
					let message;
					try {
						message = await channel.messages.fetch(messageId);
					} catch (fetchErr) {
						this.heart.core.console.log(this.heart.core.console.type.warning, `Message ${messageId} not found in ${channel.name}, removing from tracking`);
						this.panelMessages.delete(messageKey);
						continue;
					}

					// Update the message based on panel type
					if (panelId === 'legacy') {
						await this.updateLegacyPanelMessage(channel, productConfig.config.panel, messageId);
					} else {
						const panel = productConfig.config.panels[panelId];
						if (panel) {
							await this.updatePanelMessage(channel, panelId, panel, messageId);
						} else {
							this.heart.core.console.log(this.heart.core.console.type.warning, `Panel ${panelId} no longer exists in config, removing message tracking`);
							this.panelMessages.delete(messageKey);
							continue;
						}
					}

					refreshCount++;
				} catch (err) {
					this.heart.core.console.log(this.heart.core.console.type.error, `Error refreshing message ${messageKey}:`, err);
					errorCount++;
				}
			}

			this.heart.core.console.log(
				this.heart.core.console.type.log, 
				`Panel refresh complete: ${refreshCount} updated, ${errorCount} errors`
			);

			return { refreshCount, errorCount, totalTracked: this.panelMessages.size };

		} catch (err) {
			this.heart.core.console.log(this.heart.core.console.type.error, 'Error in refresh all panel messages:', err);
			throw err;
		}
	}

	/**
	 * Clear all existing panel messages (used by /clear command).
	 */
	async clearAllPanelMessages() {
		try {
			// Ensure data is loaded from database first
			await this.loadPanelMessagesFromDatabase();
			
			let removedCount = 0;
			let errorCount = 0;
			const channelsAffected = new Set();

			this.heart.core.console.log(this.heart.core.console.type.log, `Starting clear of ${this.panelMessages.size} panel messages...`);

			// Clear all tracked panel messages
			for (const [messageKey, messageId] of this.panelMessages.entries()) {
				try {
					const [channelId, panelId] = messageKey.split('-');
					
					// Get the channel
					const channel = this.heart.core.discord.client.channels.cache.get(channelId);
					if (!channel) {
						this.heart.core.console.log(this.heart.core.console.type.warning, `Channel ${channelId} not found, removing from tracking`);
						this.panelMessages.delete(messageKey);
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

					// Remove from tracking regardless of success
					this.panelMessages.delete(messageKey);
					
					// Remove from database
					await this.removePanelMessageFromDatabase(channelId, panelId);

				} catch (err) {
					this.heart.core.console.log(this.heart.core.console.type.error, `Error clearing message ${messageKey}:`, err);
					errorCount++;
					// Still remove from tracking even if there was an error
					this.panelMessages.delete(messageKey);
					
					// Remove from database
					await this.removePanelMessageFromDatabase(channelId, panelId);
				}
			}

			// Clear all from database as well
			await this.clearAllPanelMessagesFromDatabase();

			this.heart.core.console.log(
				this.heart.core.console.type.log, 
				`Panel clear complete: ${removedCount} removed, ${errorCount} errors, ${channelsAffected.size} channels affected`
			);

			return { 
				removedCount, 
				errorCount, 
				channelsAffected: channelsAffected.size,
				totalTracked: this.panelMessages.size 
			};

		} catch (err) {
			this.heart.core.console.log(this.heart.core.console.type.error, 'Error in clear all panel messages:', err);
			throw err;
		}
	}

	/**
	 * Updates an existing panel message.
	 * @param {Object} channel - The Discord channel object.
	 * @param {string} panelId - The panel ID.
	 * @param {Object} panel - The panel configuration.
	 * @param {string} messageId - The existing message ID.
	 */
	async updatePanelMessage(channel, panelId, panel, messageId) {
		try {
			const message = await channel.messages.fetch(messageId);
			
			// Create updated embed
			const embed = new EmbedBuilder()
				.setTitle(panel.title || '🛍️ Product Download Panel')
				.setDescription(panel.description || 'Click the buttons below to download products. Downloads will be sent privately to you.')
				.setColor(panel.embed_color || '#0099ff')
				.setFooter({ text: `${panel.footer_text || 'Product Downloads'} • Anyone can use this panel, downloads are private. • Updated` })
				.setTimestamp();

			if (panel.thumbnail_url) {
				embed.setThumbnail(panel.thumbnail_url);
			}

			// Create updated buttons
			const buttons = this.createChannelProductButtons(panel.products || [], panelId);

			await message.edit({
				embeds: [embed],
				components: buttons
			});

			this.heart.core.console.log(
				this.heart.core.console.type.log,
				`Updated panel ${panelId} in channel ${channel.name} (${channel.id})`
			);

		} catch (err) {
			this.heart.core.console.log(this.heart.core.console.type.error, `Error updating panel message for ${panelId}:`, err);
			throw err;
		}
	}

	/**
	 * Updates an existing legacy panel message.
	 * @param {Object} channel - The Discord channel object.
	 * @param {Object} panel - The panel configuration.
	 * @param {string} messageId - The existing message ID.
	 */
	async updateLegacyPanelMessage(channel, panel, messageId) {
		try {
			const productConfig = this.heart.core.discord.core.config.manager.get('products').get();
			const message = await channel.messages.fetch(messageId);
			
			// Create updated embed
			const embed = new EmbedBuilder()
				.setTitle('🛍️ Product Download Panel')
				.setDescription(panel.description || 'Click the buttons below to download products. Downloads will be sent privately to you.')
				.setColor(panel.embed_color || '#0099ff')
				.setFooter({ text: `${panel.footer_text || 'Product Downloads'} • Anyone can use this panel, downloads are private. • Updated` })
				.setTimestamp();

			if (panel.thumbnail_url) {
				embed.setThumbnail(panel.thumbnail_url);
			}

			// Create updated buttons
			const buttons = this.createChannelProductButtons(productConfig.config.products || [], 'legacy');

			await message.edit({
				embeds: [embed],
				components: buttons
			});

			this.heart.core.console.log(
				this.heart.core.console.type.log,
				`Updated legacy panel in channel ${channel.name} (${channel.id})`
			);

		} catch (err) {
			this.heart.core.console.log(this.heart.core.console.type.error, 'Error updating legacy panel message:', err);
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
				await this.handleChannelButtonInteraction(buttonInteraction, panelId);
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
				await this.handleChannelButtonInteraction(buttonInteraction, 'legacy');
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
	 * @param {string} panelId - The panel ID where the button was clicked.
	 */
	async handleChannelButtonInteraction(buttonInteraction, panelId) {
		try {
			const productConfig = this.heart.core.discord.core.config.manager.get('products').get();
			const customIdParts = buttonInteraction.customId.split(':');
			const productInfo = customIdParts[customIdParts.length - 2]; // Get product_id part
			const productId = productInfo.replace('channel_product_', '');
			
			let product;

			// Find product in the correct panel or legacy products
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
				ephemeral: true // Keep downloads ephemeral for privacy
			});

			// Log download activity
			this.heart.core.console.log(
				this.heart.core.console.type.log, 
				`User ${buttonInteraction.user.tag} (${buttonInteraction.user.id}) downloaded product: ${product.name} from channel panel: ${panelId}`
			);

			// Optional: Save to database for tracking
			if (productConfig.config.logging?.track_downloads) {
				try {
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
				} catch (dbErr) {
					this.heart.core.console.log(this.heart.core.console.type.error, 'Error saving download to database:', dbErr);
				}
			}

			// Log to channel if enabled
			if (productConfig.config.logging?.log_to_channel && productConfig.config.logging.log_channel_id) {
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


};
