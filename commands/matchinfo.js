/**
 * Provide the ability to fetch info about a specific match, parse, and display it
 */

const _ = require('underscore');
const dotaconstants = require('dotaconstants');
const fl = require('flux-link');
const logger = require('../logger.js');
const sprintf = require('sprintf-js').sprintf;
const steamAPI = require('../lib/steam.js');
const util = require('../util.js');

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
function makePlayerTable(players, names) {
	var rows = [
		sprintf('`%-3s %-15s %3s/%3s/%3s %4s/%2s %6s %5s %4s %4s`',
				'L.', 'Hero', 'K', 'D', 'A', 'LH', 'DN', 'HD', 'TD', 'GPM', 'XPM')
	];

	players = players.map(function(p) {
		return sprintf(
			'`%-3d %-15s %3d/%3d/%3d %4d/%2d %5.1fk %4.1fk %4d %4d` %s',
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
			util.discordEscape(names[p.account_id])
		);
	});

	return rows.concat(players).join("\n");
}

/**
 * Convert account IDs into user names (no registered accounts yet)
 */
var getNamesForAccounts = new fl.Chain(
	function(env, after, ids) {
		env.ids = ids;
		env.clients.redis.mget(ids.map(id => 'steam_name_'+id), env.$check(after));
	},
	function(env, after, response) {
		env.result = _.object(_.zip(env.ids, response));

		var missing = [];
		_.each(env.result, function(v, k) {
			if (null == v) {
				env.result[k] = 'Unknown';
				missing.push(k);
			}
		});

		after(missing);
	},
	steamAPI.getNamesForAccounts,
	function(env, after, found) {
		_.each(found, function(p, id) {
			env.result[id] = p;
		});

		var keys = _.keys(env.result).map(v => 'steam_name_'+v);
		var values = _.values(env.result);
		env.redis_keys = keys;
		env.clients.redis.mset(_.flatten(_.zip(keys, values)), env.$check(after));
	},
	function(env, after) {
		var cmd = env.clients.redis.multi();
		env.redis_keys.forEach(function(v) {
			cmd.expire(v, 24*3600);
		});
		cmd.exec(); // ignore result
		after(env.result);
	}
).use_local_env(true);

/**
 * Gets match details from dota api
 * @param[in] id match id is required for steam.getMatchDetails
 */
var getMatchDetails = new fl.Chain(
	steamAPI.getMatchDetails,
	function(env, after, match) {
		env.match = match;
		var players = env.match.result.players.map(p => p.account_id);

		after(players);
	},
	getNamesForAccounts,
	function(env, after, players) {
		var result = env.match.result;

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

		var links = sprintf(
			'OD: <https://www.opendota.com/matches/%d>\n' +
			'DB: <https://www.dotabuff.com/matches/%d>',
			result.match_id,
			result.match_id,
		);

		var text = [
			details,
			'**Radiant**',
			makePlayerTable(result.players.slice(0, 5), players),
			'**Dire**',
			makePlayerTable(result.players.slice(5), players),
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

module.exports = function(commands) {
	commands['m'] = matchinfo;
	commands['mi'] = matchinfo;
	commands['matchinfo'] = matchinfo;
}
