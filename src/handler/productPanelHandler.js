const handler = require('../../../../main/discord/core/handler/handler.js');

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
					const { EmbedBuilder } = require('discord.js');
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