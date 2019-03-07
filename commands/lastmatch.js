/**
 * Fetch a user's last match and print a summary to discord
 */

const _ = require('underscore');
const cached = require('../lib/cached.js');
const fl = require('flux-link');
const logger = require('../logger.js');
const util = require('../util.js');

/**
 * Get a user's most recently played match and display the score screen
 */
var lastmatch = new fl.Chain(
	new fl.Branch(
		function(env, after) {
			after(env.words.length > 1);
		},
		function(env, after) {
			//	@todo match a member and get their profile instead
			//var match = env.message.guild.members.
		},
		function(env, after) {
			after(env.message.author.id);
		}
	),
	util.getSteamFromDiscord,
	cached.getLastMatch,
	util.sendMatchDetails
).use_local_env(true).set_exception_handler(util.commandExceptionHandler);

lastmatch = util.addMySQL(lastmatch);

module.exports = function(commands) {
	commands['lastmatch'] = lastmatch;
	commands['lm'] = lastmatch;
};
