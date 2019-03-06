/**
 * Show bot status, which includes steam status
 */

const _ = require('underscore');
const constants = require('../redis_constants.js');
const Discord = require('discord.js');
const dota = require('../lib/dota.js');
const fl = require('flux-link');
const logger = require('../logger.js');
const sprintf = require('sprintf-js').sprintf;

/**
 * Get status command from discord client, format the status information available in
 * redis and print it out
 */
var getStatus = new fl.Chain(
	dota.getDotaStatus,
	function(env, after, status) {
		var description = '';

		if (status.alive) {
			description = sprintf(
				'Dota Component: %s\nSteam Connection: %s\nDota Game Coordinator: %s',
				dota.getComponentStatusString(status.age),
				dota.getSteamStatusString(parseInt(status.steam)),
				dota.getDotaStatusString(parseInt(status.dota))
			);
		}
		else {
			description = sprintf(
				'Dota Component: %s\nSteam Connection: %s\nDota Game Coordinator: %s',
				dota.getComponentStatusString(status.age),
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
