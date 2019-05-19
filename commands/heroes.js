/**
 * Get details about a hero
 */

const _ = require('underscore');
const Discord = require('discord.js');
const dotaconstants = require('dotaconstants');
const fl = require('flux-link');
const logger = require('../logger.js');
const sprintf = require('sprintf-js').sprintf;
const util = require('../util.js');

/**
 * Remap short terms to full english words
 */
function attributeName(attr) {
	switch (attr) {
		case "agi": return "agility";
		case "int": return "intelligence";
		case "str": return "strength";
	}
	return "agility";
}

/**
 * Find the hero's level 1 damage range
 */
function getHeroDamage(hero) {
	var damage = 0;
	switch (hero.primary_attr) {
		case "agi":
			damage = hero.base_agi;
			break;
		case "int":
			damage = hero.base_int;
			break;
		case "str":
			damage = hero.base_str;
			break;
	}

	return (hero.base_attack_min+damage)+'-'+(hero.base_attack_max+damage);
}

/**
 * Mapping of ability number to hotkey
 */
const ability_map = ['Q', 'W', 'E', 'D', 'F', 'R'];

/**
 * Format a typical ability, this procedure is designed for use with map over
 * the abilities array or a portion of the abilities array
 */
function formatAbility(ability, index) {
	if ('generic_hidden' != ability) {
		return sprintf(
			'**%s** - %s',
			ability_map[index],
			dotaconstants.abilities[ability].dname
		);
	}
	else {
		return '';
	}
}

/**
 * Get the list of abilities with hotkey mappings for a specific hero, and include
 * special handling for heroes that do not work with the way data is specified in
 * dotaconstants
 * @param[in] hero object from heroes.json
 */
function getHeroAbilities(hero) {
	var abilities = [];
	var hero_abilities = dotaconstants.hero_abilities[hero.name];

	switch (hero.name) {
		case 'npc_dota_hero_invoker':
			abilities = abilities.concat([
				'**Q** - ' + dotaconstants.abilities['invoker_quas'].dname,
				'**W** - ' + dotaconstants.abilities['invoker_wex'].dname,
				'**E** - ' + dotaconstants.abilities['invoker_exort'].dname,
				'**R** - ' + dotaconstants.abilities['invoker_invoke'].dname
			]);

			abilities.push('Invoked Spells:');

			// 6-8 and talents 0-6 are real spells
			abilities = abilities.concat(hero_abilities.abilities.slice(6).map(function (a) {
				return '- ' + dotaconstants.abilities[a].dname;
			}));

			abilities = abilities.concat(hero_abilities.talents.slice(0, 7).map(function (a) {
				return '- ' + dotaconstants.abilities[a.name].dname;
			}));
			break;

		case 'npc_dota_hero_monkey_king':
			abilities = abilities.concat(hero_abilities.abilities.slice(0, 6).map(formatAbility));
			break;

		default:
			abilities = abilities.concat(hero_abilities.abilities.map(formatAbility));
			break;
	}

	return _.without(abilities, '');
}

/**
 * Look up a hero, format a message explaining it, and send it back
 */
var hero = new fl.Chain(
	function(env, after) {
		env.testName = env.words.slice(1).join(' ');
		after(env.testName);
	},
	util.dotaHeroSearch,
	function(env, after, matches) {
		if (matches.length == 0) {
			var message = sprintf(
				'Couldn\'t find a hero matching `%s`',
				util.discordEscape(env.testName)
			);
			env.message.channel.send(message);
			after();
			return;
		}

		// Multiple matches?
		var hero = matches[0];

		var description = sprintf(
			'%s is a %s %s hero.',
			hero.localized_name,
			hero.attack_type.toLowerCase(),
			attributeName(hero.primary_attr)
		);

		var attributes = [
			sprintf('Strength: %d + %f', hero.base_str, hero.str_gain),
			sprintf('Agility: %d + %f', hero.base_agi, hero.agi_gain),
			sprintf('Intelligence: %d + %f', hero.base_int, hero.int_gain),
			sprintf('Damage: %s', getHeroDamage(hero)),
			sprintf('Movespeed: %d', hero.move_speed)
		];

		if (hero.attack_type != "Melee")
			attributes.push(sprintf('Attack Range: %d', hero.attack_range));

		var roles = hero.roles.join(', ');
		var abilities = getHeroAbilities(hero);

		var embed = new Discord.RichEmbed()
			.setTitle(hero.localized_name)
			.setURL('https://dota2.gamepedia.com/'+hero.localized_name.replace(' ', '_'))
			.setDescription(description)
			.setThumbnail('http://cdn.dota2.com/'+hero.img)
			.addField('Attributes', attributes.join('\n'), true)
			.addField('Abilities', abilities.join('\n'), true)
			.addField('Roles', roles)

		env.message.channel.send(embed);
		after();
	}
).use_local_env(true);

module.exports = function(commands) {
	commands['hero'] = hero;
};
