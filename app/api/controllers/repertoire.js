'use strict';

//
// repertoire.js
// Repertoire end points
//
// VDJServer Community Data Portal
// ADC API for VDJServer
// https://vdjserver.org
//
// Copyright (C) 2020 The University of Texas Southwestern Medical Center
//
// Author: Scott Christley <scott.christley@utsouthwestern.edu>
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published
// by the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.
//

var RepertoireController = {};
module.exports = RepertoireController;

// Server environment config
var config = require('../../config/config');

// Schema libraries
var airr = require('airr-js');
var vdj_schema = require('vdjserver-schema');

// Tapis
var tapisSettings = require('vdj-tapis-js/tapisSettings');
var tapisIO = tapisSettings.get_default_tapis();
var ServiceAccount = tapisIO.serviceAccount;
var GuestAccount = tapisIO.guestAccount;
var authController = tapisIO.authController;
var webhookIO = require('vdj-tapis-js/webhookIO');
var adc_mongo_query = require('vdj-tapis-js/adc_mongo_query');

function getInfoObject() {
    var info = { };
    var schema = airr.get_info();
    info['title'] = config.info.description;
    info['description'] = 'VDJServer ADC API response for repertoire query'
    info['version'] = schema.version;
    info['contact'] = config.info.contact;
    return info;
}

// Get a single repertoire
RepertoireController.getRepertoire = function(req, res) {
    var context = 'RepertoireController.getRepertoire';
    var get_repertoire_id = req.params.repertoire_id;

    //config.log.info(context, get_repertoire_id);

    var result = {};
    var result_message = "Server error";
    var results = [];

    var queryRecord = {
        endpoint: 'repertoire',
        method: 'GET',
        query: get_repertoire_id,
        ip: req.ip,
        status: 'unknown',
        message: null,
        count: null,
        start: Date.now()
    };

    var collection = 'repertoire' + tapisSettings.mongo_queryCollection;
    var query = { "repertoire_id": get_repertoire_id };

    // all AIRR fields
    var all_fields = [];
    var airr_schema = airr.get_schema('Repertoire')['definition'];
    airr.collectFields(airr_schema, 'airr-schema', all_fields, null);

    // construct info object for response
    var info = getInfoObject();

    return tapisIO.performQuery(collection, query, null, null, null)
        .then(function(record) {
            if (record.length == 0) {
                res.json({"Info":info,"Repertoire":[]});
                queryRecord['count'] = 0;
            } else {
                record = record[0];
                record = adc_mongo_query.cleanRecord(record);
                airr.addFields(record, all_fields, airr_schema);
                res.json({"Info":info,"Repertoire":[record]});
                queryRecord['count'] = 1;
            }
        })
        .then(function() {
            queryRecord['status'] = 'success';
            queryRecord['end'] = Date.now();
            tapisIO.recordQuery(queryRecord);
        })
        .catch(function(error) {
            var msg = config.log.error(context, 'tapisIO.performQuery error: ' + error);
            res.status(500).json({"message":result_message});
            webhookIO.postToSlack(msg);
            queryRecord['status'] = 'error';
            queryRecord['message'] = msg;
            queryRecord['end'] = Date.now();
            tapisIO.recordQuery(queryRecord);
            return;
        });
}

// Generic query repertoires
RepertoireController.queryRepertoires = function(req, res) {
    var context = 'RepertoireController.queryRepertoires';
    config.log.info(context, 'start');

    var results = [];
    var result = {};
    var result_flag = false;
    var result_message = "Unknown error";

    var bodyData = req.body;

    var queryRecord = {
        endpoint: 'repertoire',
        method: 'POST',
        query: bodyData,
        ip: req.ip,
        status: 'unknown',
        message: null,
        count: null,
        start: Date.now()
    };

    // check max query size
    var bodyLength = JSON.stringify(bodyData).length;
    if (bodyLength > config.info.max_query_size) {
        result_message = "Query size (" + bodyLength + ") exceeds maximum size of " + config.info.max_query_size + " characters.";
        config.log.error(context, result_message);
        res.status(400).json({"message":result_message});
        queryRecord['status'] = 'reject';
        queryRecord['message'] = result_message;
        tapisIO.recordQuery(queryRecord);
        return;
    }

    // AIRR fields
    var all_fields = [];
    var airr_schema = airr.get_schema('Repertoire')['definition'];
    airr.collectFields(airr_schema, 'airr-schema', all_fields, null);
    var include_fields = [];
    if (bodyData['include_fields']) {
        airr.collectFields(airr_schema, bodyData['include_fields'], include_fields, null);
    }

    // field projection
    var projection = {};
    if (bodyData['fields'] != undefined) {
        var fields = bodyData['fields'];
        //console.log('fields: ', fields);
        if (! (fields instanceof Array)) {
            result_message = "fields parameter is not an array.";
            queryRecord['status'] = 'reject';
            queryRecord['message'] = result_message;
            tapisIO.recordQuery(queryRecord);
            res.status(400).json({"message":result_message});
            return;
        }
        for (var i = 0; i < fields.length; ++i) {
            if (fields[i] == '_id') continue;
            if (fields[i] == '_etag') continue;
            projection[fields[i]] = 1;
        }

        // add AIRR required fields to projection
        // NOTE: projection will not add a field if it is not already in the document
        // so below after the data has been retrieved, missing fields need to be
        // added with null values.
        if (include_fields.length > 0) {
            for (var r in include_fields) projection[include_fields[r]] = 1;
        }

        // add to field list so will be put in response if necessary
        for (var i = 0; i < fields.length; ++i) {
            if (fields[i] == '_id') continue;
            include_fields.push(fields[i]);
        }
    }
    projection['_id'] = 0;

    // we need to convert ADC API from/size to page/pagesize
    var page = 1;
    var pagesize = config.max_size;

    // size parameter
    var size = 0;
    if (bodyData['size'] != undefined) {
        size = bodyData['size'];
        size = Math.floor(size);
    }
    if (size > config.max_size) {
        result_message = "Size too large (" + size + "), maximum size is " + config.max_size;
        queryRecord['status'] = 'reject';
        queryRecord['message'] = result_message;
        tapisIO.recordQuery(queryRecord);
        res.status(400).json({"message":result_message});
        return;
    }
    if (size < 0) {
        result_message = "Negative size (" + size + ") not allowed.";
        queryRecord['status'] = 'reject';
        queryRecord['message'] = result_message;
        tapisIO.recordQuery(queryRecord);
        res.status(400).json({"message":result_message});
        return;
    }

    // from parameter
    // page is 1-indexed
    var from = 0;
    var from_skip = 0;
    var size_stop = pagesize;
    if (bodyData['from'] != undefined) {
        from = bodyData['from'];
        from = Math.floor(from);
    }
    if (from < 0) {
        result_message = "Negative from (" + from + ") not allowed.";
        queryRecord['status'] = 'reject';
        queryRecord['message'] = result_message;
        tapisIO.recordQuery(queryRecord);
        res.status(400).json({"message":result_message});
        return;
    } else {
        page = Math.trunc(from / pagesize) + 1;
        from_skip = from % pagesize;
        size_stop = from_skip + size;
    }

    // we might need to do a second query to get the rest
    var second_size = 0;
    if ((from + size) > page * pagesize) {
        second_size = (from + size) - page * pagesize;
    }

    // construct query string
    var filter = {};
    var query = undefined;
    if (bodyData['filters'] != undefined) {
        filter = bodyData['filters'];
        try {
            var error = { message: '' };
            query = adc_mongo_query.constructQueryOperation(airr, airr_schema, filter, error);
            //console.log(query);

            if (!query) {
                result_message = "Could not construct valid query. Error: " + error['message'];
                config.log.error(context, result_message);
                queryRecord['status'] = 'reject';
                queryRecord['message'] = result_message;
                tapisIO.recordQuery(queryRecord);
                res.status(400).json({"message":result_message});
                return;
            }
        } catch (e) {
            result_message = "Could not construct valid query: " + e;
            config.log.error(context, result_message);
            queryRecord['status'] = 'reject';
            queryRecord['message'] = result_message;
            tapisIO.recordQuery(queryRecord);
            res.status(400).json({"message":result_message});
            return;
        }
    }
    var facets = bodyData['facets'];

    // construct info object for response
    var info = getInfoObject();

    var collection = 'repertoire' + tapisSettings.mongo_queryCollection;
    if (!facets) {
        // perform non-facets query
        config.log.info(context, 'perform non-facets query');

        //console.log(query);
        if (query) query = JSON.parse(query);

        // we just get all of them then manually do from/size
        return tapisIO.performMultiQuery(collection, query, projection, 1, pagesize)
            .then(function(records) {
                config.log.info(context, 'query returned ' + records.length + ' records.');
    
                if (records.length == 0) {
                    results = [];
                } else {
                    // loop through records, clean data
                    // and only retrieve desired from/size
                    for (var i in records) {
                        if (i < from) continue;
                        if ((size > 0) && (i >= (size + from))) break;
                        var record = records[i];
                        record = adc_mongo_query.cleanRecord(record);
    
                        // add any missing required fields
                        if (include_fields.length > 0) {
                            airr.addFields(records[i], include_fields, airr_schema);
                        } else {
                            airr.addFields(records[i], all_fields, airr_schema);
                        }
    
                        results.push(record);
                    }
                }
            })
            .then(function() {
                config.log.info(context, 'returning ' + results.length + ' records to client.');
                queryRecord['count'] = results.length;
                res.json({"Info":info,"Repertoire":results});
            })
            .then(function() {
                queryRecord['status'] = 'success';
                queryRecord['end'] = Date.now();
                tapisIO.recordQuery(queryRecord);
            })
            .catch(function(error) {
                var msg = config.log.error(context, "performQuery error: " + error);
                res.status(500).json({"message":result_message});
                webhookIO.postToSlack(msg);
                queryRecord['status'] = 'error';
                queryRecord['message'] = msg;
                queryRecord['end'] = Date.now();
                tapisIO.recordQuery(queryRecord);
            });
    } else {
        // perform facets query
        config.log.info(context, 'perform facets query');

        var field = '$' + facets;
        if (!query) query = '{}';
        if (query) query = JSON.parse(query);

        return tapisIO.performFacets(collection, query, field, 1, pagesize)
            .then(function(records) {
                if (records.length == 0) {
                    results = [];
                } else {
                    // loop through records, clean data
                    // and collapse arrays
                    for (var i in records) {
                        var new_entries = [];
                        var entry = records[i];
                        if (entry['_id'] instanceof Array) {
                            // get unique values
                            var values = [];
                            for (var j in entry['_id'])
                                if (entry['_id'][j] instanceof Array) {
                                    // array of arrays
                                    for (var k in entry['_id'][j]) {
                                        if (values.indexOf(entry['_id'][j][k]) < 0) values.push(entry['_id'][j][k]);
                                    }
                                } else {
                                    if (values.indexOf(entry['_id'][j]) < 0) values.push(entry['_id'][j]);
                                }
                            for (var j in values) {
                                var new_entry = {};
                                new_entry[facets] = values[j];
                                new_entry['count'] = entry['count'];
                                new_entries.push(new_entry);
                            }
                            //console.log(values);
                        } else {
                            // only single value
                            var new_entry = {};
                            new_entry[facets] = entry['_id'];
                            new_entry['count'] = entry['count'];
                            new_entries.push(new_entry);
                        }
                        //console.log(new_entries);
                        for (var j in new_entries) {
                            var found = false;
                            for (var k in results) {
                                if (new_entries[j][facets] == results[k][facets]) {
                                    results[k]['count'] += new_entries[j]['count'];
                                    found = true;
                                    break;
                                }
                            }
                            if (! found) results.push(new_entries[j]);
                        }
                    }
                }
                config.log.info(context, 'facets repertoire query returning ' + results.length + ' results to client.');
                queryRecord['count'] = results.length;
                res.json({"Info":info,"Facet":results});
            })
            .then(function() {
                queryRecord['status'] = 'success';
                queryRecord['end'] = Date.now();
                tapisIO.recordQuery(queryRecord);
            })
            .catch(function(error) {
                var msg = config.log.error(context, "facets error: " + error);
                res.status(500).json({"message":result_message});
                webhookIO.postToSlack(msg);
                queryRecord['status'] = 'error';
                queryRecord['message'] = msg;
                queryRecord['end'] = Date.now();
                tapisIO.recordQuery(queryRecord);
            });
    }
}
