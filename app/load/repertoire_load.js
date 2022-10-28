//
// Import data into AIRR mongo repository for a public project. This is for
// the repertoire metadata. This assumes you are running in the docker container.
//

'use strict';

var csv = require('csv-parser');
var fs = require('fs');
var MongoClient = require('mongodb').MongoClient;
var assert = require('assert');

// Server environment config
var config = require('../config/config');
var mongoSettings = require('../config/mongoSettings');

// Insert a repertoire by first deleting any repertoire with the same id
// then inserting the new repertoire
function insertRepertoire(rep) {
    // get connection to database
    MongoClient.connect(mongoSettings.url, function(err, db) {
        if (err) {
            console.error("Could not connect to database: " + err);
            return;
        } else {
            var v1airr = db.db(mongoSettings.dbname);
            var collection = v1airr.collection('repertoire');

            // delete than insert repertoire
            collection.deleteOne({"repertoire_id":rep['repertoire_id']})
                .then(function(result) {
                    console.log('Deleted repertoire: ' + rep['repertoire_id']);
                    return collection.insertOne(rep);
                })
                .then(function(result) {
                    console.log('Inserted repertoire: ' + rep['repertoire_id']);
                    db.close();
                });
        }
    });
}

console.log('Load AIRR repertoire metadata into repository.');
if (process.argv.length != 3) {
    console.log('usage: node repertoire_load.js repertoire_file');
    process.exit(1);
}

var myArgs = process.argv.slice(2);
console.log(myArgs);
console.log(mongoSettings.url);

var text = fs.readFileSync(myArgs[0]);
var data = JSON.parse(text);
var reps = data['Repertoire'];

for (var i in reps) {
    var r = reps[i];
    if (!r['repertoire_id']) {
        console.error('Repertoire is missing repertoire_id');
        process.exit(1);
    }
    if (r['repertoire_id'].length == 0) {
        console.error('Repertoire is missing repertoire_id');
        process.exit(1);
    }
    insertRepertoire(r);
}
