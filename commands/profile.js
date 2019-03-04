/**
 * Command to show a registered user's profile
 */

const _ = require('underscore');
const cached = require('../lib/cached.js');
const Discord = require('discord.js');
const dotaconstants = require('dotaconstants');
const fl = require('flux-link');
const logger = require('../logger.js');
const sprintf = require('sprintf-js').sprintf;
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

// Amount of XP needed to reach the next level (in total)
const dotaplus_levels = [
	0,
	500,
	3000,
	4000,
	5000,
	6000,
	9000,
	10000,
	11000,
	12000,
	13000,
	14000,
	17000,
	18000,
	19000,
	20000,
	21000,
	22000,
	25000,
	26000,
	27000,
	28000,
	29000,
	30000,
	31000,
	68000
];

/**
 * Find the level for a hero based on the xp given
 */
function getDotaplusLevel(xp) {
	var index = _.findIndex(dotaplus_levels, function(threshold) {
		return xp <= threshold;
	});

	// Not sure if xp goes above master tier threshold or caps
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

/**
 * Obtain a user's profile and display the important bits
 * @todo The profile fetch needs to move to lib/cached
 */
var profile = new fl.Chain(
	function(env, after) {
		if (!/^[0-9]+$/.test(env.words[1])) {
			// @todo error message
			return;
		}

		env.clients.redis.get('dota_profile_'+env.words[1], env.$check(after));
	},
	function(env, after, profile) {
		if (null === profile) {
			// @todo queue up a profile request if we haven't seen one
			env.message.channel.send('Profile not found');
			return;
		}
		after(profile);
	},
	function(env, after, profile) {
		env.profile = JSON.parse(profile);
		after([env.profile.account_id]);
	},
	cached.getNamesForAccounts,
	function(env, after, names) {
		var medal = 'http://ld2l.gg/static/images/medals/'+env.profile.rank_tier+'.png';

		// @todo get emotes for tier names
		var featured = env.profile.featured_heroes.map(function(h) {
			var level = getDotaplusLevel(h.plus_hero_xp);
			var tier = getDotaplusTier(level);

			return sprintf(
				'Rank %d (%s) %s',
				level,
				tier,
				dotaconstants.heroes[h.hero_id].localized_name
			);
		}).join('\n');

		var best = env.profile.successful_heroes.map(function(h) {
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
			env.profile.mean_gpm,
			env.profile.mean_xppm,
			env.profile.fight_score,
			env.profile.farm_score,
			env.profile.support_score,
			env.profile.push_score,
			env.profile.versatility_score
		);

		var links = [
			'[OD](https://www.opendota.com/players/'+env.profile.account_id+')',
			'[DB](https://www.dotabuff.com/players/'+env.profile.account_id+')',
			'[STRATZ](https://stratz.com/en-us/player/'+env.profile.account_id+')',
		].join(' / ');

		var embed = new Discord.RichEmbed()
			.setTitle(names[env.profile.account_id])
			.setURL('https://www.dotabuff.com/players/'+env.profile.account_id)
			.setThumbnail(medal)
			.addField('Featured Heroes', featured, true)
			.addField('Best Heroes', best, true)
			.addBlankField()
			.addField('Recent Stats', recent, true)
			.addField('Links', links, true)

		env.message.channel.send(embed);

		after();
	}
).use_local_env(true);

module.exports = function(commands) {
	commands['profile'] = profile;
	commands['p'] = profile;
};