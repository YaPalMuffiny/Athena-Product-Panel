// main.js - Updated plugin with manual-only functionality
const plugin = require('../../main/discord/core/plugins/plugin.js');
const productPanelHandler = require('./src/handler/productPanelHandler.js');

/**
 * Product panel plugin with manual-only functionality.
 * @class
 * @extends pluginType
 */
module.exports = class productPanel extends plugin {
	constructor(heart) {
		super(heart, { 
			name: 'productPanel', 
			author: 'Your Name', 
			version: '2.1.0', 
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
					},
					products: undefined,
					permissions: {
						panel_command: undefined,
						channel_setup: undefined,
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

		// Get client from heart
		const client = this.heart.core.discord?.client;
		if (!client) {
			this.heart.core.console.log(this.heart.core.console.type.error, 'Discord client not available');
			return;
		}
		if (!this.heart.core.discord?.core?.handler?.manager) {
			this.heart.core.console.log(this.heart.core.console.type.error, 'Handler manager not available');
			return;
		}

		this.heart.core.console.log(this.heart.core.console.type.startup, 'Product Panel plugin loaded successfully (Manual mode only)');
	}

	/**
	 * Manual method to refresh all panels (called by /refresh command).
	 */
	async refreshAllPanels() {
		try {
			const handler = this.heart.core.discord.core.handler.manager.get('productPanel');
			await handler.refreshAllPanelMessages();
			this.heart.core.console.log(this.heart.core.console.type.log, 'All panels refreshed manually');
		} catch (err) {
			this.heart.core.console.log(this.heart.core.console.type.error, 'Error refreshing panels manually:', err);
		}
	}

	/**
	 * Get panel statistics for monitoring.
	 * @returns {Object} Panel statistics.
	 */
	getPanelStats() {
		try {
			const handler = this.heart.core.discord.core.handler.manager.get('productPanel');
			const productConfig = this.heart.core.discord.core.config.manager.get('products').get();
			
			const stats = {
				total_panels: 0,
				active_messages: handler.panelMessages.size,
				multi_panels: 0,
				legacy_panels: 0,
				mode: 'manual_only'
			};

			if (productConfig.config.panels) {
				stats.multi_panels = Object.keys(productConfig.config.panels).length;
				stats.total_panels += stats.multi_panels;
			}

			if (productConfig.config.products?.length > 0) {
				stats.legacy_panels = 1;
				stats.total_panels += stats.legacy_panels;
			}

			return stats;
		} catch (err) {
			this.heart.core.console.log(this.heart.core.console.type.error, 'Error getting panel stats:', err);
			return { error: 'Failed to get stats' };
		}
	}
};
