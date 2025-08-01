// main.js - Updated plugin with optimized configuration support
const plugin = require('../../main/discord/core/plugins/plugin.js');
const productPanelHandler = require('./src/handler/productPanelHandler.js');

/**
 * Product panel plugin with optimized configuration and functionality.
 * @class
 * @extends pluginType
 */
module.exports = class productPanel extends plugin {
	constructor(heart) {
		super(heart, { 
			name: 'productPanel', 
			author: 'Muffiny', 
			version: '2.5.0', 
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
					// Global settings
					global: {
						default_embed_color: undefined,
						default_thumbnail: undefined,
						enable_emojis: undefined,
						max_products_per_panel: undefined,
						downloads_are_ephemeral: undefined
					},
					
					// Multi-panel configuration
					panels: undefined,
					
					// Permission settings
					permissions: {
						personal_panel: undefined,
						channel_setup: undefined,
						role_hierarchy: undefined
					},
					
					// Logging settings
					logging: {
						track_downloads: undefined,
						log_to_channel: undefined,
						log_channel_id: undefined,
						log_personal_downloads: undefined,
						log_channel_downloads: undefined,
						include_user_roles: undefined,
						include_file_size: undefined,
						console_log_level: undefined
					},
					
					// Legacy support
					legacy: {
						enabled: undefined,
						panel: {
							title: undefined,
							description: undefined,
							embed_color: undefined,
							thumbnail_url: undefined,
							footer_text: undefined
						},
						products: undefined
					},
					
					// Advanced settings
					advanced: {
						interaction_timeout: undefined,
						auto_cleanup_invalid: undefined,
						max_file_size: undefined,
						allowed_extensions: undefined,
						error_messages: {
							no_permission: undefined,
							file_not_found: undefined,
							panel_not_found: undefined,
							no_products: undefined
						}
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

		// Validate configuration
		const isValid = await this.validateConfiguration();
		if (!isValid) {
			this.setDisabled();
			this.heart.core.console.log(this.heart.core.console.type.error, `Invalid configuration, disabling plugin ${this.getName()}...`);
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

		// Log configuration status
		const stats = this.getConfigurationStats();
		this.heart.core.console.log(
			this.heart.core.console.type.startup, 
			`Product Panel plugin loaded successfully - ${stats.total_panels} panels, ${stats.total_products} products configured`
		);
	}

	/**
	 * Validate the plugin configuration
	 * @returns {boolean} True if configuration is valid
	 */
	async validateConfiguration() {
		try {
			const productConfig = this.heart.core.discord.core.config.manager.get('products').get();
			
			// Check if at least one panel type is configured
			const hasModernPanels = productConfig.config.panels && Object.keys(productConfig.config.panels).length > 0;
			const hasLegacyProducts = productConfig.config.legacy?.enabled && productConfig.config.legacy.products?.length > 0;
			
			if (!hasModernPanels && !hasLegacyProducts) {
				this.heart.core.console.log(this.heart.core.console.type.error, 'No panels or products configured');
				return false;
			}

			// Validate panel configurations
			if (hasModernPanels) {
				for (const [panelId, panel] of Object.entries(productConfig.config.panels)) {
					if (!panel.enabled) continue;
					
					if (!panel.products || panel.products.length === 0) {
						this.heart.core.console.log(this.heart.core.console.type.warning, `Panel "${panelId}" has no products configured`);
						continue;
					}

					// Check product limits
					const enabledProducts = panel.products.filter(p => p.enabled !== false);
					if (enabledProducts.length > productConfig.config.global.max_products_per_panel) {
						this.heart.core.console.log(
							this.heart.core.console.type.warning, 
							`Panel "${panelId}" has ${enabledProducts.length} products, exceeding limit of ${productConfig.config.global.max_products_per_panel}`
						);
					}

					// Validate required fields
					for (const product of enabledProducts) {
						if (!product.id || !product.name || !product.file_path) {
							this.heart.core.console.log(this.heart.core.console.type.error, `Product in panel "${panelId}" missing required fields (id, name, file_path)`);
							return false;
						}

						if (!product.required_roles || product.required_roles.length === 0) {
							this.heart.core.console.log(this.heart.core.console.type.warning, `Product "${product.id}" has no required roles configured`);
						}
					}
				}
			}

			// Validate file extensions if restricted
			const allowedExtensions = productConfig.config.advanced.allowed_extensions;
			if (allowedExtensions && allowedExtensions.length > 0) {
				// Validate all configured products have allowed extensions
				const allProducts = this.getAllConfiguredProducts();
				for (const product of allProducts) {
					const fileExt = '.' + product.file_path.split('.').pop().toLowerCase();
					if (!allowedExtensions.includes(fileExt)) {
						this.heart.core.console.log(
							this.heart.core.console.type.warning, 
							`Product "${product.id}" has disallowed file extension: ${fileExt}`
						);
					}
				}
			}

			return true;
		} catch (err) {
			this.heart.core.console.log(this.heart.core.console.type.error, 'Error validating configuration:', err);
			return false;
		}
	}

	/**
	 * Get all configured products from all panels
	 * @returns {Array} Array of all products
	 */
	getAllConfiguredProducts() {
		const productConfig = this.heart.core.discord.core.config.manager.get('products').get();
		const allProducts = [];

		// Modern panels
		if (productConfig.config.panels) {
			for (const panel of Object.values(productConfig.config.panels)) {
				if (panel.enabled && panel.products) {
					allProducts.push(...panel.products.filter(p => p.enabled !== false));
				}
			}
		}

		// Legacy products
		if (productConfig.config.legacy?.enabled && productConfig.config.legacy.products) {
			allProducts.push(...productConfig.config.legacy.products.filter(p => p.enabled !== false));
		}

		return allProducts;
	}

	/**
	 * Get configuration statistics for monitoring.
	 * @returns {Object} Configuration statistics.
	 */
	getConfigurationStats() {
		try {
			const productConfig = this.heart.core.discord.core.config.manager.get('products').get();
			
			const stats = {
				total_panels: 0,
				enabled_panels: 0,
				total_products: 0,
				enabled_products: 0,
				legacy_enabled: false,
				logging_enabled: productConfig.config.logging?.track_downloads || false
			};

			// Modern panels
			if (productConfig.config.panels) {
				stats.total_panels = Object.keys(productConfig.config.panels).length;
				
				for (const panel of Object.values(productConfig.config.panels)) {
					if (panel.enabled) {
						stats.enabled_panels++;
					}
					
					if (panel.products) {
						stats.total_products += panel.products.length;
						stats.enabled_products += panel.products.filter(p => p.enabled !== false).length;
					}
				}
			}

			// Legacy products
			if (productConfig.config.legacy?.enabled) {
				stats.legacy_enabled = true;
				stats.total_panels += 1;
				stats.enabled_panels += 1;
				
				if (productConfig.config.legacy.products) {
					stats.total_products += productConfig.config.legacy.products.length;
					stats.enabled_products += productConfig.config.legacy.products.filter(p => p.enabled !== false).length;
				}
			}

			return stats;
		} catch (err) {
			this.heart.core.console.log(this.heart.core.console.type.error, 'Error getting configuration stats:', err);
			return { error: 'Failed to get stats' };
		}
	}

	/**
	 * Get panel statistics including handler data.
	 * @returns {Object} Complete panel statistics.
	 */
	getPanelStats() {
		const configStats = this.getConfigurationStats();
		
		try {
			const handler = this.heart.core.discord.core.handler.manager.get('productPanel');
			
			return {
				...configStats,
				active_channel_panels: handler.panelMessages?.size || 0
			};
		} catch (err) {
			this.heart.core.console.log(this.heart.core.console.type.error, 'Error getting panel stats:', err);
			return { ...configStats, error: 'Failed to get handler stats' };
		}
	}
};