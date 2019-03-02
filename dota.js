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
		env.accountId = id;
		redisClients.pub.hincrby('stats', 'dota_request_profile', 1);
		logger.debug('requestProfile()');
		dotaClient.requestProfile(env.accountId, env.$check(after));
	},
	function(env, after, profile) {
		env.profile = sanitize(profile);
		logger.debug('requestProfileCard()');
		dotaClient.requestProfileCard(env.accountId, env.$check(after));
	},
	function(env, after, profileCard) {
		env.profileCard = sanitize(profileCard);
		logger.debug('requestPlayerStats()');
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
		logger.debug('saving profile to redis');
		logger.var_dump(profile);
		redisClients.pub.set(
			'dota_profile_' + profile.account_id,
			JSON.stringify(profile),
			env.$check(after)
		);
	},
	function(env, after) {
		logger.debug('publishing new profile to redis');
		redisClients.pub.publish('dota:profile', env.profile.account_id);
		after();
	}
).use_local_env(true);

/**
 * Fetch the next dota profile id from redis
 * @return true if a new profile was found (at next location on stack)
 */
var fetchProfileId = new fl.Chain(
	function(env, after) {
		redisClients.pub.rpop('dota_cmds_get_profile', env.$check(after));
	},
	function(env, after, id) {
		logger.debug('Got '+id+' from redis');
		if (null === id) {
			after(false);
		}
		else {
			env.$push(id);
			after(true);
		}
	}
).use_local_env(true);

/**
 * Construct profile request method from its pieces
 */
var profileRequest = new fl.Branch(
	fetchProfileId,
	new fl.Chain(
		getDotaProfile,
		publishDotaProfile
	),
	dummy
).set_exception_handler(exceptionHandler);

/**
 * Handle get profile requests that are queued in redis, respecting the rate limits
 */
var recentProfileRequest = 0;
function handleProfileRequests() {
	var delta = Date.now() - recentProfileRequest;
	if (delta < 5000) {
		setTimeout(handleProfileRequest, 5000);
		return;
	}

	logger.debug('Starting profile request handler');
	var env = new fl.Environment();
	recentProfileRequest = Date.now();
	profileRequest.call(null, env, null);
}

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
