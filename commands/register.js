/**
 * Register with the bot
 */

const _ = require('underscore');
const cached = require('../lib/cached.js');
const Discord = require('discord.js');
const dotaconstants = require('dotaconstants');
const fl = require('flux-link');
const logger = require('../logger.js');
const mysql = require('../mysql.js');
const sprintf = require('sprintf-js').sprintf;
const steamAPI = require('../lib/steam.js');
const util = require('../util.js');

/**
 * Respond to invalid command arguments
 */
function usage(env, err) {
	env.message.reply(err.message);
	logger.var_dump(err);
	env.$catch();
}

/**
 * Accept a steam id32, id64, or steam community url
 */
var register = new fl.Chain(
	function(env, after) {
		if (env.words.length != 2) {
			env.$throw(new Error('Usage `--register (steam id or steam community link)`'));
			return;
		}

		after(env.words.slice(1).join(' '));
	},
	steamAPI.resolveAccountId,
	function(env, after, accountId) {
		env.newId = accountId;
		env.filters.accounts.select({
			discordid : env.message.author.id
		}).exec(after, env.$throw);
	},
	function(env, after, existingRecords) {
		// Insert or update existing registration
		if (existingRecords.length > 0) {
			env.filters.accounts.update({
				steamid : env.newId,
				discordid : env.message.author.id,
				mention : env.message.author.toString()
			}, {
				discordid : env.message.author.id
			}).exec(after, env.$throw);
		}
		else {
			env.filters.accounts.insert({
				steamid : env.newId,
				discordid : env.message.author.id,
				mention : env.message.author.toString()
			}).exec(after, env.$throw);
		}
	},
	function(env, after) {
		env.message.reply('you are now associated with steam id '+env.newId);
		after();
	}
).use_local_env(true).set_exception_handler(usage);

register = util.addMySQL(register);

module.exports = function(commands) {
	commands['register'] = register;
};
