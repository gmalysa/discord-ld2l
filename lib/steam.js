/**
 * Functions relating to accessing steam APIs
 */

const _ = require('underscore');
const fl = require('flux-link');
const BigNumber = require('bignumber.js');
const request = require('request');
const config = require('../config.js');
const logger = require('../logger.js');

const steamOffset = new BigNumber('76561197960265728');

/**
 * Convert a given 32 bit ID to 64 bit
 * @param[in] id 32 bit steam ID, not checked for validity
 * @reutnr 64 bit version of that ID, as a string
 */
function getID64(id) {
	var steam64 = new BigNumber(id+'').add(steamOffset);
	return steam64.toString();
}

/**
 * Convert a given 64 bit ID to 32 bits
 * @param[in] id 64 bit steam ID, not checked for validity
 * @return 32 bit version of that ID, still as a string
 */
function getID32(id) {
	var steam32 = new BigNumber(id+'').sub(steamOffset);
	return steam32.toString();
}

/**
 * Retrieve account details for the given steam IDs
 * @param[in] accounts Array of steam 32 bit IDs, no validation is performed here
 * @return array of account names or "Unknown" for accounts with privacy settings
 */
var getNamesForAccounts = new fl.Chain(
	function(env, after, accounts) {
		if (accounts.length > 0) {
			request(
				'http://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2' +
				'?key=' + config.steam_api_key +
				'&steamids=' + accounts.map(getID64).join(','),
				env.$check(after)
			);
		}
		else {
			// Fake zero length response for empty account lists
			after({}, '{"response" : { "players" : [] }}');
		}
	},
	function(env, after, response, body) {
		var data = JSON.parse(body);

		var rtn = {};
		data.response.players.forEach(function(p) {
			id = getID32(p.steamid);
			if (p.personaname)
				rtn[id] = p.personaname;
			else
				rtn[id] = 'Unknown';
		});

		after(rtn);
	}
).use_local_env(true);

/**
 * Retrieve match details for a given match ID from steam
 * @param[in] id Single match id to get results for
 * @return object with the match details
 */
var getMatchDetails = new fl.Chain(
	function(env, after, id) {
		request('http://api.steampowered.com/IDOTA2Match_570/GetMatchDetails/v1' +
			'?key=' + config.steam_api_key +
			'&match_id= ' +id,
			env.$check(after));
	},
	function(env, after, response, body) {
		after(JSON.parse(body));
	}
);

/**
 * Convert some kind of untamed user input into a steam 32 bit account id
 * @todo duplicating 32/64 conversion logic here is dumb, fix getID32 and getID64 to work for
 * both 32/64 bit inputs and use them everywhere
 */
var resolveAccountId = new fl.Branch(
	function(env, after, id) {
		env.$push(id);
		after(/^[0-9]+$/.test(id));
	},
	// ID was numeric, coerce into 64 bit
	function(env, after, id) {
		var steamid = new BigNumber(id+'');
		if (steamid.lessThan(steamOffset)) {
			after(steamid.toString());
		}
		else {
			after(steamid.sub(steamOffset).toString());
		}
	},
	new fl.Chain(
		// ID was not numeric, try to resolve via webapi
		function(env, after, id) {
			env.searchId = id;

			// Remove trailing slashes
			if (id.charAt(id.length-1) == '/')
				id = id.substring(0, id.length-1);

			// Break on slashes to find the last part of a potential steam community link
			var words = id.split('/');
			var name = words[words.length-1];

			request('http://api.steampowered.com/ISteamUser/ResolveVanityURL/v0001/' +
				'?key=' + config.steam_api_key +
				'&vanityurl=' + encodeURIComponent(name),
				env.$check(after));
		},
		function(env, after, response, body) {
			var data = JSON.parse(body);
			if (1 == data.response.success) {
				after(getID32(data.response.steamid));
			}
			else {
				env.$throw(new Error('No steamid found matching `'+env.searchId+'`'));
			}
		}
	)
);

module.exports = {
	getID32 : getID32,
	getID64 : getID64,
	getNamesForAccounts : getNamesForAccounts,
	resolveAccountId : resolveAccountId,
	getMatchDetails : getMatchDetails
};
