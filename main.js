// main.js - Updated plugin with auto-setup and update functionality
const plugin = require('../../main/discord/core/plugins/plugin.js');
const productPanelHandler = require('./src/handler/productPanelHandler.js');

/**
 * Enhanced product panel plugin with auto-update functionality.
 * @class
 * @extends pluginType
 */
module.exports = class productPanel extends plugin {
	constructor(heart) {
		super(heart, { 
			name: 'productPanel', 
			author: 'Your Name', 
			version: '2.0.0', 
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

		// Get client from heart instead of direct reference
		const client = this.heart.core.discord?.client;
		if (!client) {
			this.heart.core.console.log(this.heart.core.console.type.error, 'Discord client not available');
			return;
		}
		if (!this.heart.core.discord?.core?.handler?.manager) {
			this.heart.core.console.log(this.heart.core.console.type.error, 'Handler manager not available');
			return;
		}

		// Wait for Discord client to be ready before setting up panels
		if (client.isReady()) {
			await this.initializeChannelPanels();
		} else {
			client.once('ready', async () => {
				await this.initializeChannelPanels();
			});
		}
	}

	/**
	 * Initialize channel panels on bot start/restart.
	 */
	async initializeChannelPanels() {
		try {
			const productConfig = this.heart.core.discord.core.config.manager.get('products').get();
			
			if (productConfig.config.channels?.auto_setup) {
				this.heart.core.console.log(this.heart.core.console.type.startup, 'Initializing auto-setup channel panels...');
				
				const handler = this.heart.core.discord.core.handler.manager.get('productPanel');
				await handler.autoSetupChannelPanels();
				
				this.heart.core.console.log(this.heart.core.console.type.startup, 'Channel panels initialized successfully');
				
				// Setup interval for periodic updates (if configured)
				if (productConfig.config.channels.update_interval && productConfig.config.channels.update_interval > 0) {
					this.heart.core.console.log(
						this.heart.core.console.type.startup, 
						`Setting up panel update interval: ${productConfig.config.channels.update_interval}ms`
					);
					
					setInterval(async () => {
						try {
							await handler.autoSetupChannelPanels();
						} catch (err) {
							this.heart.core.console.log(this.heart.core.console.type.error, 'Error in periodic panel update:', err);
						}
					}, productConfig.config.channels.update_interval);
				}
			}
		} catch (err) {
			this.heart.core.console.log(this.heart.core.console.type.error, 'Error initializing channel panels:', err);
		}
	}

	/**
	 * Manual method to refresh all panels (can be called externally).
	 */
	async refreshAllPanels() {
		try {
			const handler = this.heart.core.discord.core.handler.manager.get('productPanel');
			await handler.autoSetupChannelPanels();
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
				auto_setup_enabled: productConfig.config.channels?.auto_setup || false,
				update_interval: productConfig.config.channels?.update_interval || 0
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