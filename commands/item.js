/**
 * Get details about an item
 */

const _ = require('underscore');
const Discord = require('discord.js');
const dotaconstants = require('dotaconstants');
const fl = require('flux-link');
const logger = require('../logger.js');
const sprintf = require('sprintf-js').sprintf;
const util = require('../util.js');

/**
 * Look up an item, format a message explaining it, and send it back
 */
var item = new fl.Chain(
	function(env, after) {
		env.testName = env.words.slice(1).join(' ');
		after(env.testName);
	},
	util.dotaMatchBuilder(_.filter(dotaconstants.items, function(item) {
		if (item.dname)
			return !item.dname.includes('Recipe');
		return false;
	})),
	function(env, after, matches) {
		// No match, report error
		if (matches.length == 0) {
			var message = sprintf(
				'Couldn\'t find an item matching `%s`',
				util.discordEscape(env.testName)
			);
			env.message.channel.send(message);
			after();
			return;
		}

		// @todo add teh ability to cycle matches
		var item = matches[0];

		// Normal description at the top
		var description = [
			'*'+item.lore+'*',
			''
		];

		if (item.active) {
			item.active.forEach(function(active) {
				description.push(sprintf(
					'**%s**: %s',
					active.name,
					active.desc
				));
			});
		}

		if (item.passive) {
			item.passive.forEach(function(passive) {
				description.push(sprintf(
					'**%s**: %s',
					passive.name,
					passive.desc
				));
			});
		}

		description.push(item.desc);

		// Stats go into one field
		var stats = [];
		if (item.cost) {
			stats.push('Cost: ' + item.cost);
		}

		if (item.mc) {
			stats.push('Mana: ' + item.mc);
		}

		if (item.cd) {
			stats.push('Cooldown: ' + item.cd);
		}

		item.attrib.forEach(function(attr) {
			stats.push(sprintf(
				'%s%s %s',
				attr.header,
				util.joinMaybeList(attr.value),
				attr.footer
			));
		});

		var embed = new Discord.RichEmbed()
			.setTitle(item.dname)
			.setThumbnail('http://cdn.dota2.com/'+item.img)
			.setDescription(description.join('\n'))
			.addField('Stats', stats.join('\n'), true);

		if (item.components) {
			var components = [];
			item.components.forEach(function(c) {
				components.push(sprintf(
					'%d - %s',
					dotaconstants.items[c].cost,
					dotaconstants.items[c].dname
				));
			});
			embed.addField('Components', components.join('\n'), true);
		}

		// If notes were present add them after the components
		if (item.notes.length > 0)
			embed.addField('Notes', item.notes);

		env.message.channel.send(embed);
	}
).use_local_env(true);

module.exports = function(commands) {
	commands['item'] = item;
};
