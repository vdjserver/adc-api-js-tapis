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
var agaveSettings = require('../../config/tapisSettings');
var mongoSettings = require('../../config/mongoSettings');
var airr = require('../helpers/airr-schema');

var assert = require('assert');

// Processing
var agaveIO = require('../vendor/agaveIO');
var webhookIO = require('../vendor/webhookIO');

// Node Libraries
var Queue = require('bull');

// API customization
var custom_file = undefined;
if (config.custom_file) {
    custom_file = require('../../config/' + config.custom_file);
}

// escape strings for regex, double \\ for restheart
var escapeString = function(text) {
    var encoded = text.replace(/\*/g, '\\\\\*');
    encoded = encoded.replace(/\+/g, '\\\\\+');
    return encoded;
}

/*
  Construct mongodb query based upon the filters parameters. The
  filters parameter is a JSON object that can be any number of nested
  levels, so we recursively construct the query.
*/
function constructQueryOperation(filter, error) {
    if (!filter['op']) {
        error['message'] = 'missing op';
        return null;
    }
    if (!filter['content']) {
        error['message'] = 'missing content';
        return null;
    }

    var content = filter['content'];

    // TODO: do we need to handle value being an array when a single value is expected?
    // TODO: validate queryable field names?

    // determine type from schema, default is string
    var content_type = null;
    var content_properties = null;
    if (content['field'] != undefined) {
        var schema = global.airr['Repertoire'];
        var props = schema;

        // traverse down the object schema hierarchy to find field definition
        var objs = content['field'].split('.');
        for (var i = 0; i < objs.length; ++i) {
            var p = objs[i];
            if (props.type == 'array') {
                if (props.items.type == 'object') {
                    props = props.items.properties[p];
                } else if (props.items['allOf'] != undefined) {
                    var new_props = undefined;
                    for (var j = 0; j < props.items['allOf'].length; ++j) {
                        if (props.items['allOf'][j].properties != undefined)
                            if (props.items['allOf'][j].properties[p] != undefined) {
                                new_props = props.items['allOf'][j].properties[p];
                                break;
                            }
                    }
                    props = new_props;
                }
            } else if (props.type == 'object') {
                props = props.properties[p];
            } else props = undefined;
            if (props == undefined) break;
        }

        if (props != undefined) {
            if (props['type'] != undefined) {
                content_type = props['type'];
                content_properties = props;
            }
        } else {
            if (config.debug) console.log('VDJ-ADC-API INFO: ' + content['field'] + ' is not found in AIRR schema.');
        }
    }
    // if not in schema then maybe its a custom field
    // so use the same type as the value.
    if (!content_type) content_type = typeof content['value'];
    if (config.debug) console.log('type: ' + content_type);

    // verify the value type against the field type
    // stringify the value properly for the query
    var content_value = undefined;
    if (content['value'] != undefined) {
        if (content['value'] instanceof Array) {
            // we do not bother checking the types of array elements
            content_value = JSON.stringify(content['value']);
        } else {
            // if the field is an array
            // then check if items are basic type
            if (content_type == 'array') {
                if (content_properties && content_properties['items'] && content_properties['items']['type'])
                    content_type = content_properties['items']['type'];
            }

            switch(content_type) {
            case 'integer':
            case 'number':
                if (((typeof content['value']) != 'integer') && ((typeof content['value']) != 'number')) {
                    error['message'] = "value has wrong type '" + typeof content['value'] + "', should be integer or number.";
                    return null;
                }
                content_value = content['value'];
                break;
            case 'boolean':
                if ((typeof content['value']) != 'boolean') {
                    error['message'] = "value has wrong type '" + typeof content['value'] + "', should be boolean.";
                    return null;
                }
                content_value = content['value'];
                break;
            case 'string':
                if ((typeof content['value']) != 'string') {
                    error['message'] = "value has wrong type '" + typeof content['value'] + "', should be string.";
                    return null;
                }
                content_value = '"' + content['value'] + '"';
                break;
            default:
                error['message'] = "unsupported content type: " + content_type;
                return null;
            }
        }
    }

    // query operators
    switch(filter['op']) {
    case '=':
        if (content['field'] == undefined) {
            error['message'] = 'missing field for = operator';
            return null;
        }
        if (content_value == undefined) {
            error['message'] = 'missing value for = operator';
            return null;
        }
        return '{"' + content['field'] + '":' + content_value + '}';

    case '!=':
        if (content['field'] == undefined) {
            error['message'] = 'missing field for != operator';
            return null;
        }
        if (content_value == undefined) {
            error['message'] = 'missing value for != operator';
            return null;
        }
        return '{"' + content['field'] + '": { "$ne":' + content_value + '}}';

    case '<':
        if (content['field'] == undefined) {
            error['message'] = 'missing field for < operator';
            return null;
        }
        if (content_value == undefined) {
            error['message'] = 'missing value for < operator';
            return null;
        }
        return '{"' + content['field'] + '": { "$lt":' + content_value + '}}';

    case '<=':
        if (content['field'] == undefined) {
            error['message'] = 'missing field for <= operator';
            return null;
        }
        if (content_value == undefined) {
            error['message'] = 'missing value for <= operator';
            return null;
        }
        return '{"' + content['field'] + '": { "$lte":' + content_value + '}}';

    case '>':
        if (content['field'] == undefined) {
            error['message'] = 'missing field for > operator';
            return null;
        }
        if (content_value == undefined) {
            error['message'] = 'missing value for > operator';
            return null;
        }
        return '{"' + content['field'] + '": { "$gt":' + content_value + '}}';

    case '>=':
        if (content['field'] == undefined) {
            error['message'] = 'missing field for >= operator';
            return null;
        }
        if (content_value == undefined) {
            error['message'] = 'missing value for >= operator';
            return null;
        }
        return '{"' + content['field'] + '": { "$gte":' + content_value + '}}';

    case 'contains':
        if (content_type != 'string') {
            error['message'] = "'contains' operator only valid for strings";
            return null;
        }
        if (content['field'] == undefined) {
            error['message'] = "missing field for 'contains' operator";
            return null;
        }
        if (content_value == undefined) {
            error['message'] = "missing value for 'contains' operator";
            return null;
        }
        return '{"' + content['field'] + '": { "$regex":' + escapeString(content_value) + ', "$options": "i"}}';

    case 'is': // is missing
    case 'is missing':
        if (content['field'] == undefined) {
            error['message'] = "missing field for 'is missing' operator";
            return null;
        }
        return '{"' + content['field'] + '": { "$exists": false } }';

    case 'not': // is not missing
    case 'is not missing':
        if (content['field'] == undefined) {
            error['message'] = "missing field for 'is not missing' operator";
            return null;
        }
        return '{"' + content['field'] + '": { "$exists": true } }';

    case 'in':
        if (content_value == undefined) {
            error['message'] = "missing value for 'in' operator";
            return null;
        }
        if (! (content['value'] instanceof Array)) {
            error['message'] = "value for 'in' operator is not an array";
            return null;
        }
        if (content['field'] == undefined) {
            error['message'] = "missing field for 'in' operator";
            return null;
        }
        return '{"' + content['field'] + '": { "$in":' + content_value + '}}';

    case 'exclude':
        if (content_value == undefined) {
            error['message'] = "missing value for 'exclude' operator";
            return null;
        }
        if (! (content['value'] instanceof Array)) {
            error['message'] = "value for 'exclude' operator is not an array";
            return null;
        }
        if (content['field'] == undefined) {
            error['message'] = "missing field for 'exclude' operator";
            return null;
        }
        return '{"' + content['field'] + '": { "$nin":' + content_value + '}}';

    case 'and':
        if (! (content instanceof Array)) {
            error['message'] = "content for 'and' operator is not an array";
            return null;
        }
        if (content.length < 2) {
            error['message'] = "content for 'and' operator needs at least 2 elements";
            return null;
        }

        var exp_list = [];
        for (var i = 0; i < content.length; ++i) {
            var exp = constructQueryOperation(content[i], error);
            if (exp == null) return null;
            exp_list.push(exp);
        }
        return '{ "$and":[' + exp_list + ']}';

    case 'or':
        if (! (content instanceof Array)) {
            error['message'] = "content for 'or' operator is not an array";
            return null;
        }
        if (content.length < 2) {
            error['message'] = "content for 'or' operator needs at least 2 elements";
            return null;
        }

        var exp_list = [];
        for (var i = 0; i < content.length; ++i) {
            var exp = constructQueryOperation(content[i], error);
            if (exp == null) return null;
            exp_list.push(exp);
        }
        return '{ "$or":[' + exp_list + ']}';

    default:
        error['message'] = 'unknown operator in filters: ' + filter['op'];
        return null;
    }

    // should not get here
    return null;
}

// Get a single repertoire
RepertoireController.getRepertoire = function(req, res) {
    var get_repertoire_id = req.params.repertoire_id;
    if (config.debug) console.log('VDJ-ADC-API INFO: getRepertoire: ' + get_repertoire_id);

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

    var collection = 'repertoire' + mongoSettings.queryCollection;
    var query = '{repertoire_id:"' + get_repertoire_id + '"}';

    // Handle client HTTP request abort
    var abortQuery = false;
    req.on("close", function() {
        if (config.debug) console.log('VDJ-ADC-API INFO: Client request closed unexpectedly.');
        abortQuery = true;
    });

    // all AIRR fields
    var all_fields = [];
    airr.collectFields(global.airr['Repertoire'], 'airr-schema', all_fields, null);

    // construct info object for response
    var info = { };
    var schema = global.airr['Info'];
    info['title'] = config.info.description;
    info['description'] = 'VDJServer ADC API response for repertoire query'
    info['version'] = schema.version;
    info['contact'] = config.info.contact;

    return agaveIO.performQuery(collection, query, null, null, null)
        .then(function(record) {
            if (record.length == 0) {
                res.json({"Info":info,"Repertoire":[]});
                queryRecord['count'] = 0;
            } else {
                record = record[0];
                if (record['_id']) delete record['_id'];
                if (record['_etag']) delete record['_etag'];
                airr.addFields(record, all_fields, global.airr['Repertoire']);
                res.json({"Info":info,"Repertoire":[record]});
                queryRecord['count'] = 1;
            }
        })
        .then(function() {
            if (abortQuery) {
                queryRecord['status'] = 'abort';
                queryRecord['end'] = Date.now();
                agaveIO.recordQuery(queryRecord);
            } else {
                queryRecord['status'] = 'success';
                queryRecord['end'] = Date.now();
                agaveIO.recordQuery(queryRecord);
            }
        })
        .catch(function(error) {
            var msg = 'VDJ-ADC-API ERROR (getRepertoire): ' + error;
            res.status(500).json({"message":result_message});
            console.error(msg);
            webhookIO.postToSlack(msg);
            queryRecord['status'] = 'error';
            queryRecord['message'] = msg;
            queryRecord['end'] = Date.now();
            agaveIO.recordQuery(queryRecord);
            return;
        });
}

function performQuery(collection, query, projection, start_page, pagesize) {
    var models = [];

    //console.log(query);
    var doQuery = function(page) {
        var queryFunction = agaveIO.performQuery;
        if (query && query.length > config.large_query_size) queryFunction = agaveIO.performLargeQuery;
        return queryFunction(collection, query, projection, page, pagesize)
            .then(function(records) {
                if (config.debug) console.log('VDJ-ADC-API INFO: query returned ' + records.length + ' records.');
                if (records.length == 0) {
                    return Promise.resolve(models);
                } else {
                    models = models.concat(records);
                    if (records.length < pagesize) return Promise.resolve(models);
                    else return doQuery(page+1);
                }
            })
            .catch(function(errorObject) {
                return Promise.reject(errorObject);
            });
    };

    return doQuery(start_page);
};

function performFacets(collection, query, field, start_page, pagesize) {
    var models = [];

    //console.log(query);
    var doAggr = function(page) {
        var aggrFunction = agaveIO.performAggregation;
        if (query && query.length > config.large_query_size) {
            if (config.debug) console.log('VDJ-ADC-API INFO: Large facets query detected.');
            aggrFunction = agaveIO.performLargeAggregation;
        }
        // TAPIS BUG: with pagesize and normal aggregation so use the large one for now
        aggrFunction = agaveIO.performLargeAggregation;
        return aggrFunction(collection, 'facets', query, field, page, pagesize)
            .then(function(records) {
                if (config.debug) console.log('VDJ-ADC-API INFO: query returned ' + records.length + ' records.');
                if (records.length == 0) {
                    return Promise.resolve(models);
                } else {
                    models = models.concat(records);
                    if (records.length < pagesize) return Promise.resolve(models);
                    else return doAggr(page+1);
                }
            })
            .catch(function(errorObject) {
                return Promise.reject(errorObject);
            });
    };
    
    return doAggr(start_page);
};

// Generic query repertoires
RepertoireController.queryRepertoires = function(req, res) {
    if (config.debug) console.log('VDJ-ADC-API INFO: queryRepertoires');

    var do_async = false;
    if (req.params.do_async) do_async = true;

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
        console.error(result_message);
        res.status(400).json({"message":result_message});
        queryRecord['status'] = 'reject';
        queryRecord['message'] = result_message;
        agaveIO.recordQuery(queryRecord);
        return;
    }
/*
    if (bodyData['include_fields']) {
        var half_size = config.info.max_query_size / 2;
        if (bodyLength > half_size) {
            result_message = "Query (" + bodyLength + ") exceeds maximum size of " + half_size
                + " characters. Maximum size is reduced from " + config.info.max_query_size
                + " characters when using the include_fields parameter.";
            console.error(result_message);
            queryRecord['status'] = 'reject';
            queryRecord['message'] = result_message;
            agaveIO.recordQuery(queryRecord);
            res.status(400).json({"message":result_message});
            return;
        }
    } else {
        if (bodyLength > config.info.max_query_size) {
            result_message = "Query (" + bodyLength + ") exceeds maximum size of " + config.info.max_query_size + " characters.";
            console.error(result_message);
            queryRecord['status'] = 'reject';
            queryRecord['message'] = result_message;
            agaveIO.recordQuery(queryRecord);
            res.status(400).json({"message":result_message});
            return;
        }
    } */

    // AIRR fields
    var all_fields = [];
    if (bodyData['include_fields']) {
        airr.collectFields(global.airr['Repertoire'], bodyData['include_fields'], all_fields, null);
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
            agaveIO.recordQuery(queryRecord);
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
        if (all_fields.length > 0) {
            for (var r in all_fields) projection[all_fields[r]] = 1;
        }

        // add to field list so will be put in response if necessary
        for (var i = 0; i < fields.length; ++i) {
            if (fields[i] == '_id') continue;
            all_fields.push(fields[i]);
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
        agaveIO.recordQuery(queryRecord);
        res.status(400).json({"message":result_message});
        return;
    }
    if (size < 0) {
        result_message = "Negative size (" + size + ") not allowed.";
        queryRecord['status'] = 'reject';
        queryRecord['message'] = result_message;
        agaveIO.recordQuery(queryRecord);
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
        agaveIO.recordQuery(queryRecord);
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
            query = constructQueryOperation(filter, error);
            //console.log(query);

            if (!query) {
                result_message = "Could not construct valid query. Error: " + error['message'];
                if (config.debug) console.log('VDJ-ADC-API INFO: ' + result_message);
                queryRecord['status'] = 'reject';
                queryRecord['message'] = result_message;
                agaveIO.recordQuery(queryRecord);
                res.status(400).json({"message":result_message});
                return;
            }
        } catch (e) {
            result_message = "Could not construct valid query: " + e;
            if (config.debug) console.log('VDJ-ADC-API INFO: ' + result_message);
            queryRecord['status'] = 'reject';
            queryRecord['message'] = result_message;
            agaveIO.recordQuery(queryRecord);
            res.status(400).json({"message":result_message});
            return;
        }
    }
    var facets = bodyData['facets'];

    // construct info object for response
    var info = { };
    var schema = global.airr['Info'];
    info['title'] = config.info.description;
    info['description'] = 'VDJServer ADC API response for repertoire query'
    info['version'] = schema.version;
    info['contact'] = config.info.contact;

    // Handle client HTTP request abort
    var abortQuery = false;
    req.on("close", function() {
        if (config.debug) console.log('VDJ-ADC-API INFO: Client request closed unexpectedly.');
        abortQuery = true;
    });

    // perform non-facets query
    var collection = 'repertoire' + mongoSettings.queryCollection;
    if (do_async) {
        var submitQueue = new Queue('lrq submit');
        var parsed_query = JSON.parse(query);

        return agaveIO.createAsyncQueryMetadata(collection, bodyData)
            .then(function(metadata) {
                console.log(metadata);
                console.log('VDJ-ADC-API INFO: Created async metadata:', metadata.uuid);
                submitQueue.add({collection: collection, query: parsed_query, metadata: metadata}, {attempts: 5, backoff: 5000});
                res.status(200).json({"message":"repertoire lrq submitted.", "query_id": metadata.uuid});
                return;
            })
            .catch(function(error) {
                var msg = "VDJ-ADC-API ERROR (queryRepertoires): " + error;
                res.status(500).json({"message":result_message});
                console.error(msg);
                webhookIO.postToSlack(msg);
                queryRecord['status'] = 'error';
                queryRecord['message'] = msg;
                queryRecord['end'] = Date.now();
                agaveIO.recordQuery(queryRecord);
            });
    } else if (!facets) {
        //console.log(query);
        // we just get all of them then manually do from/size
        return performQuery(collection, query, projection, 1, pagesize)
            .then(function(records) {
                //if (abortQuery) {
                //    if (config.debug) console.log('VDJ-ADC-API INFO: client aborted query.');
                //    return;
                //}
                if (config.debug) console.log('VDJ-ADC-API INFO: query returned ' + records.length + ' records.');

                if (records.length == 0) {
                    results = [];
                } else {
                    // loop through records, clean data
                    // and only retrieve desired from/size
                    for (var i in records) {
                        if (i < from) continue;
                        if ((size > 0) && (i >= (size + from))) break;
                        var record = records[i];
                        if (record['_id']) delete record['_id'];
                        if (record['_etag']) delete record['_etag'];

                        // add any missing required fields
                        if (all_fields.length > 0) {
                            airr.addFields(records[i], all_fields, global.airr['Repertoire']);
                        }
                        results.push(record);
                    }
                }
            })
            .then(function() {
                if (config.debug) console.log('VDJ-ADC-API INFO: returning ' + results.length + ' records to client.');
                queryRecord['count'] = results.length;
                res.json({"Info":info,"Repertoire":results});
            })
            .then(function() {
                if (abortQuery) {
                    queryRecord['status'] = 'abort';
                    queryRecord['end'] = Date.now();
                    agaveIO.recordQuery(queryRecord);
                } else {
                    queryRecord['status'] = 'success';
                    queryRecord['end'] = Date.now();
                    agaveIO.recordQuery(queryRecord);
                }
            })
            .catch(function(error) {
                var msg = "VDJ-ADC-API ERROR (queryRepertoires): " + error;
                res.status(500).json({"message":result_message});
                console.error(msg);
                webhookIO.postToSlack(msg);
                queryRecord['status'] = 'error';
                queryRecord['message'] = msg;
                queryRecord['end'] = Date.now();
                agaveIO.recordQuery(queryRecord);
            });
    } else {
        // perform facets query
        var field = '$' + facets;
        if (!query) query = '{}';

        //console.log(bodyData);
        //console.log(JSON.stringify(bodyData));
        //console.log(query);

        return performFacets(collection, query, field, 1, pagesize)
            .then(function(records) {
                if (records.length == 0) {
                    results = [];
                } else {
                    // loop through records, clean data
                    // and collapse arrays
                    //console.log(records);
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
                if (config.debug) console.log('VDJ-ADC-API INFO: facets repertoire query returning ' + results.length + ' results to client.');
                queryRecord['count'] = results.length;
                res.json({"Info":info,"Facet":results});
            })
            .then(function() {
                if (abortQuery) {
                    queryRecord['status'] = 'abort';
                    queryRecord['end'] = Date.now();
                    agaveIO.recordQuery(queryRecord);
                } else {
                    queryRecord['status'] = 'success';
                    queryRecord['end'] = Date.now();
                    agaveIO.recordQuery(queryRecord);
                }
            })
            .catch(function(error) {
                var msg = "VDJ-ADC-API ERROR (queryRepertoires, facets): " + error;
                res.status(500).json({"message":result_message});
                console.error(msg);
                webhookIO.postToSlack(msg);
                queryRecord['status'] = 'error';
                queryRecord['message'] = msg;
                queryRecord['end'] = Date.now();
                agaveIO.recordQuery(queryRecord);
            });
    }
}
