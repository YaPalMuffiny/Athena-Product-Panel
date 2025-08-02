const { SlashCommandBuilder, PresenceUpdateStatus, roleMention, MessageFlags } = require('discord.js');
const moment = require('moment');
const command = require('../../../../main/discord/core/commands/command.js');

/* eslint-disable no-unused-vars, no-constant-condition */
if (null) {
	const heartType = require('../../../../types/heart.js');
	const commandType = require('../../../../types/discord/core/commands/commands.js');
	const { CommandInteraction } = require('discord.js');
}
/* eslint-enable no-unused-vars, no-constant-condition  */


/**
 * ProductPanel command class.
 * @class
 * @extends commandType
 */
module.exports = class productpanel extends command {
	/**
     * Creates an instance of the command.
     * @param {heartType} heart - The heart of the bot.
     * @param {Object} cmdConfig - The command configuration.
     */
	constructor(heart, cmdConfig) {
		const productConfig = heart.core.discord.core.config.manager.get('productpanel').get();

		super(heart, {
			name: 'productpanel',
			data: new SlashCommandBuilder()
				.setName(cmdConfig.commands.product?.name || 'product')
				.setDescription(cmdConfig.commands.info?.description || 'Allow admins to summon a product panel')
				.addChannelOption(option => option.setName('channel').setDescription('The channel to summon the panel into').setRequired(true)),
			contextMenu: false,
			global: true,
			category: 'general',
            bypass: true,
			permissionLevel: productConfig.config.permissions.product_command,
		});
	}

	/**
     * Executes the command.
     * @param {CommandInteraction} interaction - The interaction object.
     * @param {Object} langConfig - The language configuration.
     */
	async execute(interaction, langConfig) {
		try {
			const channeloption = interaction.options.getChannel('channel').id;
			const channel = channels.cache.get(channeloption);

			const placeholders = {
				name: productConfig.config.lang.name,
				price: productConfig.config.lang.price,
			};
			channel.send({ embeds: [this.heart.core.util.discord.resolveEmbed(langConfig.embeds.info, placeholders, interaction.guild, member.user)] });
		}
		catch (err) {
			this.heart.core.console.log(this.heart.core.console.type.error, `An issue occured while executing command ${this.getName()}`);
			new this.heart.core.error.interface(this.heart, err);
			interaction.reply({ embeds: [this.heart.core.util.discord.generateErrorEmbed(langConfig.lang.unexpected_command_error.replace(/%command%/g, `/${interaction.commandName}`))], flags: MessageFlags.Ephemeral });
		}
	}
};