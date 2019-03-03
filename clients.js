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

module.exports = {
	redis : redisClient,
	redisSub : redisSub,
	discord : discordClient,
};
