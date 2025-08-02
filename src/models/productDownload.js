const modelBuilder = require('../../../../main/core/database/modelBuilder.js');

/**
 * Product Download tracking model for analytics and logging
 * @class
 * @extends modelBuilder
 */
module.exports = class productDownloadModel extends modelBuilder {
	constructor() {
		// Import this model using "this.heart.core.database.getModel('productDownload').getModel()".
		super('productDownload', {
			guildId: { type: String, required: true },
			userId: { type: String, required: true },
			username: { type: String, required: true },
			productId: { type: String, required: true },
			productName: { type: String, required: true },
			panelId: { type: String, required: true },
			panelType: { type: String, enum: ['modern', 'legacy'], default: 'modern' },
			source: { type: String, enum: ['personal_panel', 'channel_panel'], required: true },
			channelId: { type: String }, // Only for channel panel downloads
			fileSize: { type: Number, default: 0 }, // File size in bytes
			downloadTime: { type: Date, default: Date.now },
			userRoles: [{ type: String }], // User's roles at time of download
			success: { type: Boolean, default: true },
			errorMessage: { type: String, default: '' }
		});

		// Add indexes for efficient queries
		this.schema.index({ guildId: 1, userId: 1, downloadTime: -1 });
		this.schema.index({ guildId: 1, productId: 1, downloadTime: -1 });
		this.schema.index({ guildId: 1, panelId: 1, downloadTime: -1 });
		this.schema.index({ downloadTime: -1 });
	}
};