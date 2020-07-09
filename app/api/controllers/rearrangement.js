'use strict';

//
// rearrangement.js
// Rearrangement end points
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

var util = require('util');

// Server environment config
var config = require('../../config/config');
var agaveSettings = require('../../config/tapisSettings');
var mongoSettings = require('../../config/mongoSettings');
var airr = require('../helpers/airr-schema');

var assert = require('assert');

// Processing
var agaveIO = require('../vendor/agaveIO');
var webhookIO = require('../vendor/webhookIO');

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
  Once you 'require' a module you can reference the things that it exports.  These are defined in module.exports.

  For a controller in a127 (which this is) you should export the functions referenced in your Swagger document by name.

  Either:
  - The HTTP Verb of the corresponding operation (get, put, post, delete, etc)
  - Or the operationId associated with the operation in your Swagger document
*/
module.exports = {
    getRearrangement: getRearrangement,
    queryRearrangements: queryRearrangements
};

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
        var schema = global.airr['Rearrangement'];
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
            if (config.debug) console.log('VDJ-ADC-API INFO:' + content['field'] + ' is not found in AIRR schema.');
        }
    }
    // if not in schema then maybe its a custom field
    // so use the same type as the value.
    if (!content_type) content_type = typeof content['value'];
    //if (config.debug) console.log('type: ' + content_type);

    // Check if query field is required. By default, the ADC API can reject
    // queries on the rearrangement endpoint for optional fields.
    if (content_properties != undefined) {
        if (content_properties['x-airr'] != undefined) {
            if ((content_properties['x-airr']['adc-query-support'] != undefined) &&
                (content_properties['x-airr']['adc-query-support'])) {
                // need to support query
            } else {
                // optional field, reject
                if (config.debug) console.log('VDJ-ADC-API INFO: ' + content['field'] + ' is an optional query field.');
                error['message'] = "query not supported on field: " + content['field'];
                return null;
            }
        }
    }

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
	// VDJServer optimization for substring searches on junction_aa
	if (content['field'] == 'junction_aa') {
	    if (content['value'].length < 4) {
		error['message'] = "value for 'contains' operator on 'junction_aa' field is too small, length is ("
		    + content['value'].length + ") characters, minimum is 4.";
		return null;
	    } else {
		return '{"vdjserver_junction_substrings":' + content_value + '}';
	    }
	} else {
	    error['message'] = "'contains' operator not supported for '" + content['field'] + "' field.";
	    return null;
	}
	return null;

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

/*
  Functions in a127 controllers used for operations should take two parameters:

  Param 1: a handle to the request object
  Param 2: a handle to the response object
*/
function getRearrangement(req, res) {
    if (config.debug) console.log('VDJ-ADC-API INFO: getRearrangement: ' + req.swagger.params['sequence_id'].value);

    var result = {};
    var result_message = "Server error";
    var results = [];

    var queryRecord = {
	endpoint: 'rearrangement',
	method: 'GET',
	query: req.swagger.params['sequence_id'].value,
	ip: req.ip,
	status: 'unknown',
	message: null,
        count: null,
        start: Date.now()
    };

    console.log(mongoSettings.queryCollection);
    var collection = mongoSettings.queryCollection + '/' + req.swagger.params['sequence_id'].value;

    // Handle client HTTP request abort
    var abortQuery = false;
    req.on("close", function() {
        if (config.debug) console.log('VDJ-ADC-API INFO: Client request closed unexpectedly.');
        abortQuery = true;
    });

    // all AIRR fields
    var all_fields = [];
    airr.collectFields(global.airr['Rearrangement'], 'airr-schema', all_fields, null);

    // construct info object for response
    var info = { };
    var schema = global.airr['Info'];
    info['title'] = config.info.description;
    info['description'] = 'VDJServer ADC API response for rearrangement query'
    info['version'] = schema.version;
    info['contact'] = config.info.contact;

    agaveIO.performQuery(collection, null, null, null, null)
        .then(function(record) {
            if (record['http status code'] == 404) {
                res.json({"Info":info,"Rearrangement":[]});
                queryRecord['count'] = 0;
            } else {
                if (!record['sequence_id']) {
                    if (record['_id']['$oid']) record['sequence_id'] = record['_id']['$oid'];
                    else record['sequence_id'] = record['_id'];
                }
                if (record['_id']) delete record['_id'];
                if (record['_etag']) delete record['_etag'];
		airr.addFields(record, all_fields, global.airr['Rearrangement']);
                res.json({"Info":info,"Rearrangement":[record]});
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
        .fail(function(error) {
            var msg = 'VDJ-ADC-API ERROR (getRearrangment): ' + error;
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

function queryRearrangements(req, res) {
    if (config.debug) console.log('VDJ-ADC-API INFO: queryRearrangements');

    var results = [];
    var result = {};
    var result_flag = false;
    var result_message = "Unknown error";

    var bodyData = req.swagger.params['data'].value;

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
	console.error(result_message);
        res.status(400).json({"message":result_message});
	queryRecord['status'] = 'reject';
	queryRecord['message'] = result_message;
	agaveIO.recordQuery(queryRecord);
        return;
    }

    // AIRR fields
    var all_fields = [];
    if (bodyData['include_fields']) {
	airr.collectFields(global.airr['Rearrangement'], bodyData['include_fields'], all_fields, null);
        //if (config.debug) console.log(all_fields);
    }
    // collect all AIRR schema fields
    var schema_fields = [];
    airr.collectFields(global.airr['Rearrangement'], 'airr-schema', schema_fields, null);

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
	    agaveIO.recordQuery(queryRecord);
            return;
        }
        for (var i = 0; i < fields.length; ++i) {
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
	for (var i = 0; i < fields.length; ++i) {
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
	agaveIO.recordQuery(queryRecord);
        return;
    }

    // we need to convert ADC API from/size to page/pagesize
    var page = 1;
    var pagesize = config.max_size;

    // size parameter
    var size = config.max_size;
    if (bodyData['size'] != undefined) {
        size = bodyData['size'];
        size = Math.floor(size);
    }
    if (size > config.max_size) {
        result_message = "Size too large (" + size + "), maximum size is " + config.max_size;
        res.status(400).json({"message":result_message});
	queryRecord['status'] = 'reject';
	queryRecord['message'] = result_message;
	agaveIO.recordQuery(queryRecord);
        return;
    }
    if (size < 0) {
        result_message = "Negative size (" + size + ") not allowed.";
        res.status(400).json({"message":result_message});
	queryRecord['status'] = 'reject';
	queryRecord['message'] = result_message;
	agaveIO.recordQuery(queryRecord);
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
        res.status(400).json({"message":result_message});
	queryRecord['status'] = 'reject';
	queryRecord['message'] = result_message;
	agaveIO.recordQuery(queryRecord);
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
                res.status(400).json({"message":result_message});
	        queryRecord['status'] = 'reject';
	        queryRecord['message'] = result_message;
	        agaveIO.recordQuery(queryRecord);
                return;
            }
        } catch (e) {
            result_message = "Could not construct valid query: " + e;
            if (config.debug) console.log('VDJ-ADC-API INFO: ' + result_message);
            res.status(400).json({"message":result_message});
	    queryRecord['status'] = 'reject';
	    queryRecord['message'] = result_message;
	    agaveIO.recordQuery(queryRecord);
            return;
        }
    }
    var facets = bodyData['facets'];

    // construct info object for response
    var info = { };
    var schema = global.airr['Info'];
    info['title'] = config.info.description;
    info['description'] = 'VDJServer ADC API response for rearrangement query'
    info['version'] = schema.version;
    info['contact'] = config.info.contact;

    // Handle client HTTP request abort
    var abortQuery = false;
    req.on("close", function() {
        if (config.debug) console.log('VDJ-ADC-API INFO: Client request closed unexpectedly');
        abortQuery = true;
    });

    // perform non-facets query
    console.log(JSON.stringify(mongoSettings));
    console.log(mongoSettings.queryCollection);
    var collection = mongoSettings.queryCollection;
    if (!facets) {
        //if (config.debug) console.log(query);
        agaveIO.performQuery(collection, query, null, page, pagesize)
            .then(function(records) {
                if (abortQuery) {
                    return;
                }

                if (config.debug) console.log('VDJ-ADC-API INFO: query returned ' + records.length + ' records.');
                if (records.length == 0) {
                    results = [];
                } else {
                    // loop through records, clean data
                    // and only retrieve desired from/size
                    for (var i in records) {
                        if (i < from_skip) continue;
                        if (i >= size_stop) break;
                        var record = records[i];
                        if (!record['sequence_id']) {
                            if (record['_id']['$oid']) record['sequence_id'] = record['_id']['$oid'];
                            else record['sequence_id'] = record['_id'];
                        }

                        // gene calls, join back to string
                        if ((typeof record['v_call']) == "object") record['v_call'] = record['v_call'].join(',');
                        if ((typeof record['d_call']) == "object") record['d_call'] = record['d_call'].join(',');
                        if ((typeof record['j_call']) == "object") record['j_call'] = record['j_call'].join(',');

			// TODO: general this a bit in case we add more
                        if (record['_id']) delete record['_id'];
                        if (record['_etag']) delete record['_etag'];
			if (record['vdjserver_junction_substrings'])
			    if (projection['vdjserver_junction_substrings'] == undefined)
				delete record['vdjserver_junction_substrings'];

		        // add any missing required fields
		        if (all_fields.length > 0) {
			    airr.addFields(record, all_fields, global.airr['Rearrangement']);
		        }
                        // apply projection
                        var keys = Object.keys(record);
                        if (Object.keys(projection).length > 0) {
                            for (var p = 0; p < keys.length; ++p)
                                if (projection[keys[p]] == undefined)
                                    delete record[keys[p]];
                        }
                        results.push(record);
                    }
                }
            })
            .then(function() {
                if (abortQuery) {
                    return;
                }

                if ((!second_size) || (results.length < pagesize)) {
                    // only one query so return the results
                    return;
                } else {
                    // we need to do a second query for the rest
                    page += 1;
                    agaveIO.performQuery(collection, query, null, page, pagesize)
                        .then(function(records) {
                            if (config.debug) console.log('VDJ-ADC-API INFO: second query returned ' + records.length + ' records.')

                            // loop through records, clean data
                            // and only retrieve desired from/size
                            for (var i in records) {
                                if (i >= second_size) break;
                                var record = records[i];
                                if (!record['sequence_id']) {
                                    if (record['_id']['$oid']) record['sequence_id'] = record['_id']['$oid'];
                                    else record['sequence_id'] = record['_id'];
                                }

                                // gene calls, join back to string
                                if ((typeof record['v_call']) == "object") record['v_call'] = record['v_call'].join(',');
                                if ((typeof record['d_call']) == "object") record['d_call'] = record['d_call'].join(',');
                                if ((typeof record['j_call']) == "object") record['j_call'] = record['j_call'].join(',');

			        // TODO: general this a bit in case we add more
                                if (record['_id']) delete record['_id'];
                                if (record['_etag']) delete record['_etag'];
			        if (record['vdjserver_junction_substrings'])
			            if (projection['vdjserver_junction_substrings'] == undefined)
				        delete record['vdjserver_junction_substrings'];

		                // add any missing required fields
		                if (all_fields.length > 0) {
			            airr.addFields(record, all_fields, global.airr['Rearrangement']);
		                }
                                // apply projection
                                var keys = Object.keys(record);
                                if (Object.keys(projection).length > 0) {
                                    for (var p = 0; p < keys.length; ++p)
                                        if (projection[keys[p]] == undefined)
                                            delete record[keys[p]];
                                }
                                results.push(record);
                            }
                        });
                }
            })
            .then(function() {
                if (abortQuery) {
                    if (config.debug) console.log('VDJ-ADC-API INFO: client aborted query.');
                    return;
                }

                // format results and return them
                queryRecord['count'] = results.length;
                if (format == 'json') {
                    if (config.debug) console.log('VDJ-ADC-API INFO: returning ' + results.length + ' records to client.');
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
                        for (var p = 0; p < schema_fields.length; ++p) {
                            if (projection[schema_fields[p]]) headers.push(schema_fields[p]);
                        }
                        // add custom fields on end
                        for (var p in projection) {
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
            .fail(function(error) {
                var msg = "VDJ-ADC-API ERROR (queryRearrangements): " + error;
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
        agaveIO.performAggregation(collection, 'facets', query, field)
            .then(function(records) {
                //console.log(records);
                if (records.length == 0) {
                    results = [];
                } else {
                    // loop through records, clean data
                    // and only retrieve desired from/size
                    for (var i in records) {
                        var entry = records[i];
                        var new_entry = {}
                        new_entry[facets] = entry['_id'];
                        new_entry['count'] = entry['count'];
                        results.push(new_entry);
                    }
                }
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
            .fail(function(error) {
                var msg = "VDJ-ADC-API ERROR (queryRearrangements, facets): " + error;
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
