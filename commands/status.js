/**
 * Show bot status, which includes steam status
 */

const _ = require('underscore');
const Discord = require('discord.js');
const fl = require('flux-link');
const logger = require('../logger.js');
const sprintf = require('sprintf-js').sprintf;
const constants = require('../redis_constants.js');

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
 * Get status command from discord client, format the status information available in
 * redis and print it out
 */
var getStatus = new fl.Chain(
	function(env, after) {
		env.clients.redis.hmget('dota_status', 'hb', 'steam', 'dota', env.$check(after));
	},
	function(env, after, status) {
		var description = '';
		var dota_age = Date.now() - parseInt(status[0]);

		if (getComponentStatus()) {
			description = sprintf(
				'Dota Component: %s\nSteam Connection: %s\nDota Game Coordinator: %s',
				getComponentStatusString(dota_age),
				getSteamStatusString(parseInt(status[1])),
				getDotaStatusString(parseInt(status[2]))
			);
		}
		else {
			description = sprintf(
				'Dota Component: %s\nSteam Connection: %s\nDota Game Coordinator: %s',
				getComponentStatusString(dota_age),
				'N/A',
				'N/A'
			);
		}

		var embed = new Discord.RichEmbed()
			.setTitle('Bot Status')
			.setDescription(description);

		env.message.channel.send(embed);

		after();
	}
);

module.exports = function(commands) {
	commands['status'] = getStatus;
};
