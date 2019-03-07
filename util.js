/**
 * Utility functions used throughout
 */

const _ = require('underscore');
const dotaconstants = require('dotaconstants');
const fl = require('flux-link');
const logger = require('./logger.js');
const mysql = require('./mysql.js');
const sprintf = require('sprintf-js').sprintf;
const strings = require('./lib/strings.js');

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
 * To translate game mode to text label, handles game modes that aren't
 * included in the table yet/ever
 */
function translateGameMode(mode) {
	if (gameModes[mode])
		return gameModes[mode];
	return gameModes[0];
}

/**
 * Translate the lobby type to text label, handles lobby types that aren't included yet
 */
function translateLobbyType(lobby) {
	if (lobbyTypes[lobby])
		return lobbyTypes[lobby];
	return lobbyTypes[0];
}

/**
 * Escape characters that would enter or end a formatting mode or backslashes
 */
function discordEscape(name) {
	return name.replace(/[*\`_]/g, '\\$&');
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
			discordEscape(names[p.account_id])
		);
	});

	return rows.concat(players).join("\n");
}

/**
 * Format a match details object as text and send to discord
 */
function sendMatchDetails(env, after, match) {
	var radEmote = env.message.guild.emojis.find(e => e.name == "radiant") || '';
	var direEmote = env.message.guild.emojis.find(e => e.name == "dire") || '';

	var winnerEmote = radEmote;
	var winnerName = 'Radiant';

	if (!match.radiant_win) {
		winnerName = 'Dire';
		winnerEmote = direEmote;
	}

	var durationMin = (match.duration/60) | 0;
	var durationSec = match.duration - durationMin*60;

	var details = sprintf(
		'%s **%s** Victory: %d-%d | **%s** %s (%d:%d) | %s',
		winnerEmote,
		winnerName,
		match.radiant_score,
		match.dire_score,
		translateLobbyType(match.lobby_type),
		translateGameMode(match.game_mode),
		durationMin,
		durationSec,
		(new Date(match.start_time*1000)).toDateString()
	);

	var links = sprintf(
		'OD: <https://www.opendota.com/matches/%d>\n' +
		'DB: <https://www.dotabuff.com/matches/%d>',
		match.match_id,
		match.match_id,
	);

	var text = [
		details,
		'**Radiant**',
		makePlayerTable(match.players.slice(0, 5), match.player_names),
		'**Dire**',
		makePlayerTable(match.players.slice(5), match.player_names),
		links
	];
	env.message.channel.send(text.join("\n"));

	after();
}

/**
 * Exception handler for wait message chains just cleans up the wait message and
 * then re-throws the exception
 */
function waitMessageError(env, err) {
	if (env.wait_message) {
		env.wait_message.delete();
	}
	env.$throw(err);
}

/**
 * Create a chain that shows the given string while the given function is running
 * and then automatically cleans it up. Also clean up the message in the event of
 * an exception
 * @param[in] msg Message to display while waiting for fn to finish
 * @param[in] fn The function call while the message is displayed
 * @return Chain-callable function
 */
function showWaitMessageWhile(msg, fn) {
	return new fl.Chain(
		function(env, after) {
			env.wait_message = null;
			env.message.channel.send(msg)
				.then(after)
				.catch(env.$throw)
		},
		function(env, after, message) {
			env.wait_message = message;
			after();
		},
		fn,
		function(env, after) {
			env.wait_message.delete();
			after();
		}
	).set_exception_handler(waitMessageError);
}

module.exports = {
	/**
	 * Eat # of arguments from the stack, for handling redis functions that
	 * produce values we don't care about while constructing stuff
	 */
	eat : function(n) {
		var eater = function(env, after) {
			after();
		};

		return fl.mkfn(eater, n);
	},

	/**
	 * Shared exception handler that is used for discord commands
	 */
	commandExceptionHandler : function(env, err) {
		env.message.reply(err.message);
		logger.var_dump(err);
		env.$catch();
	},

	/**
	 * Get a steam id for a discord id if this person has registered
	 */
	getSteamFromDiscord : new fl.Chain(
		function(env, after, discordid) {
			env.filters.accounts.select({discordid : discordid})
				.exec(after, env.$throw);
		},
		function(env, after, results) {
			if (results.length == 0) {
				env.$throw(new Error(strings.PLEASE_REGISTER));
				return;
			}

			after(results[0].steamid);
		}
	),

	/**
	 * Merge a maybe list or a single value into a string
	 */
	joinMaybeList : function(list, join) {
		if (Array.isArray(list))
			return list.join(join);
		return list;
	},

	/**
	 * Build a chain that has access to the mysql database with guaranteed resource
	 * cleanup.
	 */
	addMySQL : function(fn) {
		return new fl.Chain(
			mysql.init_db,
			fn,
			mysql.cleanup_db
		).set_exception_handler(function(env, err) {
			logger.debug('Unhandled exception in mysql-enabled command');
			logger.var_dump(err);

			mysql.cleanup_db(env, function() {
				env.$catch();
			});
		});
	},

	/**
	 * Chain factory to build some search functions that have similar structure
	 */
	dotaMatchBuilder : function(list) {
		return new fl.Chain(
			function(env, after, testName) {
				// Look for cheap matches first
				var matches = _.filter(list, function(entry) {
					// Handle malformed abilities
					if (undefined === entry.dname)
						return false;

					var lc = entry.dname.toLowerCase();
					if (lc.includes(testName.toLowerCase()))
						return true;

					return false;
				});

				// Search for a more expensive match if we didn't find anything
				if (matches.length == 0) {
					// @todo use string-similarity
				}

				after(matches);
			}
		);
	},

	/**
	 * Find a hero match by name
	 */
	dotaHeroSearch : new fl.Chain(
		function(env, after, testName) {
			var testLC = testName.toLowerCase();
			var testLCinternal = testLC.replace(' ', '_');

			var matches = _.filter(dotaconstants.heroes, function(hero) {
				if (hero.localized_name.toLowerCase().includes(testLC))
					return true;

				if (hero.name.includes(testLCinternal))
					return true;

				return false;
			});

			// @todo use string-similarity for a fallback match

			after(matches);
		}
	),

	discordEscape : discordEscape,
	sendMatchDetails : sendMatchDetails,
	showWaitMessageWhile : showWaitMessageWhile,
};
