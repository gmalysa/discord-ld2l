/**
 * Library functions for interacting with the dota process via IPC, such as queueing
 * commands and getting data
 */

const _ = require('underscore');
const constants = require('../redis_constants.js');
const fl = require('flux-link');
const logger = require('../logger.js');
const ipc = require('../lib/ipc.js');
const sprintf = require('sprintf-js').sprintf;

/**
 * Determine if a component is working based on heartbeat age
 * @param[in] age Age of the component to check
 * @return bool True if the component is working, false if it isn't
 */
function getComponentStatus(age) {
	return age < 15000;
}

/**
 * Convert a component heartbeat age into a status string
 * @param[in] age Age of the component in ms
 * @return String indicating whether the component is alive or not
 */
function getComponentStatusString(age) {
	if (getComponentStatus(age))
		return 'Working';
	else
		return 'Not Responding';
}

/**
 * Convert a steam status constant into a status string, from redis_constants.js
 * @param[in] status
 * @return String description of our status
 */
function getSteamStatusString(status) {
	switch (status) {
		case constants.STEAM.DISCONNECTED:
			return 'Not connected.';
		case constants.STEAM.CONNECTED:
			return 'Connected, logging in.';
		case constants.STEAM.LOGGED_IN:
			return 'Connected and signed in.';
	}

	return 'Unknown/Invalid';
}

/**
 * Convert a dota status message into a status string
 * @param[in] status
 * @return Status string description
 */
function getDotaStatusString(status) {
	switch (status) {
		case constants.DOTA.DISCONNECTED:
			return 'Not connected.';
		case constants.DOTA.LOOKING_FOR_GC:
			return 'Searching for Game Coordinator';
		case constants.DOTA.CONNECTED:
			return 'Connected to Game Coordinator';
	}

	return 'Unknown/Invalid';
}

/**
 * Get the status of the dota component from redis and do some int conversions for
 * convenience
 */
var getDotaStatus = new fl.Chain(
	function(env, after) {
		env.clients.redis.hmget('dota_status', 'hb', 'steam', 'dota', env.$check(after));
	},
	function(env, after, status) {
		var age = Date.now() - parseInt(status[0]);

		after({
			age : age,
			alive : getComponentStatus(age),
			steam : parseInt(status[1]),
			dota : parseInt(status[2])
		});
	}
);

/**
 * Send commands to dota process to get profile data and wait for a response
 */
var getProfile = ipc.createDotaCommand('profile', constants.DOTA_CMD.GET_PROFILE);
var getLastMatch = ipc.createDotaCommand('lastmatch', constants.DOTA_CMD.GET_LASTMATCH);

module.exports = {
	getComponentStatus : getComponentStatus,
	getComponentStatusString : getComponentStatusString,
	getSteamStatusString : getSteamStatusString,
	getDotaStatusString : getDotaStatusString,
	getDotaStatus : getDotaStatus,
	getProfile : getProfile,
	getLastMatch : getLastMatch,
};
