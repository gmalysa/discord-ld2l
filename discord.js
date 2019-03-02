
require('colors');
const config = require('./config.js');
const fl = require('flux-link');
const fs = require('fs');
const logger = require('./logger.js');

var clients = require('./clients.js');

// List of things that can start commands
const command_prefixes = ['--', '—', '––', '——'];

// Populate commands from filesystem
// Each command is expected to export a function that is called to add itself
var commands = {};
var commandScripts = fs.readdirSync('./commands');
commandScripts.forEach(function(c) {
	if (/\w+\.js$/.test(c)) {
		logger.info('Loading command ' + c.yellow, 'Main');
		require('./commands/'+c)(commands);
	}
});

// Check if the message is for us and then pass to command handlers
clients.discord.on('message', function(message) {
	if (!message.guild)
		return;

	var prefix = command_prefixes.find(function(p) {
		return message.content.startsWith(p);
	});

	if (undefined === prefix)
		return;

	message.content = message.content.replace(prefix, '');
	env = new fl.Environment({
		clients : clients,
		message : message,
		words : message.content.split(' ')
	}, function(err) {
		logger.debug(err, 'Command');
	});

	var command = env.words[0];
	var cmd = commands[command.toLowerCase()];
	if (undefined !== cmd) {
		cmd.call(null, env, function() {});
	}
});

clients.discord.login(config.discord_token);
