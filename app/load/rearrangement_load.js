//
// Import data into AIRR mongo repository for a public project. This is for
// the rearrangements. This assumes you are running in the docker container.
//

'use strict';

var csv = require('csv-parser');
var fs = require('fs');
var MongoClient = require('mongodb').MongoClient;
var assert = require('assert');
var Q = require('q');
const zlib = require('zlib');

// Server environment config
var config = require('../config/config');
var mongoSettings = require('../config/mongoSettings');

// Delete all rearrangements for a repertoire_id or for
// just a given load_set.
function deleteLoadSet(repertoire_id, load_set) {
    var deferred = Q.defer();

    // get connection to database
    MongoClient.connect(mongoSettings.url, async function(err, db) {
        if (err) {
            var msg = "Could not connect to database: " + err;
            console.error(msg);
            deferred.reject(new Error(msg))
        } else {
            var v1airr = db.db(mongoSettings.dbname);
            var collection = v1airr.collection('rearrangement');

            // delete than insert repertoire
            var filter = {"repertoire_id":repertoire_id}
            if (load_set > 0)
                filter['vdjserver_load_set'] = load_set;
            console.log(filter);

            var result = await collection.deleteMany(filter);
            console.log('Deleted rearrangements: ' + result);
            db.close();
            deferred.resolve(result);
        }
    });

    return deferred.promise;
}

// Insert rearrangements for a repertoire.
// This function supports vdjserver_load_set which allows for a failed load to be
// restarted where it left off, though you need to know the last load set.
// Insertion will continue starting with the given load_set.
function insertRearrangement(repertoire_id, load_set, records) {
    var deferred = Q.defer();

    // get connection to database
    MongoClient.connect(mongoSettings.url, async function(err, db) {
        if (err) {
            var msg = "Could not connect to database: " + err;
            console.error(msg);
            deferred.reject(new Error(msg))
        } else {
            var v1airr = db.db(mongoSettings.dbname);
            var collection = v1airr.collection('rearrangement');

            // insert rearrangements
            //console.log(records[0]);
            var result = await collection.insertMany(records);
            console.log('Inserted rearrangements: ' + JSON.stringify(result['result']));
            db.close();
            deferred.resolve(result);
        }
    });

    return deferred.promise;
}

function processFile(filename, rep, load_set, load_set_start) {
    var deferred = Q.defer();

    var records = [];
    fs.createReadStream(filename)
        .pipe(zlib.createGunzip())
        .pipe(csv({separator:'\t'}))
        .on('data', (row) => {
            if (!row['repertoire_id']) row['repertoire_id'] = rep['repertoire_id'];
            if (row['repertoire_id'].length == 0) row['repertoire_id'] = rep['repertoire_id'];
            if (!row['data_processing_id'])
                row['data_processing_id'] = rep['data_processing'][0]['data_processing_id'];
            if (row['data_processing_id'].length == 0)
                row['data_processing_id'] = rep['data_processing'][0]['data_processing_id'];
            row['vdjserver_load_set'] = load_set
            //console.log(row);
            records.push(row);
            if (records.length == 10000) {
                if (load_set >= load_set_start) {
                    console.log('Inserting load set: ' + load_set);
                    //console.log('Total records: ' + total);
                    //console.log(records[0]);
                    insertRearrangement(rep['repertoire_id'], load_set, records);
                } else {
                    console.log('Skipping load set: ' + load_set);
                }
                ++load_set;
                records = [];
            }
        })
        .on('end', () => {
            if (records.length > 0) {
                if (load_set >= load_set_start) {
                    console.log('Inserting load set: ' + load_set);
                    //console.log('Total records: ' + total);
                    insertRearrangement(rep['repertoire_id'], load_set, records);
                }
            }
            console.log('AIRR TSV file successfully processed');
            deferred.resolve(load_set);
        });

    return deferred.promise;
}

console.log('Load AIRR rearrangements into VDJServer data repository.');
var myArgs = process.argv.slice(2);
if (myArgs.length != 3) {
    console.log('usage: node rearrangement_load.js load_set repertoire_file directory_prefix');
    return;
}

console.log(mongoSettings.url);

var directory_prefix = myArgs[2];
var text = fs.readFileSync(myArgs[1]);
var data = JSON.parse(text);
var reps = data['Repertoire'];

var load_set_start = parseInt(myArgs[0], 10);

(async function() {
    for (var i in reps) {
        var r = reps[i];
        if (!r['repertoire_id']) {
            console.error('Repertoire is missing repertoire_id');
            return;
        }
        if (r['repertoire_id'].length == 0) {
            console.error('Repertoire is missing repertoire_id');
            return;
        }

        var result = await deleteLoadSet(r['repertoire_id'], load_set_start);

        var primary = null;
        for (var j in r['data_processing']) {
            if (r['data_processing'][j]['primary']) {
                primary = j;
                break;
            }
        }
        if (primary == null) primary = 0;
        var files = r['data_processing'][primary]['data_processing_files'];
        console.log(files);

        var total = 0;
        var load_set = 0;
        for (var f in files) {
            console.log('AIRR rearrangement file: ' + directory_prefix + '/' + files[f]);
            load_set = await processFile(directory_prefix + '/' + files[f], r, load_set, load_set_start);
            console.log('Final load set:' + load_set);
        }

        console.log(i);
    };
})();
