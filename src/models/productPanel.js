const modelBuilder = require('../../../../main/core/database/modelBuilder.js');

/**
 * Product Panel MongoDB model for storing panel message tracking
 * @class
 * @extends modelBuilder
 */
module.exports = class productPanelModel extends modelBuilder {
	constructor() {
		// Import this model using "this.heart.core.database.getModel('productPanel').getModel()".
		super('productPanel', {
			guildId: { type: String, required: true },
			channelId: { type: String, required: true },
			messageId: { type: String, required: true },
			panelId: { type: String, required: true },
			panelType: { type: String, required: true, enum: ['modern', 'legacy'], default: 'modern' },
			panelName: { type: String, default: '' },
			productCount: { type: Number, default: 0 },
			createdAt: { type: Date, default: Date.now },
			lastUpdated: { type: Date, default: Date.now },
			isActive: { type: Boolean, default: true }
		});

		// Add compound index for efficient queries
		this.schema.index({ guildId: 1, channelId: 1, panelId: 1 }, { unique: true });
		this.schema.index({ messageId: 1 });
		this.schema.index({ guildId: 1, isActive: 1 });
	}
};