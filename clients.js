/**
 * Create a singleton container for client pointers (discord api, redis, etc.)
 */

const _ = require('underscore');
const config = require('./config.js');
const Discord = require('discord.js');
const logger = require('./logger.js');
const redis = require('redis');

var discordClient = new Discord.Client();
var redisClient = redis.createClient();
var redisSub = redis.createClient();

// Maybe do something better about these in the future
discordClient.on('error', function(err) {
	logger.var_dump(err, 'discord');
});

redisClient.on('error', function(err) {
	logger.var_dump(err, 'redis');
});

redisSub.on('error', function(err) {
	logger.var_dump(err, 'redis sub');
});

redisSub.subscribe('dota:profile');

// List of all things that are subscribed
var subs = {};

redisSub.on('message', function(channel, message) {
	var sub = subs[channel];

	if (undefined !== sub) {
		var handlers = sub[message];
		if (undefined !== handlers) {
			delete sub[message];
			handlers.forEach(process.nextTick);
		}
	}
});

/**
 * Call the given function when a message matching this is received on the specified
 * channel
 */
function subToStream(channel, message, fn) {
	if (undefined === subs[channel])
		subs[channel] = {};

	if (undefined === subs[channel][message])
		subs[channel][message] = [];

	subs[channel][message].push(fn);
}

module.exports = {
	redis : redisClient,
	redisSub : subToStream,
	discord : discordClient,
};
