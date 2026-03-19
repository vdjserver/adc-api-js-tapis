'use strict';

//
// rearrangement.js
// Rearrangement end points
//
// VDJServer Community Data Portal
// ADC API for VDJServer
// https://vdjserver.org
//
// Copyright (C) 2020-2025 The University of Texas Southwestern Medical Center
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

var RearrangementController = {};
module.exports = RearrangementController;

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
var mongoIO = require('vdj-tapis-js/mongoIO');
var mongoSettings = require('vdj-tapis-js/mongoSettings');

var ObjectId = require('mongodb').ObjectId;

function getInfoObject() {
    var info = { };
    var schema = airr.get_info();
    info['title'] = config.info.description;
    info['description'] = 'VDJServer ADC API response for rearrangement query'
    info['version'] = schema.version;
    info['contact'] = config.info.contact;
    return info;
}

// get a single rearrangement
RearrangementController.getRearrangement = async function(req, res) {
    var context = 'RearrangementController.getRearrangement';

    var get_sequence_id = req.params.sequence_id;
    config.log.info(context, 'getRearrangement: ' + get_sequence_id);

    var result = {};
    var result_message = "Server error";
    var results = [];

    var queryRecord = {
        endpoint: 'rearrangement',
        method: 'GET',
        query: get_sequence_id,
        ip: req.ip,
        status: 'unknown',
        message: null,
        count: null,
        start: Date.now()
    };

    var collection = 'rearrangement' + mongoSettings.queryCollection;
    var query = { "_id": ObjectId(get_sequence_id) };

    // all AIRR fields
    var all_fields = [];
    var airr_schema = airr.get_schema('Rearrangement')['definition'];
    airr.collectFields(airr_schema, 'airr-schema', all_fields, null);

    // construct info object for response
    var info = getInfoObject();

    var clean_record = adc_mongo_query.endpoint_map['rearrangement'];
    let process_record = function(record) {
        if (!record) return;
        var entry = null;

        // clean record
        entry = clean_record(record, airr_schema, null, all_fields);

        if (entry) results.push(entry);
        else config.log.error(context, "clean record returned a null object.");
    }

    let msg = null;
    await mongoIO.performQuery(collection, query, null, null, null, process_record)
        .catch(function(error) {
            msg = config.log.error(context, "mongoIO.performQuery error: " + error);
        });
    if (msg) {
        res.status(500).json({"message":result_message});
        webhookIO.postToSlack(msg);
        queryRecord['status'] = 'error';
        queryRecord['message'] = msg;
        queryRecord['end'] = Date.now();
        return tapisIO.recordQuery(queryRecord);
    }

    res.json({"Info":info,"Rearrangement":results});

    queryRecord['count'] = results.length;
    queryRecord['status'] = 'success';
    queryRecord['end'] = Date.now();
    return tapisIO.recordQuery(queryRecord);
}

RearrangementController.queryRearrangements = async function(req, res) {
    var context = 'RearrangementController.queryRearrangements';

    config.log.info(context, 'start');

    var results = [];
    var result = {};
    var result_flag = false;
    var result_message = "Unknown error";

    // 4 min response timeout
    res.connection.setTimeout(4 * 60 * 1000);
    //console.log(res.connection);

    var bodyData = req.body;

    var queryRecord = {
        endpoint: 'rearrangement',
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
    var airr_schema = airr.get_schema('Rearrangement')['definition'];
    if (bodyData['include_fields']) {
        airr.collectFields(airr_schema, bodyData['include_fields'], all_fields, null);
        //if (config.debug) console.log(all_fields);
    }
    // collect all AIRR schema fields
    var schema_fields = [];
    airr.collectFields(airr_schema, 'airr-schema', schema_fields, null);

    // field projection
    // NOTE: we actually leave out the projection from the query to avoid it becoming too large
    var projection = {};
    if (bodyData['fields'] != undefined) {
        var fields = bodyData['fields'];
        //if (config.debug) console.log('fields: ', fields);
        if (! (fields instanceof Array)) {
            result_message = "fields parameter is not an array.";
            res.status(400).json({"message":result_message});
            queryRecord['status'] = 'reject';
            queryRecord['message'] = result_message;
            tapisIO.recordQuery(queryRecord);
            return;
        }
        for (let i = 0; i < fields.length; ++i) {
            if (fields[i] == '_id') continue;
            if (fields[i] == '_etag') continue;
            projection[fields[i]] = 1;
        }
        projection['_id'] = 1;

        // add AIRR required fields to projection
        // NOTE: projection will not add a field if it is not already in the document
        // so below after the data has been retrieved, missing fields need to be
        // added with null values.
        if (all_fields.length > 0) {
            for (var r in all_fields) projection[all_fields[r]] = 1;
        }

        // add to field list so will be put in response if necessary
        for (let i = 0; i < fields.length; ++i) {
            if (fields[i] == '_id') continue;
            all_fields.push(fields[i]);
        }
    }
    //if (config.debug) console.log(projection);

    // format parameter
    var format = 'json';
    if (bodyData['format'] != undefined)
        format = bodyData['format'];
    if ((format != 'json') && (format != 'tsv')) {
        result_message = "Unsupported format (" + format + ").";
        res.status(400).json({"message":result_message});
        queryRecord['status'] = 'reject';
        queryRecord['message'] = result_message;
        tapisIO.recordQuery(queryRecord);
        return;
    }

    // we need to convert ADC API from/size to page/pagesize
    //var page = 1;
    //var pagesize = config.max_size;

    // size parameter
    var size = config.max_size;
    if (bodyData['size'] != undefined) {
        size = bodyData['size'];
        size = Math.floor(size);
    }
    if (size < 0) {
        result_message = "Negative size (" + size + ") not allowed.";
        res.status(400).json({"message":result_message});
        queryRecord['status'] = 'reject';
        queryRecord['message'] = result_message;
        tapisIO.recordQuery(queryRecord);
        return;
    }
    // normal query max
    if (size > config.max_size) {
        result_message = "Size too large (" + size + "), maximum size is " + config.max_size;
        res.status(400).json({"message":result_message});
        queryRecord['status'] = 'reject';
        queryRecord['message'] = result_message;
        tapisIO.recordQuery(queryRecord);
        return;
    }

    // from parameter
    // page is 1-indexed
    var from = 0;
    //var from_skip = 0;
    //var size_stop = pagesize;
    if (bodyData['from'] != undefined) {
        from = bodyData['from'];
        from = Math.floor(from);
    }
    if (from < 0) {
        result_message = "Negative from (" + from + ") not allowed.";
        res.status(400).json({"message":result_message});
        queryRecord['status'] = 'reject';
        queryRecord['message'] = result_message;
        tapisIO.recordQuery(queryRecord);
        return;
    //} else {
    //    page = Math.trunc(from / pagesize) + 1;
    //    from_skip = from % pagesize;
    //    size_stop = from_skip + size;
    }

    // we might need to do a second query to get the rest
    //var second_size = 0;
    //if ((from + size) > page * pagesize) {
    //    second_size = (from + size) - page * pagesize;
    //}

    // construct query string
    var filter = {};
    var query = undefined;
    if (bodyData['filters'] != undefined) {
        filter = bodyData['filters'];
        try {
            var error = { message: '' };
            // TODO: check support is off because we need the rearrangements extensions in the ADC API spec
            // it should be on to protect from bad queries on rearrangements
            query = adc_mongo_query.constructQueryOperation(airr, airr_schema, filter, error, false, true);
            //console.log(query);

            if (!query) {
                result_message = "Could not construct valid query. Error: " + error['message'];
                config.log.error(context, result_message);
                res.status(400).json({"message":result_message});
                queryRecord['status'] = 'reject';
                queryRecord['message'] = result_message;
                tapisIO.recordQuery(queryRecord);
                return;
            }
        } catch (e) {
            result_message = "Could not construct valid query: " + e;
            config.log.error(context, result_message);
            res.status(400).json({"message":result_message});
            queryRecord['status'] = 'reject';
            queryRecord['message'] = result_message;
            tapisIO.recordQuery(queryRecord);
            return;
        }
    }
    var facets = bodyData['facets'];

    // construct info object for response
    var info = getInfoObject();

    var collection = 'rearrangement' + mongoSettings.queryCollection;
    if (!facets) {
        // perform non-facets query
        config.log.info(context, 'perform non-facets query');

        //console.log(query);
        if (query) query = JSON.parse(query);

        var clean_record = adc_mongo_query.endpoint_map['rearrangement'];
        let process_record = function(record) {
            //console.log(results.length);
            if (!record) return;

            // clean record
            var entry = clean_record(record, airr_schema, projection, all_fields);

            if (entry) results.push(entry);
        }

        let msg = null;
        await mongoIO.performQuery(collection, query, from, size, null, process_record)
            .catch(function(error) {
                msg = config.log.error(context, "facets error: " + error);
            });
        if (msg) {
            res.status(500).json({"message":result_message});
            webhookIO.postToSlack(msg);
            queryRecord['status'] = 'error';
            queryRecord['message'] = msg;
            queryRecord['end'] = Date.now();
            return tapisIO.recordQuery(queryRecord);
        }

        config.log.info(context, 'returning ' + results.length + ' records to client.');

        // format output
        if (format == 'json') {
            res.json({"Info":info,"Rearrangement":results});
        } else if (format == 'tsv') {
            res.setHeader('Content-Type', 'text/tsv');

            // write headers
            var headers = [];

            // if no projection
            if (Object.keys(projection).length == 0) {
                // then return all schema fields
                headers = schema_fields;
            } else {
                // else only return specified fields
                // schema fields first
                for (let p = 0; p < schema_fields.length; ++p) {
                    if (projection[schema_fields[p]]) headers.push(schema_fields[p]);
                }
                // add custom fields on end
                for (let p in projection) {
                    if (p == '_id') continue;
                    if (projection[p]) {
                        if (schema_fields.indexOf(p) >= 0) continue;
                        else headers.push(p);
                    }
                }
            }

            res.write(headers.join('\t'));
            res.write('\n');
            //if (config.debug) console.log(headers);

            var first = true;
            for (var r in results) {
                var entry = results[r]
                if (!first) {
                    res.write('\n');
                }  else {
                    first = false;
                }

                var vals = [];
                for (var i = 0; i < headers.length; ++i) {
                    var p = headers[i];
                    if (entry[p] == undefined) vals.push('');
                    else vals.push(entry[p]);
                }
                res.write(vals.join('\t'));
            }
        }
        if (format == 'tsv') res.write('\n');
        res.end();


        queryRecord['count'] = results.length;
        queryRecord['status'] = 'success';
        queryRecord['end'] = Date.now();
        return tapisIO.recordQuery(queryRecord);

    } else {

        // perform facets query
        var field = '$' + facets;
        if (!query) query = '{}';

        //console.log(bodyData);
        //console.log(JSON.stringify(bodyData));

        // optimization, check if its a single repertoire_id facet
        var single_rep_facet = false;
        var single_rep_id = null;
        if (facets == 'repertoire_id') {
            if (filter && filter['op'] == '=' && filter['content']['field'] == 'repertoire_id') {
                single_rep_facet = true;
                single_rep_id = filter['content']['value'];
            }
            if (filter && filter['op'] == 'in' && filter['content']['value'].length == 1) {
                single_rep_facet = true;
                query = '{"repertoire_id":"' + filter['content']['value'][0] + '"}';
                single_rep_id = filter['content']['value'][0];
            }
        }

        if (query) query = JSON.parse(query);

        if (single_rep_facet) {
            config.log.info(context, 'single repertoire facet.');


            let agg = [];
            if (query) agg.push({ $match: query });
            agg.push({ $group: { _id: field, count: { $sum: 1}} });
            return mongoIO.queryCount(collection, query)
                .then(function(record) {
                    //console.log(JSON.stringify(record));
                    var results = [];
                    if (record && record.length == 1) {
                        var entry = record[0];
                        var new_entry = {}
                        //new_entry[facets] = entry['_id'];
                        new_entry['count'] = entry['count'];
                        new_entry[facets] = single_rep_id;
                        //new_entry['count'] = record['_size'];
                        results.push(new_entry);
                    }
                    config.log.info(context, 'facets rearrangement query returning ' + results.length + ' results to client.');
                    queryRecord['count'] = results.length;
                    res.json({"Info":info,"Facet":results});
                })
/*                .then(function() {
                    queryRecord['status'] = 'success';
                    queryRecord['end'] = Date.now();
                    tapisIO.recordQuery(queryRecord);
                })*/
                .catch(function(error) {
                    var msg = config.log.error(context, "error: " + error
                        + '\nWhile performing query: ' + query);
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
            //console.log(query);

            //var field = '$' + facets;
            //if (!query) query = '{}';
            //if (query) query = JSON.parse(query);

            let msg = null;
            let results = await adc_mongo_query.performFacets(collection, query, facets)
                .catch(function(error) {
                    msg = config.log.error(context, "facets error: " + error);
                });
            if (msg) {
                res.status(500).json({"message":result_message});
                webhookIO.postToSlack(msg);
                queryRecord['status'] = 'error';
                queryRecord['message'] = msg;
                queryRecord['end'] = Date.now();
                return tapisIO.recordQuery(queryRecord);
            }

            config.log.info(context, 'facets rearrangement query returning ' + results.length + ' results to client.');
            queryRecord['count'] = results.length;
            res.json({"Info":info,"Facet":results});

            queryRecord['status'] = 'success';
            queryRecord['end'] = Date.now();
            return tapisIO.recordQuery(queryRecord);

        }
    }
}
