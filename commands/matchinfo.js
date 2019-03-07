/**
 * Provide the ability to fetch info about a specific match, parse, and display it
 */

const _ = require('underscore');
const cached = require('../lib/cached.js');
const fl = require('flux-link');
const logger = require('../logger.js');
const util = require('../util.js');

/**
 * Command interface for match information
 */
var matchinfo = new fl.Chain(
	function(env, after) {
		var hasId = /^[0-9]+$/.test(env.words[1]);

		if (hasId)
			after(env.words[1]);
		else
			env.$throw(new Error('Invalid match ID: '+env.words[1]));
	},
	cached.getMatchDetails,
	util.sendMatchDetails
).use_local_env(true);

module.exports = function(commands) {
	commands['mi'] = matchinfo;
	commands['matchinfo'] = matchinfo;
}
