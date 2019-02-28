/**
 * Utility functions used throughout
 */

const _ = require('underscore');
const fl = require('flux-link');

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
	},

	/**
	 * Chain factory to build some search functions that have similar structure
	 */
	dotaMatchBuilder : function(list) {
		return new fl.Chain(
			function(env, after, testName) {
				// Look for cheap matches first
				var matches = _.filter(list, function(entry) {
					// Handle malformed abilities
					if (undefined === entry.dname)
						return false;

					var lc = entry.dname.toLowerCase();
					if (lc.includes(testName.toLowerCase()))
						return true;

					return false;
				});

				// Search for a more expensive match if we didn't find anything
				if (matches.length == 0) {
					// @todo use string-similarity
				}

				after(matches);
			}
		);
	}
};
