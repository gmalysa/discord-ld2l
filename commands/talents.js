/**
 * Format talent information for a hero and display
 */

const _ = require('underscore');
const Discord = require('discord.js');
const dotaconstants = require('dotaconstants');
const fl = require('flux-link');
const logger = require('../logger.js');
const sprintf = require('sprintf-js').sprintf;
const util = require('../util.js');

/**
 * Find a matching hero and display their talent information
 */
var talents = new fl.Chain(
	function(env, after) {
		env.testName = env.words.slice(1).join(' ');
		after(env.testName);
	},
	util.dotaHeroSearch,
	function(env, after, matches) {
		if (matches.length == 0) {
			var message = sprintf(
				'Couldn\'t find a hero matching `%s`',
				util.discordEscape(env.testName)
			);
			env.message.channel.send(message);
			after();
			return;
		}

		// Multiple matches?
		var hero = matches[0];

		var talents = dotaconstants.hero_abilities[hero.name].talents;
		if ('npc_dota_hero_invoker' == hero.name)
			talents = dotaconstants.hero_abilities[hero.name].talents.slice(7);

		// Sort pairs of talents descending from level 25
		var talentPairs = _.chunk(talents, 2).reverse();
		var description = talentPairs.map(function(tp, idx) {
			return sprintf(
				'**%d**: %s :black_square_button: %s',
				25 - idx*5,
				dotaconstants.abilities[tp[1].name].dname,
				dotaconstants.abilities[tp[0].name].dname
			);
		});

		var embed = new Discord.RichEmbed()
			.setTitle(hero.localized_name + ' Talents')
			.setThumbnail('http://cdn.dota2.com/'+hero.img)
			.setDescription(description);

		env.message.channel.send(embed);
		after();
	}
).use_local_env(true);

module.exports = function(commands) {
	commands['talents'] = talents;
};
