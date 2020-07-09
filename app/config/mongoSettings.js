module.exports = mongoSettings = {

    // MongoDB Settings
    hostname: process.env.MONGODB_HOST,
    dbname: process.env.MONGODB_DB,
    username: process.env.MONGODB_USER,
    userSecret: process.env.MONGODB_SECRET,
    queryCollection: process.env.MONGODB_QUERY_COLLECTION,
    loadCollection: process.env.MONGODB_LOAD_COLLECTION,
    url: null
};

console.log(process.env);
console.log(JSON.stringify(process.env));
console.log(process.env.MONGODB_QUERY_COLLECTION);

if (mongoSettings.username) {
    mongoSettings.url = 'mongodb://'
        + mongoSettings.username + ':' + mongoSettings.userSecret + '@'
        + mongoSettings.hostname + ':27017/' + mongoSettings.dbname;
} else {
    mongoSettings.url = 'mongodb://'
        + mongoSettings.hostname + ':27017/' + mongoSettings.dbname;
}
