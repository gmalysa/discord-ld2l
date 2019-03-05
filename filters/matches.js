module.exports = function(db) {
	var cols = {
		format : db.int_t,
		matchid : [db.varchar_t, 25],
		steamid : db.int_t,
		when : db.datetime_t,
		region : db.int_t,
		lobby_type : db.int_t,
		game_mode : db.int_t,
		skill : db.int_t,
		solo : db.int_t,
		duration : db.int_t,
		side : db.int_t,
		winner : db.int_t,
		leaver : db.int_t,
		hero : db.int_t,
		level : db.int_t,
		kills : db.int_t,
		deaths : db.int_t,
		assists : db.int_t,
		gpm : db.int_t,
		xpm : db.int_t,
		hero_damage : db.int_t,
		tower_damage : db.int_t,
		hero_healing : db.int_t,
		randomed : db.int_t,
		dead_time : db.int_t
	};

	db.add_filter("matches", new db("matches", cols, {}));
}
