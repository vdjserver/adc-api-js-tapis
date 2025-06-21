
'use strict';

var path = require('path');
var fs = require('fs');
var yaml = require('js-yaml');
var $RefParser = require("@apidevtools/json-schema-ref-parser");
var airr = require('airr-js');
var vdj_schema = require('vdjserver-schema');
var config = require('./config');
var context = 'meta_load_records';
var LineByLineReader = require('line-by-line');

// Tapis
var tapisSettings = require('vdj-tapis-js/tapisSettings');
var tapisIO = tapisSettings.get_default_tapis(config);
var ServiceAccount = tapisIO.serviceAccount;
var GuestAccount = tapisIO.guestAccount;
var authController = tapisIO.authController;
var webhookIO = require('vdj-tapis-js/webhookIO');

//
// Insert raw records into meta database
//

if (process.argv.length != 3) {
    console.error('Usage: node meta_load_records.js jsonl_file');
    process.exit(1);
}

var projs = {};
var reps = {};
// testing
var skip_save = true;

// Verify we can login with guest and service account
ServiceAccount.getToken()
    .then(function(serviceToken) {
        config.log.info(context, 'Successfully acquired service token.', true);

        // wait for the AIRR schema to be loaded
        return airr.load_schema();
    })
    .then(function() {
        config.log.info(context, 'Loaded AIRR Schema version ' + airr.get_info()['version']);

        // wait for the VDJServer schema to be loaded
        return vdj_schema.load_schema();
    })
    .then(function() {
        return new Promise((resolve, reject) => {
            config.log.info(context, 'Loaded VDJServer Schema version ' + vdj_schema.get_info()['version']);
    
            // Connect schema to vdj-tapis
            tapisIO.init_with_schema(vdj_schema);
    
            config.log.info(context, 'Processing meta records from file: ' + process.argv[2]);
    
            var lr = new LineByLineReader(process.argv[2]);
            let cnt = 0;
            let docs = [];
    
            lr.on('error', function (err) {
                // 'err' contains error object
                config.log.error(context, 'Error processing line: ' + err);
                process.exit(1);
            });
    
            lr.on('line', async function (line) {
                try {
                    ++cnt;
                    let data = JSON.parse(line);
    
                    docs.push(data);
                    if (docs.length == 1000) {
                        config.log.info(context, 'Number of records to be inserted: ' + docs.length);
                        lr.pause();

                        if (skip_save) {
                            config.log.info(context, 'skipping save.');
                        } else {
                            var obj = await tapisIO.createMultipleDocuments(docs)
                                .catch(function(error) {
                                    config.log.error(context, 'tapisIO.createMultipleDocuments, error: ' + error);
                                    process.exit(1);
                                });
            
                            console.log(obj.length);
                        }
                        docs = [];

                        lr.resume();
                    }
                } catch (e) {
                    config.log.error(context, 'Error parsing line: ' + e);
                    process.exit(1);
                }
            });
            
            lr.on('end', async function () {
                // All lines are read, file is closed now.
                config.log.info(context, 'Processing done, total records: ' + cnt);
                config.log.info(context, 'Number of records to be inserted: ' + docs.length);
                if (skip_save) {
                    config.log.info(context, 'skipping save.');
                } else {
                    var obj = await tapisIO.createMultipleDocuments(docs)
                        .catch(function(error) {
                            config.log.error(context, 'tapisIO.createMultipleDocuments, error: ' + error);
                            process.exit(1);
                        });
    
                    console.log(obj.length);
                }
                resolve();
            });
        });
    })
    .catch(function(error) {
        var msg = config.log.error(context, 'Error during load.\n' + error);
    });
