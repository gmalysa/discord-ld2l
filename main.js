
const config = require('./config.js');
const logger = require('./logger.js');
const _ = require('underscore');
const fl = require('flux-link');
const request = require('request');
const sprintf = require('sprintf-js').sprintf;
const dotaconstants = require('dotaconstants');

const Discord = require('discord.js');
var client = new Discord.Client();

// List of things that can start commands
const command_prefixes = ['--', '—', '––', '——'];

// List of game mode -> english string (dotaconstants provides only internal names)
// For simplicity only ones I care about have been added (complain to add more)
var gameModes = {
	0 : 'Unknown',
	1 : 'All Pick',
	2 : 'Captain\'s Mode',
	3 : 'Random Draft',
	4 : 'Single Draft',
	5 : 'All Random',
	8 : 'Reverse Captain\'s Mode',
	12 : 'Least Played',
	16 : 'Captain\'s Draft',
	18 : 'Ability Draft',
	19 : 'Event',
	20 : 'All Random Deathmatch',
	21 : '1v1 Solo Mid',
	22 : 'All Pick', // People call all draft all pick instead
	23 : 'Turbo',
	24 : 'Mutation', // In case this ever comes back
};

/**
 * To translate game mode to text label, handles game modes that aren't
 * included in the table yet/ever
 */
function translateGameMode(mode) {
	if (gameModes[mode])
		return gameModes[mode];
	return gameModes[0];
}

// List of lobby types -> english string (dotaconstants provides only internal names)
var lobbyTypes = {
	0 : 'Unranked',
	1 : 'Practice',
	2 : 'Tournament',
	4 : 'Co-op Bots',
	5 : 'Ranked', //Legacy ranked types are just called ranked
	6 : 'Ranked',
	7 : 'Ranked',
	8 : '1v1 Mid',
	9 : 'Battle Cup',
};

/**
 * Translate the lobby type to text label, handles lobby types that aren't included yet
 */
function translateLobbyType(lobby) {
	if (lobbyTypes[lobby])
		return lobbyTypes[lobby];
	return lobbyTypes[0];
}

/**
 * Format a set of player entries from a GetMatchDetails request into the table form
 * that is used within the result summary
 */
function makePlayerTable(players) {
	var rows = [
		sprintf('`%3s %-15s %3s/%3s/%3s %4s/%2s %6s %5s %4s %4s`',
				'', 'Hero', 'K', 'D', 'A', 'LH', 'DN', 'HD', 'TD', 'GPM', 'XPM')
	];

	players = players.map(function(p) {
		return sprintf(
			'`%3d %-15s %3d/%3d/%3d %4d/%2d %5.1fk %4.1fk %4d %4d` %s',
			p.level,
			dotaconstants.heroes[p.hero_id+''].localized_name.substr(0,15),
			p.kills,
			p.deaths,
			p.assists,
			p.last_hits,
			p.denies,
			p.hero_damage/1000,
			p.tower_damage/1000,
			p.gold_per_min,
			p.xp_per_min,
			p.account_id
		);
	});

	var table = rows.concat(players).join("\n").replace(' ', " \u200b\ufeff");
	logger.debug(table);
	return table;
}

/**
 * Gets match details from dota api
 */
var getMatchDetails = new fl.Chain(
	function(env, after, id) {
		request('http://api.steampowered.com/IDOTA2Match_570/GetMatchDetails/v1' +
			'?key=' + config.steam_api_key +
			'&match_id= ' +id,
			env.$check(after));
	},
	function(env, after, response, body) {
		// @todo resolve account id to names using cached lists, etc.
		var match = JSON.parse(body);
		logger.var_dump(match);

		after(match.result);
	},
	function(env, after, result) {
		var radEmote = env.message.guild.emojis.find(e => e.name == "radiant") || '';
		var direEmote = env.message.guild.emojis.find(e => e.name == "dire") || '';

		var winnerEmote = radEmote;
		var winnerName = 'Radiant';

		if (!result.radiant_win) {
			winnerName = 'Dire';
			winnerEmote = direEmote;
		}

		var durationMin = (result.duration/60) | 0;
		var durationSec = result.duration - durationMin*60;

		var details = sprintf(
			'%s **%s** Victory: %d-%d | **%s** %s (%d:%d) | %s',
			winnerEmote,
			winnerName,
			result.radiant_score,
			result.dire_score,
			translateLobbyType(result.lobby_type),
			translateGameMode(result.game_mode),
			durationMin,
			durationSec,
			(new Date(result.start_time*1000)).toDateString()
		);

		// @todo this requires either OD or multiple requests or a caching scheme
		// because skill was removed from the dota API response, so just show a
		// title for now, for the links to od/db/stratz
		var links = sprintf(
			'<https://www.opendota.com/matches/%d> / ' +
			'<https://www.dotabuff.com/matches/%d>',
			result.match_id,
			result.match_id,
		);

		var text = [
			details,
			'**Radiant**',
			makePlayerTable(result.players.slice(0, 5)),
			'**Dire**',
			makePlayerTable(result.players.slice(5)),
			links
		];
		env.message.channel.send(text.join("\n"));

		after();
	}
).use_local_env(true);

/**
 * Command interface for match information
 */
var matchinfo = new fl.Chain(
	function(env, after) {
		var hasId = /^[0-9]+$/.test(env.words[1]);

		if (hasId)
			after(env.words[1]);
		else
			env.$throw(new Error('Invalid match ID: '+env.words[1]));
	},
	getMatchDetails,
	function(env, after) {
		after();
	}
).use_local_env(true);

var commands = {
	m : matchinfo,
	mi : matchinfo,
	matchinfo : matchinfo
};

// Maybe do something better about these in the future
client.on('error', function(err) {
	logger.var_dump(err);
});

// Check if the message is for us and then pass to command handlers
client.on('message', function(message) {
	if (!message.guild)
		return;

	var prefix = command_prefixes.find(function(p) {
		return message.content.startsWith(p);
	});

	if (undefined === prefix)
		return;

	message.content = message.content.replace(prefix, '');
	env = new fl.Environment({
		message : message,
		words : message.content.split(' ')
	}, function(err) {
		logger.debug(err, 'Command');
	});

	logger.var_dump(env.words);

	var command = env.words[0];
	var cmd = commands[command];
	if (undefined !== cmd) {
		cmd.call(null, env, function() {});
	}
});

client.login(config.discord_token);
