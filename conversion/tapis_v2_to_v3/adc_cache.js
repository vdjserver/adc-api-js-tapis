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
    console.error('Usage: node adc_cache.js json_file');
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
    
            config.log.info(context, 'Processing ADC cache records from file: ' + process.argv[2]);
    
            var lr = new LineByLineReader(process.argv[2]);
            let cnt = 0;
            let docs = [];
            var found = false;

            lr.on('error', function (err) {
                // 'err' contains error object
                config.log.error(context, 'Error processing line: ' + err);
                process.exit(1);
            });
    
            lr.on('line', function (line) {
                try {
                    ++cnt;
                    let data = JSON.parse(line);
                    if (data['name'] == 'adc_cache') {
                        if (found) {
                            config.log.info(context, 'More than one adc_cache record found.' + data);
                            process.exit(1);
                        }

                        // no conversion needed
                        found = true;
                        docs.push(data);
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

                    console.log(obj);
                }
                resolve();
            });
        });
    })
    .then(function() {
        return new Promise((resolve, reject) => {
            config.log.info(context, 'Loaded VDJServer Schema version ' + vdj_schema.get_info()['version']);
    
            // Connect schema to vdj-tapis
            tapisIO.init_with_schema(vdj_schema);
    
            config.log.info(context, 'Processing ADC cache records from file: ' + process.argv[2]);
    
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
                    if (data['name'] == 'adc_cache_study') {

                        // conversion
                        var extras = { uuid: data['uuid'], created: data['created'], lastUpdated: data['lastUpdated'] };
                        data['extras'] = extras;

                        // create postit
                        if (Array.isArray(data['value']['archive_file'])) {
                            let urls = [];
                            let postit_ids = [];
                            for (let i in data['value']['archive_file']) {
                                let fileobj = { allowedUses: -1, validSeconds: 2000000000 };
                                fileobj['path'] = data['value']['archive_file'][i];
                                var obj = await tapisIO.createADCDownloadCachePostit(data['uuid'], fileobj)
                                    .catch(function(error) {
                                        config.log.error(context, 'tapisIO.createADCDownloadCachePostit, error: ' + error);
                                        process.exit(1);
                                    });
                                console.log(obj);
                                urls.push(obj['result']['redeemUrl']);
                                postit_ids.push(obj['result']['id']);
                            }
                            data['value']['download_url'] = urls;
                            data['value']['postit_id'] = postit_ids;
                        } else {
                            let fileobj = { allowedUses: -1, validSeconds: 2000000000 };
                            fileobj['path'] = data['value']['archive_file'];
                            var obj = await tapisIO.createADCDownloadCachePostit(data['uuid'], fileobj)
                                .catch(function(error) {
                                    config.log.error(context, 'tapisIO.createADCDownloadCachePostit, error: ' + error);
                                    process.exit(1);
                                });
                            console.log(obj);
                            data['value']['download_url'] = obj['result']['redeemUrl'];
                            data['value']['postit_id'] = obj['result']['id'];
                        }

                        docs.push(data);
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

                    console.log(obj);
                }
                resolve();
            });
        });
    })
    .then(function() {
        return new Promise((resolve, reject) => {
            config.log.info(context, 'Processing ADC cache records from file: ' + process.argv[2]);
    
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
                    if (data['name'] == 'adc_cache_repertoire') {
                        // conversion
                        data['value']['download_url'] = null;
                        data['value']['postit_id'] = null;

                        var extras = { uuid: data['uuid'], created: data['created'], lastUpdated: data['lastUpdated'] };
                        data['extras'] = extras;
    
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
