/**
 * Utility functions used throughout
 */

const _ = require('underscore');
const dotaconstants = require('dotaconstants');
const fl = require('flux-link');
const logger = require('./logger.js');
const mysql = require('./mysql.js');
const strings = require('./lib/strings.js');

module.exports = {
	/**
	 * Eat # of arguments from the stack, for handling redis functions that
	 * produce values we don't care about while constructing stuff
	 */
	eat : function(n) {
		var eater = function(env, after) {
			after();
		};

		return fl.mkfn(eater, n);
	},

	/**
	 * Shared exception handler that is used for discord commands
	 */
	commandExceptionHandler : function(env, err) {
		env.message.reply(err.message);
		logger.var_dump(err);
		env.$catch();
	},

	/**
	 * Get a steam id for a discord id if this person has registered
	 */
	getSteamFromDiscord : new fl.Chain(
		function(env, after, discordid) {
			env.filters.accounts.select({discordid : discordid})
				.exec(after, env.$throw);
		},
		function(env, after, results) {
			if (results.length == 0) {
				env.$throw(new Error(strings.PLEASE_REGISTER));
				return;
			}

			after(results[0].steamid);
		}
	),

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
