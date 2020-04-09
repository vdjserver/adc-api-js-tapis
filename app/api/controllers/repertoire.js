'use strict';

var util = require('util');

// Server environment config
var config = require('../../config/config');
var agaveSettings = require('../../config/tapisSettings');

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
    getRepertoire: getRepertoire,
    queryRepertoires: queryRepertoires
};

/*
  Construct mongodb query based upon the filters parameters. The
  filters parameter is a JSON object that can be any number of nested
  levels, so we recursively construct the query.
*/
function constructQueryOperation(filter) {
    if (!filter['op']) return null;
    if (!filter['content']) return null;

    var content = filter['content'];

    // TODO: do we need to handle value being an array when a single value is expected?
    // TODO: mechanism to return error information
    // TODO: validate queryable field names?

    // determine type from schema, default is string
    var content_type = null;
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
            if (props['type'] != undefined) content_type = props['type'];
        } else {
            console.log('VDJ-ADC-API INFO: ' + content['field'] + ' is not found in AIRR schema.');
        }
    }
    //console.log('type: ' + content_type);

    var content_value = undefined;
    if (! content_type) {
        if (typeof content['value'] == 'number') content_type = 'number';
        else content_type = 'string';
    }

    if (content['value'] != undefined) {
        switch(content_type) {
        case 'integer':
        case 'number':
        case 'boolean':
            if (content['value'] instanceof Array) {
                content_value = JSON.stringify(content['value']);
            } else {
                content_value = content['value'];
            }
            break;
        case 'string':
        default:
            if (content['value'] instanceof Array) {
                content_value = JSON.stringify(content['value']);
            } else {
                content_value = '"' + content['value'] + '"';
            }
            break;
        }
    }
    //console.log('value: ' + content_value);

    switch(filter['op']) {
    case '=':
        if ((content['field'] != undefined) && (content_value != undefined)) {
            return '{"' + content['field'] + '":' + content_value + '}';
        }
        return null;

    case '!=':
        if ((content['field'] != undefined) && (content_value != undefined)) {
            return '{"' + content['field'] + '": { "$ne":' + content_value + '}}';
        }
        return null;

    case '<':
        if ((content['field'] != undefined) && (content_value != undefined)) {
            return '{"' + content['field'] + '": { "$lt":' + content_value + '}}';
        }
        return null;

    case '<=':
        if ((content['field'] != undefined) && (content_value != undefined)) {
            return '{"' + content['field'] + '": { "$lte":' + content_value + '}}';
        }
        return null;

    case '>':
        if ((content['field'] != undefined) && (content_value != undefined)) {
            return '{"' + content['field'] + '": { "$gt":' + content_value + '}}';
        }
        return null;

    case '>=':
        if ((content['field'] != undefined) && (content_value != undefined)) {
            return '{"' + content['field'] + '": { "$gte":' + content_value + '}}';
        }
        return null;

    case 'contains':
        if ((content['field'] != undefined) && (content_value != undefined)) {
            return '{"' + content['field'] + '": { "$regex":' + escapeString(content_value) + ', "$options": "i"}}';
        }
        return null;

    case 'is': // is missing
    case 'is missing':
        if (content['field'] != undefined) {
            return '{"' + content['field'] + '": { "$exists": false } }';
        }
        return null;

    case 'not': // is not missing
    case 'is not missing':
        if (content['field'] != undefined) {
            return '{"' + content['field'] + '": { "$exists": true } }';
        }
        return null;

    case 'in':
        if ((content['field'] != undefined) && (content_value != undefined) && (content['value'] instanceof Array)) {
            return '{"' + content['field'] + '": { "$in":' + content_value + '}}';
        }
        return null;

    case 'exclude':
        if ((content['field'] != undefined) && (content_value != undefined) && (content['value'] instanceof Array)) {
            return '{"' + content['field'] + '": { "$nin":' + content_value + '}}';
        }
        return null;

    case 'and':
        if ((content instanceof Array) && (content.length > 1)) {
            var exp_list = [];
            for (var i = 0; i < content.length; ++i) {
                var exp = constructQueryOperation(content[i]);
                if (exp == null) return null;
                exp_list.push(exp);
            }
            return '{ "$and":[' + exp_list + ']}';
        }
        return null;

    case 'or':
        if ((content instanceof Array) && (content.length > 1)) {
            var exp_list = [];
            for (var i = 0; i < content.length; ++i) {
                var exp = constructQueryOperation(content[i]);
                if (exp == null) return null;
                exp_list.push(exp);
            }
            return '{ "$or":[' + exp_list + ']}';
        }
        return null;

    default:
        var msg = 'VDJ-ADC-API ERROR (repertoire): Unknown operator in filters: ' + filter['op'];
        console.error(msg);
        webhookIO.postToSlack(msg);
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
function getRepertoire(req, res) {
    console.log('VDJ-ADC-API INFO: getRepertoire: ' + req.swagger.params['repertoire_id'].value);

    var result = {};
    var result_message = "Server error";
    var results = [];

    var collection = 'repertoire';
    var query = '{repertoire_id:"' + req.swagger.params['repertoire_id'].value + '"}';

    // construct info object for response
    var info = { };
    var schema = global.airr['Info'];
    info['title'] = config.title;
    info['description'] = 'VDJServer ADC API response for repertoire query'
    info['version'] = schema.version;
    info['contact'] = config.contact;

    agaveIO.performQuery(collection, query, null, null, null)
        .then(function(record) {
                if (record.length == 0) {
                    res.json({"Info":info,"Repertoire":[]});
                } else {
                    record = record[0];
                    if (record['_id']) delete record['_id'];
                    if (record['_etag']) delete record['_etag'];
                    res.json({"Info":info,"Repertoire":[record]});
                }
            })
        .fail(function(error) {
                var msg = 'VDJ-ADC-API ERROR (getRepertoire): ' + error;
                res.status(500).json({"message":result_message});
                console.error(msg);
                webhookIO.postToSlack(msg);
                return;
            });
}

function queryRepertoires(req, res) {
    console.log('VDJ-ADC-API INFO: queryRepertoires');

    var results = [];
    var result = {};
    var result_flag = false;
    var result_message = "Unknown error";

    var bodyData = req.swagger.params['data'].value;

    // field projection
    var projection = {};
    if (bodyData['fields'] != undefined) {
        var fields = bodyData['fields'];
        //console.log('fields: ', fields);
        if (! (fields instanceof Array)) {
            result_message = "fields parameter is not an array.";
            res.status(400).json({"message":result_message});
            return;
        }
        for (var i = 0; i < fields.length; ++i) {
            if (fields[i] == '_id') continue;
            if (fields[i] == '_etag') continue;
            projection[fields[i]] = 1;
        }
    }
    projection['_id'] = 0;

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
        return;
    }
    if (size < 0) {
        result_message = "Negative size (" + size + ") not allowed.";
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
        //console.log(filter);
        try {
            query = constructQueryOperation(filter);
            //console.log(query);

            if (!query) {
                result_message = "Could not construct valid query.";
                res.status(400).json({"message":result_message});
                return;
            }
        } catch (e) {
            result_message = "Could not construct valid query: " + e;
            res.status(400).json({"message":result_message});
            return;
        }
    }
    var facets = bodyData['facets'];

    // construct info object for response
    var info = { };
    var schema = global.airr['Info'];
    info['title'] = config.title;
    info['description'] = 'VDJServer ADC API response for repertoire query'
        info['version'] = schema.version;
    info['contact'] = config.contact;

    // Handle client HTTP request abort
    var abortQuery = false;
    req.on("close", function() {
            console.log('VDJ-ADC-API INFO: Client request closed unexpectedly.');
            abortQuery = true;
        });

    // perform non-facets query
    var collection = 'repertoire';
    if (!facets) {
        //console.log(query);
        agaveIO.performQuery(collection, query, projection, page, pagesize)
            .then(function(records) {
                    if (abortQuery) {
                        console.log('VDJ-ADC-API INFO: client aborted query.');
                        return;
                    }

                    console.log('VDJ-ADC-API INFO: query returned ' + records.length + ' records.');
                    if (records.length == 0) {
                        results = [];
                    } else {
                        // loop through records, clean data
                        // and only retrieve desired from/size
                        for (var i in records) {
                            if (i < from_skip) continue;
                            if (i >= size_stop) break;
                            var record = records[i];
                            if (record['_id']) delete record['_id'];
                            if (record['_etag']) delete record['_etag'];
                            results.push(record);
                        }
                    }
                })
            .then(function() {
                    if (abortQuery) {
                        return;
                    }

                    if ((second_size <= 0) || (results.length < pagesize)) {
                        // only one query so return the results 
                        console.log('VDJ-ADC-API INFO: returning ' + results.length + ' records to client.');
                        res.json({"Info":info,"Repertoire":results});
                    } else {
                        // we need to do a second query for the rest
                        page += 1;
                        agaveIO.performQuery(collection, query, projection, page, pagesize)
                            .then(function(records) {
                                    console.log('VDJ-ADC-API INFO: second query returned ' + records.length + ' records.')

                                        // loop through records, clean data
                                        // and only retrieve desired from/size
                                        for (var i in records) {
                                            if (i >= second_size) break;
                                            var record = records[i];
                                            if (record['_id']) delete record['_id'];
                                            if (record['_etag']) delete record['_etag'];
                                            results.push(record);
                                        }
                                    console.log('VDJ-ADC-API INFO: returning ' + results.length + ' records to client.');
                                    res.json({"Info":info,"Repertoire":results});
                                });
                    }
                })
            .fail(function(error) {
                    var msg = "VDJ-ADC-API ERROR (queryRepertoires): " + error;
                    res.status(500).json({"message":result_message});
                    console.error(msg);
                    webhookIO.postToSlack(msg);
                });
    } else {
        // perform facets query
        var field = '$' + facets;
        if (!query) query = '{}';
        agaveIO.performAggregation(collection, 'facets', query, field)
            .then(function(records) {
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
                    res.json({"Info":info,"Facet":results});
                })
            .fail(function(error) {
                    var msg = "VDJ-ADC-API ERROR (queryRepertoires, facets): " + error;
                    res.status(500).json({"message":result_message});
                    console.error(msg);
                    webhookIO.postToSlack(msg);
                });
    }
}
