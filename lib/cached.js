/**
 * Functions for accessing redis-cached data elsewhere in the application. Stuff will
 * probably be implemented first in a command and then moved here once it needs to be
 * reused somewhere else. This sits above all of the data sources (steam api, dota 2
 * gc, and any opendota api calls we choose to make) and provides a uniform access
 * scheme for fetching data that is temporarily cached in redis to reduce load on the
 * underlying data sources.
 */

const _ = require('underscore');
const constants = require('../redis_constants.js');
const dota = require('../lib/dota.js');
const fl = require('flux-link');
const logger = require('../logger.js');
const steamAPI = require('../lib/steam.js');
const strings = require('../lib/strings.js');
const util = require('../util.js');

/**
 * Only continue if dota is available, otherwise throw an exception describing the
 * situation to the end user
 */
var continueIfDota = new fl.Chain(
	dota.getDotaStatus,
	function(env, after, status) {
		if (!status.alive) {
			env.$throw(new Error(strings.DOTA_UNAVAILABLE));
			return;
		}
		else {
			after();
		}
	}
);

/**
 * Convert account IDs into user names (no registered accounts yet)
 */
var getNamesForAccounts = new fl.Chain(
	function(env, after, ids) {
		env.ids = ids;
		env.clients.redis.mget(ids.map(id => 'steam_name_'+id), env.$check(after));
	},
	function(env, after, response) {
		env.result = _.object(_.zip(env.ids, response));

		var missing = [];
		_.each(env.result, function(v, k) {
			if (null == v) {
				env.result[k] = 'Unknown';
				missing.push(k);
			}
		});

		after(missing);
	},
	steamAPI.getNamesForAccounts,
	function(env, after, found) {
		_.each(found, function(p, id) {
			env.result[id] = p;
		});

		var keys = _.keys(env.result).map(v => 'steam_name_'+v);
		var values = _.values(env.result);
		env.redis_keys = keys;
		env.clients.redis.mset(_.flatten(_.zip(keys, values)), env.$check(after));
	},
	function(env, after) {
		var cmd = env.clients.redis.multi();
		env.redis_keys.forEach(function(v) {
			cmd.expire(v, 24*3600);
		});
		cmd.exec(); // ignore result
		after(env.result);
	}
).use_local_env(true);

/**
 * Get a profile for a given account id
 */
var getDotaProfile = new fl.Chain(
	function(env, after, steamid) {
		env.$push(steamid);
		env.clients.redis.get('dota_profile_'+steamid, env.$check(after));
	},
	new fl.Branch(
		function(env, after, profile) {
			env.profile = profile;
			after(null === profile);
		},
		new fl.Chain(
			continueIfDota,
			util.showWaitMessageWhile(strings.DOTA_WAIT_PROFILE, dota.getProfile)
		),
		function(env, after) {
			after(env.profile)
		}
	),
	function(env, after, profile) {
		if (null === profile) {
			logger.debug('Profile was evicted from redis before we could read it');
			env.$throw(new Error(strings.DOTA_PROFILE_UNAVAILABLE));
			return;
		}
		env.profile = JSON.parse(profile);
		after([env.profile.account_id]);
	},
	getNamesForAccounts,
	function(env, after, names) {
		env.profile.name = names[env.profile.account_id];
		after(env.profile);
	}
).use_local_env(true);

/**
 * Get scorescreen details for a given match id, and return the useful part as
 * the top level response (i.e. strip steam webapi request wrappers)
 * @todo add redis caching of match details
 */
var getMatchDetails = new fl.Chain(
	steamAPI.getMatchDetails,
	function(env, after, match) {
		env.match = match;
		var players = env.match.result.players.map(p => p.account_id);

		after(players);
	},
	getNamesForAccounts,
	function(env, after, players) {
		env.match.result.player_names = players;
		after(env.match.result);
	}
).use_local_env(true);

/**
 * Get the last match for a given account (not cached), and also fetch match
 * details before returning it, which are cached as normal
 */
var getLastMatch = new fl.Chain(
	continueIfDota,
	util.showWaitMessageWhile(strings.DOTA_WAIT_LASTMATCH, dota.getLastMatch),
	getMatchDetails
).use_local_env(true);

module.exports = {
	getNamesForAccounts : getNamesForAccounts,
	getDotaProfile : getDotaProfile,
	getMatchDetails : getMatchDetails,
	getLastMatch : getLastMatch,
};
