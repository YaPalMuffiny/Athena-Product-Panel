const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require('discord.js');
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
 * Product Panel command class with integrated button handling.
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
				.setDescription(cmdConfig.commands.productpanel?.description || 'Display the product download panel'),
			contextMenu: false,
			global: true,
			category: 'products',
			bypass: true,
			permissionLevel: productConfig.config.permissions.panel_command,
		});
	}

	/**
     * Executes the command.
     * @param {CommandInteraction} interaction - The interaction object.
     * @param {Object} langConfig - The language configuration.
     */
	async execute(interaction, langConfig) {
		try {
			const productConfig = this.heart.core.discord.core.config.manager.get('products').get();
			
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

			// Create buttons for each product
			const buttons = [];
			const products = productConfig.config.products;

			for (let i = 0; i < products.length; i += 5) {
				const row = new ActionRowBuilder();
				const rowProducts = products.slice(i, i + 5);

				for (const product of rowProducts) {
					const button = new ButtonBuilder()
						.setCustomId(`product_${product.id}`)
						.setLabel(product.name)
						.setStyle(ButtonStyle.Primary);

					if (product.emoji) {
						button.setEmoji(product.emoji);
					}

					row.addComponents(button);
				}

				buttons.push(row);
			}

			const reply = await interaction.reply({
				embeds: [embed],
				components: buttons,
				ephemeral: false
			});

			// Set up button collector for this specific message
			const collector = reply.createMessageComponentCollector({
				time: 300000 // 5 minutes
			});

			collector.on('collect', async (buttonInteraction) => {
				if (!buttonInteraction.customId.startsWith('product_')) return;
				await this.handleButtonInteraction(buttonInteraction, productConfig);
			});

			collector.on('end', () => {
				// Optionally disable buttons after timeout
				// interaction.editReply({ components: [] });
			});

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
     * Handles button interactions for product downloads.
     * @param {ButtonInteraction} buttonInteraction - The button interaction object.
     * @param {Object} productConfig - The product configuration.
     */
	async handleButtonInteraction(buttonInteraction, productConfig) {
		try {
			const productId = buttonInteraction.customId.replace('product_', '');
			const product = productConfig.config.products.find(p => p.id === productId);

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
				`User ${buttonInteraction.user.tag} (${buttonInteraction.user.id}) downloaded product: ${product.name}`
			);

			// Optional: Save to database for tracking
			if (productConfig.config.logging.track_downloads) {
				const userDoc = await this.heart.core.database.userData.get(buttonInteraction.guild.id, buttonInteraction.user.id);
				const downloads = userDoc.downloads || [];
				downloads.push({
					product_id: product.id,
					product_name: product.name,
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