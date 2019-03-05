/**
 * Utility functions used throughout
 */

const _ = require('underscore');
const dotaconstants = require('dotaconstants');
const fl = require('flux-link');
const mysql = require('./mysql.js');

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
	 * Build a chain that has access to the mysql database with guaranteed resource
	 * cleanup.
	 */
	addMySQL : function(fn) {
		return new fl.Chain(
			mysql.init_db,
			fn,
			mysql.cleanup_db
		).set_exception_handler(function(env, err) {
			logger.debug('Unhandled exception in mysql-enabled command');
			logger.var_dump(err);

			mysql.cleanup_db(env, function() {
				env.$catch();
			});
		});
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
	},

	/**
	 * Find a hero match by name
	 */
	dotaHeroSearch : new fl.Chain(
		function(env, after, testName) {
			var testLC = testName.toLowerCase();
			var testLCinternal = testLC.replace(' ', '_');

			var matches = _.filter(dotaconstants.heroes, function(hero) {
				if (hero.localized_name.toLowerCase().includes(testLC))
					return true;

				if (hero.name.includes(testLCinternal))
					return true;

				return false;
			});

			// @todo use string-similarity for a fallback match

			after(matches);
		}
	),
};
