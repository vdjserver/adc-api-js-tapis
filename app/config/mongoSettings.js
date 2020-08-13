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

console.log('VDJ-ADC-API INFO: Using query collection: ' + mongoSettings.queryCollection);
console.log('VDJ-ADC-API INFO: Using load collection: ' + mongoSettings.loadCollection);

if (mongoSettings.username) {
    mongoSettings.url = 'mongodb://'
        + mongoSettings.username + ':' + mongoSettings.userSecret + '@'
        + mongoSettings.hostname + ':27017/' + mongoSettings.dbname;
} else {
    mongoSettings.url = 'mongodb://'
        + mongoSettings.hostname + ':27017/' + mongoSettings.dbname;
}
