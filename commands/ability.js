/**
 * Get details about an ability, using some fuzzy matching
 */

const _ = require('underscore');
const Discord = require('discord.js');
const dotaconstants = require('dotaconstants');
const fl = require('flux-link');
const logger = require('../logger.js');
const sprintf = require('sprintf-js').sprintf;
const util = require('../util.js');

/**
 * Look up an ability, format a message explaining it, and send it back
 */
var ability = new fl.Chain(
	function(env, after) {
		var testName = env.words.slice(1).join(' ');

		// Look for cheap matches first
		var matches = _.filter(dotaconstants.abilities, function(ability) {
			// Handle malformed abilities
			if (undefined === ability.dname)
				return false;

			var lc = ability.dname.toLowerCase();
			if (lc.includes(testName.toLowerCase()))
				return true;
		});

		// Search for a more expensive match if we didn't find anything
		if (matches.length == 0) {
			// @todo use string-similarity, not needed for initial embed design
		}

		// No match, report error
		if (matches.length == 0) {
			var message = sprintf(
				'Couldn\'t find an ability matching `%s`',
				util.discordEscape(testName)
			);
			env.message.channel.send(message);
			after();
			return;
		}

		// @todo add the ability to cycle matches
		var ability = matches[0];

		var description = [
			ability.desc,
			'',
		];

		if (ability.mc) {
			// @todo use mana cost emote
			description.push('Mana: ' + util.joinMaybeList(ability.mc, '/'));
		}

		if (ability.cd) {
			description.push('Cooldown: ' + util.joinMaybeList(ability.cd, '/'));
		}

		ability.attrib.forEach(function(attr) {
			description.push(sprintf(
				'**%s**: %s',
				attr.header,
				util.joinMaybeList(attr.value, '/')
			));
		});

		var embed = new Discord.RichEmbed()
			.setTitle(ability.dname)
			.setThumbnail('http://cdn.dota2.com/'+ability.img)
			.setDescription(description.join('\n'));

		env.message.channel.send(embed);
		after();
	}
).use_local_env(true);

module.exports = function(commands) {
	commands['ability'] = ability;
}
