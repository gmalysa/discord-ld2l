/**
 * Utility functions used throughout
 */

module.exports = {
	/**
	 * Escape characters that would enter or end a formatting mode or backslashes
	 */
	discordEscape : function(name) {
		return name.replace(/[*\`_]/g, '\\$&');
	},

	/**
	 * Merge a maybe list or a single value into a string
	 */
	joinMaybeList : function(list, join) {
		if (Array.isArray(list))
			return list.join(join);
		return list;
	}
};
