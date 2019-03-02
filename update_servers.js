/**
 * Regenerate steam cm list
 */

var request = require('request');
var fs = require('fs');
var process = require('process');

request(
	'https://api.steampowered.com/ISteamDirectory/GetCMList/v1/?cellid=0',
	function(err, response, body) {
		var data = JSON.parse(body);
		var servers = data.response.serverlist;
		fs.writeFile('steam-servers.json', JSON.stringify(servers.map(function(s) {
			var [host, port] = s.split(':');
			return {host, port};
		})), process.exit);
	}
);
