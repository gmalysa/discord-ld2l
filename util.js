/**
 * Utility functions used throughout
 */

module.exports = {
	/**
	 * Escape characters that would enter or end a formatting mode or backslashes
	 */
	discordEscape : function(name) {
		return name.replace(/[*\`_]/g, '\\$&');
	}
};
