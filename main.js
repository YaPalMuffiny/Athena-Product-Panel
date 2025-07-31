const plugin = require('../../main/discord/core/plugins/plugin.js');
const productPanelHandler = require('./src/handler/productPanelHandler.js');

/* eslint-disable no-unused-vars, no-constant-condition */
if (null) {
	const heartType = require('../../types/heart.js');
	const pluginType = require('../../types/discord/core/plugins/plugin.js');
}
/* eslint-enable no-unused-vars, no-constant-condition  */

/**
 * A class representing the product panel plugin.
 * @class
 * @extends pluginType
 */
module.exports = class productPanel extends plugin {
	/**
     * Creates an instance of this plugin.
     * @param {heartType} heart - The heart of the bot.
     */
	constructor(heart) {
		super(heart, { 
			name: 'productPanel', 
			author: 'Your Name', 
			version: '1.0.0', 
			priority: 0, 
			dependencies: ['core'], 
			softDependencies: [], 
			nodeDependencies: [], 
			channels: [] 
		});
	}

	async preLoad() {
		this.heart.core.console.log(this.heart.core.console.type.startup, 'Product Panel plugin is pre-loading...');
		
		const productConfig = new this.heart.core.discord.core.config.interface(
			this.heart,
			{ name: 'products', plugin: this.getName() },
			{
				config: {
					panel: {
						description: undefined,
						embed_color: undefined,
						thumbnail_url: undefined,
						footer_text: undefined,
					},
					products: undefined,
					permissions: {
						panel_command: undefined,
					},
					logging: {
						track_downloads: undefined,
						log_to_channel: undefined,
						log_channel_id: undefined,
					}
				}
			},
		);

		const loadProductConfig = await this.heart.core.discord.core.config.manager.load(productConfig);
		if (!loadProductConfig) {
			this.setDisabled();
			this.heart.core.console.log(this.heart.core.console.type.error, `Disabling plugin ${this.getName()}...`);
			return;
		}
	}

	async load() {
		this.heart.core.console.log(this.heart.core.console.type.startup, 'Product Panel plugin is loading...');
		this.heart.core.discord.core.handler.manager.register(new productPanelHandler(this.heart));
	}
};