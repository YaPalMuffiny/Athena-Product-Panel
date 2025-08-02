const plugin = require('../../main/discord/core/plugins/plugin.js');

/* eslint-disable no-unused-vars, no-constant-condition */
if (null) {
	const heartType = require('../../types/heart.js');
	const pluginType = require('../../types/discord/core/plugins/plugin.js');
}
/* eslint-enable no-unused-vars, no-constant-condition  */

/**
 * A class representing the test plugin.
 * @class
 * @extends pluginType
 */
module.exports = class test extends plugin {
	/**
     * Creates an instance of this plugin.
     * @param {heartType} heart - The heart of the bot.
     */
	constructor(heart) {
		super(heart, { name: 'productPanel', author: 'YaPalMuffiny', version: '3.0.0', priority: 0, dependencies: ['core'], softDependencies: [], nodeDependencies: [], channels: [] });
	}

	async preLoad() {
		this.heart.core.console.log(this.heart.core.console.type.startup, 'The plugin is pre-loading now...');
		const productConfig = new this.heart.core.discord.core.config.interface(
			this.heart,
			{ name: 'productpanel', plugin: this.getName() },
			{
                config: {
                    panels: undefined,
                    lang: undefined,
                    productlogs: undefined,
                    permissions: {
                            product_command: undefined,
                            ticket_inactivity_event: undefined,
                    }
                }
}
		);
		const loadproductConfig = await this.heart.core.discord.core.config.manager.load(productConfig);
		if (!loadproductConfig) {
			this.setDisabled();
			this.heart.core.console.log(this.heart.core.console.type.error, `Unable to fetch product config! Disabling plugin ${this.getName()}...`);
			return;
		}
	}

	async load() {
		this.heart.core.console.log(this.heart.core.console.type.startup, `${this.getName()} plugin is loading now...`);
	}
};