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
		env.steamid = steamid;
		env.clients.redis.get('dota_profile_'+steamid, env.$check(after));
	},
	new fl.Branch(
		function(env, after, profile) {
			env.profile = profile;
			env.message = null;
			after(null === profile);
		},
		new fl.Chain(
			continueIfDota,
			function(env, after) {
				env.message.channel.send(strings.DOTA_WAIT_PROFILE)
					.then(after)
					.catch(env.$throw);
			},
			function(env, after, message) {
				env.message = message;
				after(env.steamid);
			},
			dota.getProfile
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
		env.profile.name = names[0];
		after(env.profile);
	}
).use_local_env(true);

module.exports = {
	getNamesForAccounts : getNamesForAccounts,
	getDotaProfile : getDotaProfile,
};
