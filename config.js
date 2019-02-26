/**
 * Handle loading configuration information from a local json file and suggest some default values
 */

var _ = require('underscore');
var local = require('./config.json');

var defaults = {
	// MySQL settings
	mysql : {
		host : 'localhost',
		user : 'ld2l',
		database : 'ld2l',
		password : 'ld2l',
	},

	// Steam and Dota settings
	steam_api_key : '',
	// @todo add dota options here, likely a steam name/pw

	// Discord application settings
	discord_client_id : '',
	discord_client_secret : '',
	discord_token : '',

	discord_news_webhook : '',

	// KBaaS settings
	kbaas_url : 'http://api.kaedebot.com',
	kbaas_key : ''
};

module.exports = _.extend({}, defaults, local);
