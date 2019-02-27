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
		request(
			'http://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2' +
			'?key=' + config.steam_api_key +
			'&steamids=' + accounts.map(getID64).join(','),
			env.$check(after)
		);
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

module.exports = {
	getID32 : getID32,
	getID64 : getID64,
	getNamesForAccounts : getNamesForAccounts
};
