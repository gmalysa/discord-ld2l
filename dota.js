/**
 * Dota 2 client interface.
 * This accepts commands via one or more queues managed through redis and
 * publishes results based on responses obtained within the dota client
 */

const fs = require('fs');
const _ = require('underscore');

const config = require('./config.js');
const logger = require('./logger.js');

const fl = require('flux-link');

const steam = require('steam');
const steamClient = new steam.SteamClient();
const steamUser = new steam.SteamUser(steamClient);
const dota2 = require('dota2');
const dotaClient = new dota2.Dota2Client(steamClient, true);

const redis = require('redis');
const constants = require('./redis_constants.js');
const util = require('./util.js');

var redisClients = {
	pub : redis.createClient(),		// publish new data here
	sub : redis.createClient(),		// subscribe to and listen for events here
};

// Read steam cm information from disk, this can sometimes be outdated and must be
// regenerated with the update_servers.js script
if (fs.existsSync('steam-servers.json')) {
	steam.servers = JSON.parse(fs.readFileSync('steam-servers.json'));
}

logger.var_dump(steam.servers);

/**
 * Dummy function to use in conditionals with no else
 */
function dummy(env, after) { after(); }

/**
 * Exception handler for reporting errors in talking to the dota api
 */
function exceptionHandler(env, err) {
	logger.debug('Exception caught while talking to a service');
	logger.var_dump(err);
	env.$catch();
}

/**
 * Need to log in in two different places
 */
function doSteamLogin() {
	steamUser.logOn({
		account_name : config.steam_user,
		password : config.steam_pass
	});
}

/**
 * Set a delay and then try to reconnect
 */
steamClient.on('error', function() {
	redisClients.pub.hmset(
		'dota_status',
		'steam', constants.STEAM.DISCONNECTED,
		'dota', constants.DOTA.DISCONNECTED
	);
	setTimeout(steamClient.connect, 30*1000);
});

/**
 * When we're initially connected, try to log in with the bot account information
 */
steamClient.on('connected', function() {
	logger.info('Connected to steam.');
	redisClients.pub.hset('dota_status', 'steam', constants.STEAM.CONNECTED);
	doSteamLogin();
});

/**
 * Launch dota after logging in to steam
 */
steamClient.on('logOnResponse', function(resp) {
	if (steam.EResult.OK == resp.eresult) {
		logger.info('Logged in to steam');
		redisClients.pub.hset('dota_status', 'steam', constants.STEAM.LOGGED_IN);
		dotaClient.launch();
	}
	else {
		logger.info('Steam login failed.');
		steamClient.disconnect();
		redisClients.pub.hset('dota_status', 'steam', constants.STEAM.DISCONNECTED);
		setTimeout(steamClient.connect, 30*1000);
	}
});

/**
 * After we've connected to gc, update status and start handling requests
 */
dotaClient.on('ready', function() {
	redisClients.pub.hset('dota_status', 'dota', constants.DOTA.CONNECTED);
	logger.info('Connected to Dota 2 GC');

	// @todo check redis command queue
});

dotaClient.on('hellotimeout', function() {
	logger.debug('Searching for GC', 'Dota 2');
	redisClients.pub.hset('dota_status', 'dota', constants.DOTA.LOOKING_FOR_GC);
});

/**
 * Send heartbeat information to redis
 */
setInterval(function() {
	redisClients.pub.hset('dota_status', 'hb', Date.now());
}, 10*1000);

/**
 * Create a friendly list of featured hero information and strip stuff we don't want
 * @param[in] CMsgProfileReponse profile Full profile object
 * @return array Array of featured heroes reduced to a couple keys only
 */
function getFeaturedHeroes(profile) {
	return _.map(profile.featured_heroes, function(hero) {
		return {
			hero_id : hero.hero_id,
			plus_hero_xp : hero.plus_hero_xp,
		};
	});
}

/**
 * Create a friendly list of successful heros, stripping stuff we don't want
 * @param[in] CMsgProfileResponse profile Full profile object
 * @return Array of featured heroes reduced to a couple keys only
 */
function getSuccessfulHeroes(profile) {
	return _.map(profile.successful_heroes, function(hero) {
		return {
			hero_id : hero.hero_id,
			win_percent : hero.win_percent,
			longest_streak : hero.longest_streak
		};
	});
}

/**
 * Verify that the dota connection is valid or abort the chain
 */
var continueIfConnected = new fl.Chain(
	function(env, after) {
		if (!dotaClient._gcReady) {
			env.$throw(new Error('GC not connected'));
			return;
		}
		else {
			after();
		}
	}
);

/**
 * Fetch dota profile data directly from GC, rate limiting isn't applied here
 * @param[in] id The account ID to fetch profile information for
 * @return Composition of profile, profile card, and player stats responses
 */
var getDotaProfile = new fl.Chain(
	continueIfConnected,
	function(env, after, id) {
		env.accountId = parseInt(id);
		logger.debug('Requesting profile for '+id);
		redisClients.pub.hincrby('stats', 'dota_request_profile', 1);
		dotaClient.requestProfile(env.accountId, env.$check(after));
	},
	function(env, after, profile) {
		env.profile = profile;
		dotaClient.requestProfileCard(env.accountId, env.$check(after));
	},
	function(env, after, profileCard) {
		env.profileCard = profileCard;
		dotaClient.requestPlayerStats(env.accountId, env.$check(after));
	},
	function(env, after, playerStats) {
		// Manually select the bits we want to keep
		var result = {
			account_id : env.accountId,
			fetched_on : Date.now(),
			rank_tier : env.profileCard.rank_tier,
			previous_rank_tier : env.profileCard.previous_rank_tier,
			is_plus_subscriber : env.profileCard.is_plus_subscriber,
			featured_heroes : getFeaturedHeroes(env.profile),
			successful_heroes : getSuccessfulHeroes(env.profile),
			mean_gpm : playerStats.mean_gpm,
			mean_xppm : playerStats.mean_xppm,
			mean_lasthits : playerStats.mean_lasthits,
			fight_score : playerStats.fight_score,
			farm_score : playerStats.farm_score,
			support_score : playerStats.support_score,
			push_score : playerStats.push_score,
			versatility_score : playerStats.versatility_score
		};
		after(result);
	}
).use_local_env(true);

/**
 * Publish a person's profile data to redis
 * @param[in] profile The profile data object to publish
 */
var publishDotaProfile = new fl.Chain(
	function(env, after, profile) {
		env.profile = profile;
		redisClients.pub.multi()
			.set(
				'dota_profile_' + profile.account_id,
				JSON.stringify(profile)
			)
			.expire('dota_profile_' + profile.account_id, 24*3600)
			.exec(env.$check(after));
	},
	function(env, after) {
		redisClients.pub.publish('dota:profile', env.profile.account_id);
		after();
	}
).use_local_env(true);

/**
 * Fetch a person's last played match
 * @param[in] id 32 bit steam id to fetch the last match for
 */
var getLastMatch = new fl.Chain(
	continueIfConnected,
	function(env, after, id) {
		env.account_id = parseInt(id);
		redisClients.pub.hincrby('stats', 'dota_lastmatch', 1);
		dotaClient.requestPlayerMatchHistory(env.account_id, {}, env.$check(after));
	},
	function(env, after, history) {
		redisClients.pub.multi()
			.set(
				'dota_lastmatch_'+env.account_id,
				history.matches[0].match_id.toString()
			)
			.expire('dota_lastmatch_'+env.account_id, 24*3600)
			.exec(env.$check(after));
	},
	function(env, after) {
		redisClients.pub.publish('dota:lastmatch', env.account_id);
		after();
	}
).use_local_env(true);

/**
 * Create a handler that works by popping a single value from a command queue in
 * redis and also re-calling itself if the queue is not empty after it finishes
 * @param[in] fn The function to call with the queue data
 * @return env.rerun set to true if the queue requires multiple calls
 */
function createRedisQueueHandler(fn, listName) {
	return new fl.Branch(
		new fl.Chain(
			function(env, after) {
				redisClients.pub.llen(listName, env.$check(after));
			},
			function(env, after, length) {
				env.rerun = length > 1;
				redisClients.pub.rpop(listName, env.$check(after));
			},
			function(env, after, data) {
				if (null == data) {
					after(false);
				}
				else {
					env.$push(data);
					after(true);
				}
			}
		),
		new fl.Chain(
			// Remove duplicates from the command list
			function(env, after, data) {
				env.$push(data);
				redisClients.pub.lrem(listName, 0, data, env.$check(after));
			},
			// lrem pushes a result to the stack we want to drop
			util.eat(1),
			fn
		),
		dummy
	).set_exception_handler(exceptionHandler);
}

/**
 * Create a function that will wrap a chain-style callable with a rate limit
 * @param[in] Chain fn that will be called
 * @param[in] interval The minimum time between two successive calls of this handler
 * @return A plain function that can be used to initiate calls to the handler
 */
function createRateLimitedHandler(fn, interval) {
	var meta = {
		lastTime : Date.now(),
		interval : interval
	};

	var chain = new fl.Branch(
		function(env, after) {
			var delta = Date.now() - meta.lastTime;
			logger.debug('Handler time delta: '+delta);
			logger.debug('Interval is: '+meta.interval);
			after(delta > meta.interval);
		},
		new fl.Chain(
			function(env, after) {
				meta.lastTime = Date.now();
				after();
			},
			fn
		),
		function(env, after) {
			setTimeout(wrapper, interval - (Date.now() - meta.lastTime) + 1);
			after();
		}
	);

	function wrapper() {
		var env = new fl.Environment({
			rerun : false
		});

		chain.call(null, env, function() {
			if (env.rerun) {
				wrapper();
			}
		});
	}

	return wrapper;
}

// Handlers for different commands
var handleProfileRequests = createRateLimitedHandler(
	createRedisQueueHandler(
		new fl.Chain(
			getDotaProfile,
			publishDotaProfile
		),
		'dota_cmds_get_profile'
	),
	5000);

//var handleRecentHistoryRequest = createRateLimitedHandler(recentHistoryRequest, 5000);

var handleLastMatch = createRateLimitedHandler(
	createRedisQueueHandler(
		getLastMatch,
		'dota_cmds_get_lastmatch'
	),
	1000
);

/**
 * Subscribe to command channels on redis
 */
redisClients.sub.subscribe('dota:command');
redisClients.sub.on('message', function(channel, message) {
	var [cmd, arg] = message.split(',');
	cmd = parseInt(cmd);

	switch (cmd) {
		case constants.DOTA_CMD.GET_PROFILE:
			redisClients.pub.lpush('dota_cmds_get_profile', arg, function() {
				handleProfileRequests();
			});
			break;
		case constants.DOTA_CMD.GET_RECENT_MATCHES:
			redisClients.pub.lpush('dota_cmds_get_matches', arg);
			break;
		case constants.DOTA_CMD.GET_MATCH:
			redisClients.pub.lpush('dota_cmds_get_match', arg);
			break;
		case constants.DOTA_CMD.GET_LASTMATCH:
			redisClients.pub.lpush('dota_cmds_get_lastmatch', arg, function() {
				handleLastMatch();
			});
		default:
			logger.debug('Received unknown command: '+cmd);
	}
});

// Clear status and start connecting
redisClients.pub.hmset(
	'dota_status',
	'steam', constants.STEAM.DISCONNECTED,
	'dota', constants.DOTA.DISCONNECTED
);
steamClient.connect();
