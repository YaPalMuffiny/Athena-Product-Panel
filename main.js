{
									id: "basic_scripts",
									name: "Basic Script Collection",
									description: "Useful automation scripts for everyday tasks",
									emoji: "📜",
									file_path: "basic_scripts.zip",
									download_name: "BasicScripts.zip",
									required_roles: ["123456789012345678"],
									enabled: true
								}
							]
						}
					},
					
					// Permission configuration
					permissions: {
						personal_panel: 'member',
						channel_setup: 'admin',
						role_hierarchy: {
							"999888777666555444": "vip",
							"987654321098765432": "premium",   
							"123456789012345678": "member",
							"111222333444555666": "trusted"
						}
					},
					
					// Logging and tracking settings
					logging: {
						track_downloads: true,
						log_to_channel: false,
						log_channel_id: "CHANNEL_ID",
						log_personal_downloads: true,
						log_channel_downloads: true,
						include_user_roles: false,
						include_file_size: false,
						console_log_level: 'log'
					},
					
					// Legacy support (for backwards compatibility)
					legacy: {
						enabled: false,
						panel: {
							title: "🛍️ Product Downloads",
							description: "🔧 Click the buttons below to download products. Downloads are sent privately to you.",
							embed_color: "#7289da",
							thumbnail_url: "https://example.com/legacy-logo.png",
							footer_text: "Product Downloads • Legacy Panel"
						},
						products: []
					},
					
					// Advanced settings
					advanced: {
						interaction_timeout: 600000,
						auto_cleanup_invalid: true,
						max_file_size: 104857600, // 100MB
						allowed_extensions: [".zip", ".rar", ".pdf", ".exe", ".msi"],
						error_messages: {
							no_permission: "❌ **Access Denied**\n\nYou don't have the required role to download this product.",
							file_not_found: "❌ **File Not Available**\n\nThis product file could not be found. Please contact an administrator.",
							panel_not_found: "❌ **Panel Not Found**\n\nThe requested panel doesn't exist or has been disabled.",
							no_products: "📦 **No Products Available**\n\nThis panel has no products configured or all products are disabled."
						}
					}
				}
			},
		);

		const loadProductConfig = await this.heart.core.discord.core.config.manager.load(productConfig);
		if (!loadProductConfig) {
			this.heart.core.console.log(this.heart.core.console.type.warning, `Failed to load config for ${this.getName()}, using defaults...`);
		} else {
			this.heart.core.console.log(this.heart.core.console.type.startup, `Config loaded successfully for ${this.getName()}`);
		}

		// Always continue loading - don't disable plugin
		this.heart.core.console.log(this.heart.core.console.type.startup, 'Product Panel plugin pre-load completed successfully');
	}const plugin = require('../../main/discord/core/plugins/plugin.js');
const productPanelHandler = require('./src/handler/productPanelHandler.js');

/* eslint-disable no-unused-vars, no-constant-condition */
if (null) {
	const heartType = require('../../types/heart.js');
	const pluginType = require('../../types/discord/core/plugins/plugin.js');
}
/* eslint-enable no-unused-vars, no-constant-condition */

/**
 * Product Panel plugin for managing downloadable content with Discord buttons and panels.
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
			author: 'Muffiny', 
			version: '2.5.2', 
			priority: 0, 
			dependencies: ['core'], 
			softDependencies: [], 
			nodeDependencies: [], 
			channels: [] 
		});
	}

	async preLoad() {
		this.heart.core.console.log(this.heart.core.console.type.startup, 'Product Panel plugin is pre-loading...');
		
		// Register database models first
		try {
			const productPanelModel = require('./src/models/productPanel.js');
			const productDownloadModel = require('./src/models/productDownload.js');
			
			this.heart.core.database.registerModel(new productPanelModel());
			this.heart.core.database.registerModel(new productDownloadModel());
			
			this.heart.core.console.log(this.heart.core.console.type.startup, 'Product Panel database models registered successfully');
		} catch (modelErr) {
			this.heart.core.console.log(this.heart.core.console.type.warning, 'Failed to register database models:', modelErr);
			// Don't disable plugin for model registration failures
		}
		
		// Initialize product configuration following AthenaBot template pattern
		const productConfig = new this.heart.core.discord.core.config.interface(
			this.heart,
			{ name: 'products', plugin: this.getName() },
			{
				config: {
					// Global panel settings
					global: {
						default_embed_color: '#0099ff',
						default_thumbnail: 'https://example.com/default-logo.png',
						enable_emojis: true,
						max_products_per_panel: 25,
						downloads_are_ephemeral: true
					},
					
					// Product panels (new multi-panel system)
					panels: {
						// Premium products panel
						"premium": {
							enabled: true,
							name: "Premium Products",
							title: "⭐ Premium Downloads",
							description: "🎯 Exclusive premium tools and content for VIP members. Click any button below for instant download.",
							emoji: "⭐",
							embed_color: "#ffd700",
							thumbnail_url: "https://example.com/premium-logo.png",
							footer_text: "Premium Access • VIP Members Only",
							
							products: [
								{
									id: "premium_tool_v2",
									name: "Premium Tool v2.1",
									description: "Advanced automation tool with premium features and priority support",
									emoji: "⚡",
									file_path: "premium_tool_v2.1.zip",
									download_name: "PremiumTool_v2.1.zip",
									required_roles: ["123456789012345678", "987654321098765432"],
									enabled: true
								}
							]
						},

						// Basic products panel
						"basic": {
							enabled: true,
							name: "Basic Tools",
							title: "📦 Essential Downloads",
							description: "🔧 Essential tools and resources for all members. Free downloads available to everyone with member access.",
							emoji: "📦",
							embed_color: "#00aaff",
							thumbnail_url: "https://example.com/basic-logo.png",
							footer_text: "Basic Downloads • Member Access",
							
							products: [
								{
									id: "basic_scripts",
									name: "Basic Script Collection",
									description: "Useful automation scripts for everyday tasks",
									emoji: "📜",
									file_path: "basic_scripts.zip",
									download_name: "BasicScripts.zip",
									required_roles: ["123456789012345678"],
									enabled: true
								}
							]
						}
					},
					
					// Permission configuration
					permissions: {
						personal_panel: 'member',
						channel_setup: 'admin',
						role_hierarchy: {
							"999888777666555444": "vip",
							"987654321098765432": "premium",   
							"123456789012345678": "member",
							"111222333444555666": "trusted"
						}
					},
					
					// Logging and tracking settings
					logging: {
						track_downloads: true,
						log_to_channel: false,
						log_channel_id: "CHANNEL_ID",
						log_personal_downloads: true,
						log_channel_downloads: true,
						include_user_roles: false,
						include_file_size: false,
						console_log_level: 'log'
					},
					
					// Legacy support (for backwards compatibility)
					legacy: {
						enabled: false,
						panel: {
							title: "🛍️ Product Downloads",
							description: "🔧 Click the buttons below to download products. Downloads are sent privately to you.",
							embed_color: "#7289da",
							thumbnail_url: "https://example.com/legacy-logo.png",
							footer_text: "Product Downloads • Legacy Panel"
						},
						products: []
					},
					
					// Advanced settings
					advanced: {
						interaction_timeout: 600000,
						auto_cleanup_invalid: true,
						max_file_size: 104857600, // 100MB
						allowed_extensions: [".zip", ".rar", ".pdf", ".exe", ".msi"],
						error_messages: {
							no_permission: "❌ **Access Denied**\n\nYou don't have the required role to download this product.",
							file_not_found: "❌ **File Not Available**\n\nThis product file could not be found. Please contact an administrator.",
							panel_not_found: "❌ **Panel Not Found**\n\nThe requested panel doesn't exist or has been disabled.",
							no_products: "📦 **No Products Available**\n\nThis panel has no products configured or all products are disabled."
						}
					}
				}
			},
		);

		const loadProductConfig = await this.heart.core.discord.core.config.manager.load(productConfig);
		if (!loadProductConfig) {
			this.heart.core.console.log(this.heart.core.console.type.error, `Failed to load config, but continuing plugin load for ${this.getName()}...`);
			// Don't disable plugin - let it load with defaults
		}

		// Validate configuration but don't disable plugin if validation fails
		const isValid = await this.validateConfiguration();
		if (!isValid) {
			this.heart.core.console.log(this.heart.core.console.type.warning, `Configuration validation failed for plugin ${this.getName()}, but plugin will continue loading...`);
			// Don't disable plugin - let commands handle missing config gracefully
		}

		this.heart.core.console.log(this.heart.core.console.type.startup, 'Product Panel plugin pre-load completed successfully');
	}

	async load() {
		this.heart.core.console.log(this.heart.core.console.type.startup, 'Product Panel plugin is loading...');
		
		// Register handler following AthenaBot template pattern
		this.heart.core.discord.core.handler.manager.register(new productPanelHandler(this.heart));
		
		// Log configuration status
		const stats = this.getConfigurationStats();
		this.heart.core.console.log(
			this.heart.core.console.type.startup, 
			`Product Panel plugin loaded successfully - ${stats.total_panels} panels, ${stats.total_products} products configured`
		);
	}

	/**
	 * Called when the Discord client is ready (post-load initialization)
	 * This follows the AthenaBot template pattern for client-ready initialization
	 */
	async postLoad() {
		this.heart.core.console.log(this.heart.core.console.type.startup, 'Product Panel plugin post-loading...');
		
		// Client should be available now - perform client-dependent initialization
		const client = this.heart.core.discord?.client;
		if (client) {
			this.heart.core.console.log(this.heart.core.console.type.startup, 'Discord client is now available for Product Panel plugin');
			
			// Load existing panel messages from database with delay to ensure models are ready
			setTimeout(async () => {
				try {
					const handler = this.heart.core.discord.core.handler.manager.get('productPanel');
					if (handler) {
						await handler.loadPanelMessagesFromDatabase();
						this.heart.core.console.log(this.heart.core.console.type.startup, 'Panel messages loaded from database successfully');
					}
				} catch (err) {
					this.heart.core.console.log(this.heart.core.console.type.error, 'Error loading panel messages from database:', err);
					new this.heart.core.error.interface(this.heart, err);
				}
			}, 3000); // 3 second delay to ensure database models are ready
		} else {
			this.heart.core.console.log(this.heart.core.console.type.warning, 'Discord client still not available in post-load phase');
		}
	}

	/**
	 * Validate the plugin configuration
	 * @returns {boolean} True if configuration is valid
	 */
	async validateConfiguration() {
		try {
			const productConfig = this.heart.core.discord.core.config.manager.get('products');
			if (!productConfig) {
				this.heart.core.console.log(this.heart.core.console.type.warning, 'Product configuration not found during validation');
				return false;
			}
			
			const config = productConfig.get();
			
			// Check if at least one panel type is configured
			const hasModernPanels = config.config.panels && Object.keys(config.config.panels).length > 0;
			const hasLegacyProducts = config.config.legacy?.enabled && config.config.legacy.products?.length > 0;
			
			if (!hasModernPanels && !hasLegacyProducts) {
				this.heart.core.console.log(this.heart.core.console.type.warning, 'No panels or products configured - plugin will load but commands may have limited functionality');
				return false;
			}

			// Validate panel configurations
			if (hasModernPanels) {
				for (const [panelId, panel] of Object.entries(config.config.panels)) {
					if (!panel.enabled) continue;
					
					if (!panel.products || panel.products.length === 0) {
						this.heart.core.console.log(this.heart.core.console.type.warning, `Panel "${panelId}" has no products configured`);
						continue;
					}

					// Validate required fields
					for (const product of panel.products.filter(p => p.enabled !== false)) {
						if (!product.id || !product.name || !product.file_path) {
							this.heart.core.console.log(this.heart.core.console.type.warning, `Product in panel "${panelId}" missing required fields (id, name, file_path)`);
						}

						if (!product.required_roles || product.required_roles.length === 0) {
							this.heart.core.console.log(this.heart.core.console.type.warning, `Product "${product.id}" has no required roles configured`);
						}
					}
				}
			}

			return true;
		} catch (err) {
			this.heart.core.console.log(this.heart.core.console.type.error, 'Error validating configuration:', err);
			new this.heart.core.error.interface(this.heart, err);
			return false;
		}
	}

	/**
	 * Get all configured products from all panels
	 * @returns {Array} Array of all products
	 */
	getAllConfiguredProducts() {
		try {
			const productConfig = this.heart.core.discord.core.config.manager.get('products');
			if (!productConfig) return [];
			
			const config = productConfig.get();
			const allProducts = [];

			// Modern panels
			if (config.config.panels) {
				for (const panel of Object.values(config.config.panels)) {
					if (panel.enabled && panel.products) {
						allProducts.push(...panel.products.filter(p => p.enabled !== false));
					}
				}
			}

			// Legacy products
			if (config.config.legacy?.enabled && config.config.legacy.products) {
				allProducts.push(...config.config.legacy.products.filter(p => p.enabled !== false));
			}

			return allProducts;
		} catch (err) {
			this.heart.core.console.log(this.heart.core.console.type.error, 'Error getting configured products:', err);
			new this.heart.core.error.interface(this.heart, err);
			return [];
		}
	}

	/**
	 * Get configuration statistics for monitoring.
	 * @returns {Object} Configuration statistics.
	 */
	getConfigurationStats() {
		try {
			const productConfig = this.heart.core.discord.core.config.manager.get('products');
			if (!productConfig) {
				return {
					total_panels: 0,
					enabled_panels: 0,
					total_products: 0,
					enabled_products: 0,
					legacy_enabled: false,
					logging_enabled: false,
					error: 'Config not loaded'
				};
			}
			
			const config = productConfig.get();
			
			const stats = {
				total_panels: 0,
				enabled_panels: 0,
				total_products: 0,
				enabled_products: 0,
				legacy_enabled: false,
				logging_enabled: config.config.logging?.track_downloads || false
			};

			// Modern panels
			if (config.config.panels) {
				stats.total_panels = Object.keys(config.config.panels).length;
				
				for (const panel of Object.values(config.config.panels)) {
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
			if (config.config.legacy?.enabled) {
				stats.legacy_enabled = true;
				stats.total_panels += 1;
				stats.enabled_panels += 1;
				
				if (config.config.legacy.products) {
					stats.total_products += config.config.legacy.products.length;
					stats.enabled_products += config.config.legacy.products.filter(p => p.enabled !== false).length;
				}
			}

			return stats;
		} catch (err) {
			this.heart.core.console.log(this.heart.core.console.type.error, 'Error getting configuration stats:', err);
			new this.heart.core.error.interface(this.heart, err);
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
				active_channel_panels: handler?.panelMessages?.size || 0,
				database_loaded: handler?.databaseLoaded || false
			};
		} catch (err) {
			this.heart.core.console.log(this.heart.core.console.type.error, 'Error getting panel stats:', err);
			new this.heart.core.error.interface(this.heart, err);
			return { ...configStats, error: 'Failed to get handler stats' };
		}
	}
};