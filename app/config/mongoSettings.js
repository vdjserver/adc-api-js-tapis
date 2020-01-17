module.exports = mongoSettings = {

    // MongoDB Settings
    hostname: process.env.MONGODB_HOST,
    dbname: process.env.MONGODB_DB,
    username: process.env.MONGODB_USER,
    userSecret: process.env.MONGODB_SECRET,
    url: null
};

if (mongoSettings.username) {
    mongoSettings.url = 'mongodb://'
        + mongoSettings.username + ':' + mongoSettings.userSecret + '@'
        + mongoSettings.hostname + ':27017/' + mongoSettings.dbname;
} else {
    mongoSettings.url = 'mongodb://'
        + mongoSettings.hostname + ':27017/' + mongoSettings.dbname;
}
