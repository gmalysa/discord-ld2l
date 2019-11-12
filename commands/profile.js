/**
 * Command to show a registered user's profile
 */

const _ = require('underscore');
const cached = require('../lib/cached.js');
const constants = require('../redis_constants.js');
const Discord = require('discord.js');
const dotaconstants = require('dotaconstants');
const dota = require('../lib/dota.js');
const fl = require('flux-link');
const logger = require('../logger.js');
const sprintf = require('sprintf-js').sprintf;
const strings = require('../lib/strings.js');
const util = require('../util.js');

// If we ever want to get radar charts of playstyle stats, combine this with imagemagick
//const radar = require('svg-radar-chart');
//const stringify = require('virtual-dom-stringify');
//	var chart = radar({
//		fighting : 'Fighting',
//		farming : 'Farming',
//		supporting : 'Supporting',
//	}, [
//		{ class : 'Name', fighting : 0.8, farming : 0.7, supporting : 0.56 }
//	], {
//		scales : 5,
//	});
//
//	var svg = '<svg version="1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' +
//'<style>' +
//	'.axis { stroke-width: .2; stroke: #444; }' +
//	'.scale { stroke-width: .2; stroke: #ccc; }' +
//	'.shape { fill-opacity: .3; fill: #660; }' +
//	'.shape:hover { fill-opacity: .6; fill: #660 }' +
//'</style>' + stringify(chart) + '</svg>';
//
//	logger.debug(svg);
//	var attachment = new Discord.Attachment(Buffer.from(svg));
//	env.message.channel.send(attachment);

// Amount of XP needed to reach the next level from the current level
const dotaplus_intervals = [
	50,
	300,
	400,
	500,
	600,
	900,
	1000,
	1100,
	1200,
	1300,
	1400,
	1700,
	1800,
	1900,
	2000,
	2100,
	2200,
	2500,
	2600,
	2700,
	2800,
	2900,
	3000,
	3100,
	6800
];

var cumsum = 0;
const dotaplus_thresholds = _.map(dotaplus_intervals, function(xp) {
	cumsum += xp;
	return cumsum;
});

/**
 * Find the level for a hero based on the xp given
 */
function getDotaplusLevel(xp) {
	var index = _.findIndex(dotaplus_thresholds, function(threshold) {
		return xp < threshold;
	});

	// Above the final amount indicates master tier
	if (-1 == index)
		return 25;

	return index;
}

/**
 * Find the correct tier image to use for a particular level
 */
function getDotaplusTier(level) {
	if (level < 1)
		return 'Unrated';

	if (level < 6)
		return 'Bronze';

	if (level < 12)
		return 'Silver';

	if (level < 18)
		return 'Gold';

	if (level < 25)
		return 'Platinum';

	return 'Master';
}

const prepositions = [
	util.commandPrepositionOf,
];

/**
 * Obtain a user's profile and display the important bits
 */
var profile = new fl.Chain(
	function(env, after) {
		after(prepositions);
	},
	util.checkCommandPrepositions,
	function(env, after) {
		if (env.of)
			after(env.of);
		else
			after(env.message.author.id);
	},
	util.getSteamFromDiscord,
	cached.getDotaProfile,
	function(env, after, profile) {
		var medal = 'http://ld2l.gg/static/images/medals/'+profile.rank_tier+'.png';

		// @todo get emotes for tier names
		var featured = profile.featured_heroes.map(function(h) {
			var level = getDotaplusLevel(h.plus_hero_xp);
			var tier = getDotaplusTier(level);

			return sprintf(
				'Rank %d (%s) %s',
				level,
				tier,
				dotaconstants.heroes[h.hero_id].localized_name
			);
		}).join('\n');

		var best = profile.successful_heroes.map(function(h) {
			return sprintf(
				'**%s**: %.1f%%, %d in a row',
				dotaconstants.heroes[h.hero_id].localized_name,
				100*h.win_percent,
				h.longest_streak
			);
		}).join('\n');

		var recent = sprintf(
			'GPM: %d\nXPM: %d\nFighting: %.2f\nFarming: %.2f\n' +
			'Supporting: %.2f\nPushing: %.2f\nVersatility: %.2f',
			profile.mean_gpm,
			profile.mean_xppm,
			profile.fight_score,
			profile.farm_score,
			profile.support_score,
			profile.push_score,
			profile.versatility_score
		);

		var links = [
			'[OD](https://www.opendota.com/players/'+profile.account_id+')',
			'[DB](https://www.dotabuff.com/players/'+profile.account_id+')',
			'[STRATZ](https://stratz.com/en-us/player/'+profile.account_id+')',
		].join(' / ');

		var embed = new Discord.RichEmbed()
			.setTitle(profile.name)
			.setURL('https://www.dotabuff.com/players/'+profile.account_id)
			.setThumbnail(medal)
			.addField('Featured Heroes', featured, true)
			.addField('Best Heroes', best, true)
			.addBlankField()
			.addField('Recent Stats', recent, true)
			.addField('Links', links, true);

		if (profile.fetched_on) {
			embed.setFooter('Retrieved '+(new Date(profile.fetched_on)).toLocaleString('en-US',
				{timeZone : 'America/Chicago'}));
		}

		env.message.channel.send(embed);

		after();
	}
).use_local_env(true).set_exception_handler(util.commandExceptionHandler);

profile = util.addMySQL(profile);

module.exports = function(commands) {
	commands['profile'] = profile;
	commands['p'] = profile;
};
