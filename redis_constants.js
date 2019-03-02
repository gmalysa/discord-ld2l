/**
 * Constants that are used to represent data in redis as integers
 */

module.exports = {
	STEAM : {
		DISCONNECTED : 0,
		CONNECTED : 1,
		LOGGED_IN : 2,
	},
	DOTA : {
		DISCONNECTED : 0,
		LOOKING_FOR_GC : 1,
		CONNECTED : 2
	},
	DOTA_CMD : {
		GET_PROFILE : 0,
		GET_RECENT_MATCHES : 1,
		GET_MATCH : 2,
	}
};
