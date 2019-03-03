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
 * Sanitize objects that come from node-dota2 to remove stuff that isn't part of
 * the response that we want
 */
function sanitize(obj) {
	return _.omit(obj, '$type', 'toJSON', 'constructor');
}

/**
 * Exception handler for reporting errors in talking to the dota api
 */
function exceptionHandler(env, err) {
	logger.debug('Exception caught while talking to a service');
	logger.var_dump(err);
	err.$catch();
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
 * Fetch dota profile data directly from GC, rate limiting isn't applied here
 * @param[in] id The account ID to fetch profile information for
 * @return Composition of profile, profile card, and player stats responses
 */
var getDotaProfile = new fl.Chain(
	function(env, after, id) {
		env.accountId = parseInt(id);
		logger.debug('Requesting profile for '+id);
		redisClients.pub.hincrby('stats', 'dota_request_profile', 1);
		dotaClient.requestProfile(env.accountId, env.$check(after));
	},
	function(env, after, profile) {
		env.profile = sanitize(profile);
		dotaClient.requestProfileCard(env.accountId, env.$check(after));
	},
	function(env, after, profileCard) {
		env.profileCard = sanitize(profileCard);
		dotaClient.requestPlayerStats(env.accountId, env.$check(after));
	},
	function(env, after, playerStats) {
		env.playerStats = sanitize(playerStats);

		var result = _.extend(
			{account_id : env.accountId},
			{profile : env.profile},
			{profileCard : env.profileCard},
			{stats : env.playerStats}
		);
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
		fn,
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

	var env = new fl.Environment({
		rerun : false
	});

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