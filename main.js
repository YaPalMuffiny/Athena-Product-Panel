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
					panels: undefined,
					panel: {
						description: undefined,
						embed_color: undefined,
						thumbnail_url: undefined,
						footer_text: undefined,
						channel_id: undefined,
					},
					products: undefined,
					permissions: {
						panel_command: undefined,
						channel_setup: undefined,
					},
					channels: {
						auto_setup: undefined,
						update_interval: undefined,
						delete_old_messages: undefined,
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
		const handler = new productPanelHandler(this.heart);
		this.heart.core.discord.core.handler.manager.register(handler);

		// Setup automatic channel panels if enabled
		const productConfig = this.heart.core.discord.core.config.manager.get('products').get();
		if (productConfig.config.channels?.auto_setup) {
			this.setupChannelPanels();
			
			// Setup interval for updating panels
			if (productConfig.config.channels.update_interval) {
				setInterval(() => {
					this.setupChannelPanels();
				}, productConfig.config.channels.update_interval);
			}
		}
	}

	/**
	 * Sets up product panels in designated channels.
	 */
	async setupChannelPanels() {
		try {
			const productConfig = this.heart.core.discord.core.config.manager.get('products').get();
			const handler = this.heart.core.discord.core.handler.manager.get('productPanel');

			// Setup panels for multi-panel configuration
			if (productConfig.config.panels) {
				for (const [panelId, panel] of Object.entries(productConfig.config.panels)) {
					if (panel.channel_id) {
						await handler.setupPanelInChannel(panelId, panel);
					}
				}
			}

			// Setup legacy panel if configured
			if (productConfig.config.panel?.channel_id) {
				await handler.setupLegacyPanelInChannel();
			}

		} catch (err) {
			this.heart.core.console.log(this.heart.core.console.type.error, 'Error setting up channel panels:', err);
		}
	}
};