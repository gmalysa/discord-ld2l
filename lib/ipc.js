/**
 * IPC functions, used to build things that communicate through redis
 */

const logger = require('../logger.js');

/**
 * Create a Chain-callable that sends a command to dota and waits for a response,
 * with a single argument passed through that will also identify replies
 * @param[in] keyword The response queue name and the result data are built from the
 *            one given keyword
 * @param[in] cmd The command constant to use in the command queue
 * @return a chain-callable that accepts a single parameter to be passed to dota,
 *         and then reads a single value matching that parameter when a response is 
 *         ready
 */
function createDotaCommand(keyword, cmd) {
	return function(env, after, arg0) {
		env.clients.redis.publish('dota:command', cmd+','+arg0);

		env.clients.redisSub('dota:'+keyword, arg0+'', function() {
			env.clients.redis.get('dota_'+keyword+'_'+arg0, env.$check(after));
		});
	}
}

module.exports = {
	createDotaCommand : createDotaCommand
};
