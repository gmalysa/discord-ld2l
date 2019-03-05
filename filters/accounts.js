module.exports = function(db) {
	var cols = {
		steamid : db.int_t,
		discordid : [db.varchar_t, 25],
		mention : [db.varchar_t, 25]
	};

	db.add_filter("accounts", new db("accounts", cols, {}));
}
