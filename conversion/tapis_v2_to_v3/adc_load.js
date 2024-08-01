'use strict';

var path = require('path');
var fs = require('fs');
var yaml = require('js-yaml');
var $RefParser = require("@apidevtools/json-schema-ref-parser");
var airr = require('airr-js');
var vdj_schema = require('vdjserver-schema');
var config = require('./config');
var context = 'adc_load';
var LineByLineReader = require('line-by-line');

// Tapis
var tapisSettings = require('vdj-tapis-js/tapisSettings');
var tapisIO = tapisSettings.get_default_tapis(config);
var ServiceAccount = tapisIO.serviceAccount;
var GuestAccount = tapisIO.guestAccount;
var authController = tapisIO.authController;
var webhookIO = require('vdj-tapis-js/webhookIO');

if (process.argv.length != 3) {
    console.error('Usage: node adc_load.js json_file');
    process.exit(1);
}

var projs = {};
var reps = {};
// testing
var skip_save = false;

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
    
            config.log.info(context, 'Processing ADC project load records from file: ' + process.argv[2]);
    
            var lr = new LineByLineReader(process.argv[2]);
            let cnt = 0;
            let docs = [];
    
            lr.on('error', function (err) {
                // 'err' contains error object
                config.log.error(context, 'Error processing line: ' + err);
                process.exit(1);
            });
    
            lr.on('line', function (line) {
                try {
                    ++cnt;
                    let data = JSON.parse(line);
                    if (data['name'] == 'projectLoad') {
                        // conversion
                        // 1. change name
                        data['name'] = 'adc_project_load';
                        // 2. project uuid
                        data['value']['projectUuid'] = data['associationIds'][0];
                        // 3. uuid and dates
                        var extras = { uuid: data['uuid'], created: data['created'], lastUpdated: data['lastUpdated'] };
                        data['extras'] = extras;
                        //console.log(data);
    
                        // 4. manual fixes and validation
                        if (data['value']['projectUuid'] == '497058493576909291-242ac117-0001-012') {
                            config.log.info(context, 'skipping record for project: ' + data['value']['projectUuid']);
                            return;
                        }
    
                        // 5. custom validation
                        if ((data['value']['collection'] != '_0') && (data['value']['collection'] != '_1')) {
                            config.log.info(context, 'invalid collection');
                            config.log.info(context, 'skipping obsolete record for project: ' + data['value']['projectUuid']);
                            return;
                            //process.exit(1);
                        }
    
                        if (! projs[data['value']['projectUuid']]) projs[data['value']['projectUuid']] = 1;
                        else projs[data['value']['projectUuid']] += 1;
    
                        // 6. save, instead of saving one-by-one, we save in bulk
                        // TODO: we would need to do in chunks if > 10K
                        //lr.pause();
                        docs.push(data);
                        //lr.resume();
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
                console.log(projs);
                if (skip_save) {
                    config.log.info(context, 'skipping save.');
                } else {
                    var obj = await tapisIO.createMultipleDocuments(docs)
                        .catch(function(error) {
                            config.log.error(context, 'tapisIO.createMultipleDocuments, error: ' + error);
                            process.exit(1);
                        });

                    console.log(obj);
                }
                resolve();
            });
        });
    })
    .then(function() {
        return new Promise((resolve, reject) => {
            config.log.info(context, 'Processing ADC rearrangement load records from file: ' + process.argv[2]);
    
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
                    if (data['name'] == 'rearrangementLoad') {
                        // conversion
                        // 1. change name
                        data['name'] = 'adc_rearrangement_load';
                        // 2. project uuid
                        data['value']['projectUuid'] = data['associationIds'][0];
                        // 3. uuid and dates
                        var extras = { uuid: data['uuid'], created: data['created'], lastUpdated: data['lastUpdated'] };
                        data['extras'] = extras;
    
                        // 4. manual fixes and validation
                        if (! projs[data['value']['projectUuid']]) {
                            config.log.info(context, 'not in project list, skipping record for project: ' + data['value']['projectUuid']);
                            return;
                        }
                        if (data['value']['collection'] == '_small') {
                            config.log.info(context, 'skipping _small collection record for project: ' + data['value']['projectUuid']);
                            return;
                        }
    
                        // 5. custom validation
                        if ((data['value']['collection'] != '_0') && (data['value']['collection'] != '_1')) {
                            config.log.info(context, 'invalid collection');
                            //config.log.info(context, 'skipping obsolete record for project: ' + data['value']['projectUuid']);
                            //return;
                            console.log(data);
                            process.exit(1);
                        }
    
                        if (! reps[data['value']['repertoire_id']]) reps[data['value']['repertoire_id']] = 1;
                        else reps[data['value']['repertoire_id']] += 1;
    
                        // 6. save, instead of saving one-by-one, we save in bulk
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
                    }
    
                } catch (e) {
                    config.log.error(context, 'Error parsing line: ' + e);
                    process.exit(1);
                }
            });
            
            lr.on('end', async function () {
                // All lines are read, file is closed now.
                config.log.info(context, 'Processing done, total records: ' + cnt);
                let tot = 0
                for (let i in reps) {
                    ++tot;
                    if (reps[i] != 2) {
                        config.log.info(context, 'more than 2 rearrangement load records: ' + i);
                    }
                }
                console.log(tot + ' repertoires.');
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
        var msg = config.log.error(context, 'Service could not be start.\n' + error);
        //console.trace(msg);
        webhookIO.postToSlack(msg);
        // continue in case its a temporary error
        //process.exit(1);
    });
