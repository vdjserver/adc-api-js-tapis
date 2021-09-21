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

var RearrangementController = {};
module.exports = RearrangementController;

// Server environment config
var config = require('../../config/config');
//var agaveSettings = require('../../config/tapisSettings');
var mongoSettings = require('../../config/mongoSettings');
var airr = require('../helpers/airr-schema');

// Processing
var agaveIO = require('../vendor/agaveIO');
var webhookIO = require('../vendor/webhookIO');

// Node Libraries
var Queue = require('bull');
var fs = require('fs');
const zlib = require('zlib');
var stream = require('stream');

// escape strings for regex, double \\ for restheart

//var escapeString = function(text) {
//    var encoded = text.replace(/\*/g, '\\\\\*');
//    encoded = encoded.replace(/\+/g, '\\\\\+');
//    return encoded;
//}

function getInfoObject() {
    var info = { };
    var schema = global.airr['Info'];
    info['title'] = config.info.description;
    info['description'] = 'VDJServer ADC API response for rearrangement query'
    info['version'] = schema.version;
    info['contact'] = config.info.contact;
    return info;
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
        var schema = global.airr['Rearrangement'];
        var props = schema;

        // traverse down the object schema hierarchy to find field definition
        let objs = content['field'].split('.');
        for (let i = 0; i < objs.length; ++i) {
            let p = objs[i];
            if (props.type == 'array') {
                if (props.items.type == 'object') {
                    props = props.items.properties[p];
                } else if (props.items['allOf'] != undefined) {
                    var new_props = undefined;
                    for (let j = 0; j < props.items['allOf'].length; ++j) {
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
                return '{"vdjserver_junction_suffixes": {"$regex": "^' + content['value'] + '"}}';
            }
        }
        error['message'] = "'contains' operator not supported for '" + content['field'] + "' field.";
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

    case 'and': {
        if (! (content instanceof Array)) {
            error['message'] = "content for 'and' operator is not an array";
            return null;
        }
        if (content.length < 2) {
            error['message'] = "content for 'and' operator needs at least 2 elements";
            return null;
        }

        let exp_list = [];
        for (let i = 0; i < content.length; ++i) {
            let exp = constructQueryOperation(content[i], error);
            if (exp == null) return null;
            exp_list.push(exp);
        }
        return '{ "$and":[' + exp_list + ']}';
    }

    case 'or': {
        if (! (content instanceof Array)) {
            error['message'] = "content for 'or' operator is not an array";
            return null;
        }
        if (content.length < 2) {
            error['message'] = "content for 'or' operator needs at least 2 elements";
            return null;
        }

        let exp_list = [];
        for (let i = 0; i < content.length; ++i) {
            let exp = constructQueryOperation(content[i], error);
            if (exp == null) return null;
            exp_list.push(exp);
        }
        return '{ "$or":[' + exp_list + ']}';
    }

    default:
        error['message'] = 'unknown operator in filters: ' + filter['op'];
        return null;
    }

    // should not get here
    //return null;
}

// Clean data record
// Remove any internal fields
function cleanRecord(record, projection, all_fields) {
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
    if (record['vdjserver_junction_suffixes'])
        if (projection['vdjserver_junction_suffixes'] == undefined)
            delete record['vdjserver_junction_suffixes'];

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
    return record;
}

// process LRQ file
RearrangementController.processLRQfile = function(metadata_uuid) {
    return agaveIO.getMetadata(metadata_uuid)
        .then(function(metadata) {
            console.log(metadata);

            return new Promise(function(resolve, reject) {
                if (metadata['value']['endpoint'] != 'rearrangement') {
                    return reject(new Error('wrong endpoint: rearrangement != ' + metadata['value']['endpoint']));
                }

                var bodyData = metadata['value']['body'];

                // AIRR fields
                var all_fields = [];
                if (bodyData['include_fields']) {
                    airr.collectFields(global.airr['Rearrangement'], bodyData['include_fields'], all_fields, null);
                    //if (config.debug) console.log(all_fields);
                }

                // collect all AIRR schema fields
                var schema_fields = [];
                airr.collectFields(global.airr['Rearrangement'], 'airr-schema', schema_fields, null);

                var projection = {};
                if (bodyData['fields'] != undefined) {
                    let fields = bodyData['fields'];
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
                        for (let r in all_fields) projection[all_fields[r]] = 1;
                    }

                    // add to field list so will be put in response if necessary
                    for (let i = 0; i < fields.length; ++i) {
                        if (fields[i] == '_id') continue;
                        all_fields.push(fields[i]);
                    }
                }

                var format = 'json';
                if (metadata["value"]["body"]["format"] != undefined)
                    format = metadata["value"]["body"]["format"];

                // determine TSV headers
                var headers = [];
                if (format == 'tsv') {
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
                }

                // tranform stream
                var transform = new stream.Transform();
                var first = true;
                transform._first_record = true;
                if (format == 'json') {
                    transform._transform = function (chunk, encoding, done) {
                        if (first) {
                            // header
                            var info = getInfoObject();
                            this.push('{"Info":');
                            this.push(JSON.stringify(info));
                            this.push(',"Rearrangement":[\n');
                            first = false;
                        }

                        // transform the record
                        try {
                            var data = chunk.toString();
                            if (this._lastLineData) data = this._lastLineData + data;
                            var lines = data.split('\n');
                            this._lastLineData = lines.splice(lines.length-1,1)[0];

                            for (let l in lines) {
                                var entry = cleanRecord(JSON.parse(lines[l]), projection, all_fields);
                                //var entry = cleanRecord(JSON.parse(l), projection, all_fields);
                                if (transform._first_record) transform._first_record = false;
                                else this.push(",\n");
                                this.push(JSON.stringify(entry));
                            }
                            done();
                        } catch (e) {
                            console.error('VDJ-ADC-API ERROR (processLRQFile, JSON transform): Parse error on chunk: ' + data);
                            console.error(e);
                            done(e);
                        }
                    }

                    transform._flush = function (done) {
                        console.log('flush');
                        console.log(this._lastLineData);
                        try {
                            if (this._lastLineData) {
                                var entry = cleanRecord(JSON.parse(this._lastLineData), projection, all_fields);
                                if (transform._first_record) transform._first_record = false;
                                else this.push(",\n");
                                this.push(JSON.stringify(entry));
                            }
                            this._lastLineData = null;
                            this.push('\n]}\n');
                            done();
                        } catch (e) {
                            console.error('VDJ-ADC-API ERROR (processLRQFile, JSON flush): Parse error on chunk: ' + this._lastLineData);
                            console.error(e);
                            done(e);
                        }
                    }
                } else {
                    // TSV format
                    transform._transform = function (chunk, encoding, done) {
                        if (first) {
                            // write headers
                            this.push(headers.join('\t'));
                            this.push('\n');
                            first = false;
                        }

                        // transform the record
                        try {
                            var data = chunk.toString();
                            if (this._lastLineData) data = this._lastLineData + data;
                            var lines = data.split('\n');
                            this._lastLineData = lines.splice(lines.length-1,1)[0];

                            for (let l in lines) {
                                var entry = cleanRecord(JSON.parse(lines[l]), projection, all_fields);
                                var vals = [];
                                for (let i = 0; i < headers.length; ++i) {
                                    let p = headers[i];
                                    if (entry[p] == undefined) vals.push('');
                                    else vals.push(entry[p]);
                                }
                                this.push(vals.join('\t'));
                                this.push('\n');
                            }
                            done();
                        } catch (e) {
                            console.error('VDJ-ADC-API ERROR (processLRQFile, TSV transform): Parse error on chunk: ' + data);
                            console.error(e);
                            done(e);
                        }
                    }

                    transform._flush = function (done) {
                        try {
                            if (this._lastLineData) {
                                var entry = cleanRecord(JSON.parse(this._lastLineData), projection, all_fields);
                                let vals = [];
                                for (let i = 0; i < headers.length; ++i) {
                                    let p = headers[i];
                                    if (entry[p] == undefined) vals.push('');
                                    else vals.push(entry[p]);
                                }
                                this.push(vals.join('\t'));
                                this.push('\n');
                            }
                            this._lastLineData = null;
                            done();
                        } catch (e) {
                            console.error('VDJ-ADC-API ERROR (processLRQFile, TSV flush): Parse error on chunk: ' + this._lastLineData);
                            console.error(e);
                            done(e);
                        }
                    }
                }

                // Open read/write streams
                var infile = config.lrqdata_path + 'lrq-' + metadata["value"]["lrq_id"] + '.json';
                var outname;
                if (format == 'json')
                    outname = metadata["uuid"] + '.airr.json';
                else
                    outname = metadata["uuid"] + '.airr.tsv';
                var outfile = config.lrqdata_path + outname;
                var readable = fs.createReadStream(infile)
                    .on('error', function(e) { return reject(e); });
                var writable = fs.createWriteStream(outfile)
                    .on('error', function(e) { return reject(e); });

                // process the stream
                readable.pipe(transform)
                    .on('error', function(e) { console.log('caught error'); console.log(e); return reject(e); })
                    .pipe(writable)
                    .on('finish', function() {
                        console.log('end of stream');
                        writable.end();
                    });

/*
                readable.pipe(zlib.createGunzip())
                    .pipe(transform)
                    .on('error', function(e) { console.log('caught error'); console.log(e); return reject(e); })
                    .pipe(zlib.createGzip())
                    .pipe(writable)
                    .on('finish', function() {
                        console.log('end of stream');
                        writable.end();
                    });
*/

                writable.on('finish', function() {
                    console.log('finish of write stream');
                    return resolve(outname);
                });
            });
        });
}

// get a single rearrangement
RearrangementController.getRearrangement = function(req, res) {
    var get_sequence_id = req.params.sequence_id;
    if (config.debug) console.log('VDJ-ADC-API INFO: getRearrangement: ' + get_sequence_id);

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

    var collection = 'rearrangement' + mongoSettings.queryCollection + '/' + get_sequence_id;

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

    return agaveIO.performQuery(collection, null, null, null, null)
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
        .catch(function(error) {
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
        return aggrFunction(collection, 'facets', query, field, null, null)
            .then(function(records) {
                if (config.debug) console.log('VDJ-ADC-API INFO: query returned ' + records.length + ' records.');
                //console.log(JSON.stringify(records));
                if (records.length == 0) {
                    return Promise.resolve(models);
                } else {
                    // the new facets aggregation returns a single record with all the data
                    return Promise.resolve(records[0]['facets']);
                    //models = models.concat(records);
                    //if (records.length < pagesize) return Promise.resolve(models);
                    //else return doAggr(page+1);
                }
            })
            .catch(function(errorObject) {
                return Promise.reject(errorObject);
            });
    };
    
    return doAggr(start_page);
}

RearrangementController.generateAsyncCountQuery = function(metadata) {
    console.log('RearrangementController.generateAsyncCountQuery');
    var bodyData = metadata['value']['body'];

    // from parameter
    var from = 0;
    if (bodyData['from'] != undefined) {
        from = bodyData['from'];
        from = Math.floor(from);
    }

    // construct query
    var result_message = null;
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
                return null;
            }
        } catch (e) {
            result_message = "Could not construct valid query: " + e;
            if (config.debug) console.log('VDJ-ADC-API INFO: ' + result_message);
            return null;
        }
    }
    if (!query) query = '{}';
    var parsed_query = JSON.parse(query);

    var count_query = null;
    count_query = [{"$match":parsed_query}];
    if (from) count_query.push({"$skip":from});
    count_query.push({"$count":"total_records"});

    console.log(JSON.stringify(count_query));
    return count_query;
}

RearrangementController.generateAsyncQuery = function(metadata) {
    console.log('RearrangementController.generateAsyncQuery');
    var bodyData = metadata['value']['body'];

    // size parameter
    var size = null;
    if (bodyData['size'] != undefined) {
        size = bodyData['size'];
        size = Math.floor(size);
    }

    // from parameter
    var from = 0;
    if (bodyData['from'] != undefined) {
        from = bodyData['from'];
        from = Math.floor(from);
    }

    // construct query
    var result_message = null;
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
                return null;
            }
        } catch (e) {
            result_message = "Could not construct valid query: " + e;
            if (config.debug) console.log('VDJ-ADC-API INFO: ' + result_message);
            return null;
        }
    }
    if (!query) query = '{}';
    var parsed_query = JSON.parse(query);

    var aggr_query = [{"$match":parsed_query}];
    if (from) aggr_query.push({"$skip":from});
    if (size) aggr_query.push({"$limit":size});

    console.log(JSON.stringify(aggr_query));
    return aggr_query;
}

RearrangementController.queryRearrangements = function(req, res) {
    if (config.debug) console.log('VDJ-ADC-API INFO: queryRearrangements');

    var do_async = false;
    if (req.params.do_async) do_async = true;

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
    if (size < 0) {
        result_message = "Negative size (" + size + ") not allowed.";
        res.status(400).json({"message":result_message});
        queryRecord['status'] = 'reject';
        queryRecord['message'] = result_message;
        agaveIO.recordQuery(queryRecord);
        return;
    }
    if (do_async) {
        // async queries have a different max
        if (! bodyData['size']) {
            // if the query does not specify a size, we need to count to see if the
            // result set is too big. we indicate this with a null size.
            size = null;
        } else {
            if (size > config.async.max_size) {
                result_message = "Size too large (" + size + "), maximum size is " + config.async.max_size;
                res.status(400).json({"message":result_message});
                queryRecord['status'] = 'reject';
                queryRecord['message'] = result_message;
                agaveIO.recordQuery(queryRecord);
                return;
            }
        }
    } else {
        // normal query max
        if (size > config.max_size) {
            result_message = "Size too large (" + size + "), maximum size is " + config.max_size;
            res.status(400).json({"message":result_message});
            queryRecord['status'] = 'reject';
            queryRecord['message'] = result_message;
            agaveIO.recordQuery(queryRecord);
            return;
        }
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

    var collection = 'rearrangement' + mongoSettings.queryCollection;
    if (do_async) {
        // perform async query
        //
        // An async query is performed in multiple steps. If we do not know the size of the result size, which
        // we generally do not unless the query specifies a size, then we first perform a count aggregation.
        // If size is specified in the query, the check is above, and if it passes then we perform the query.
        // If we need to count, we get a notification from the count aggregation, which checks that the size
        // is okay and performs the query, or marks the query as ERROR.
        // We setup all the necessary data here so that the queues can process everything as needed.
        var countQueue = new Queue('lrq count');
        var submitQueue = new Queue('lrq submit');
        var parsed_query = JSON.parse(query);

        // We put the commands in with the $ so that Tapis metadata service does not try to interpret it

        var count_query = null;
        if (! size) {
            // we do not know size, so setup count aggregation query
            count_query = [{"match":parsed_query}];
            if (from) count_query.push({"skip":from});
            count_query.push({"count":"total_records"});
        }
        var aggr_query = [{"match":parsed_query}];
        if (from) aggr_query.push({"skip":from});
        if (size) aggr_query.push({"limit":size});

        console.log(JSON.stringify(count_query));
        console.log(JSON.stringify(aggr_query));
        return agaveIO.createAsyncQueryMetadata('rearrangement', collection, bodyData, null, null)
            .then(function(metadata) {
                console.log(metadata);
                console.log('VDJ-ADC-API INFO: Created async metadata:', metadata.uuid);
                if (count_query)
                    //countQueue.add({metadata: metadata}, {attempts: 5, backoff: 5000});
                    countQueue.add({metadata: metadata});
                else
                    //submitQueue.add({metadata: metadata}, {attempts: 5, backoff: 5000});
                    submitQueue.add({metadata: metadata});
                res.status(200).json({"message":"rearrangement lrq submitted.", "query_id": metadata.uuid});
                return;
            })
            .catch(function(error) {
                var msg = "VDJ-ADC-API ERROR (queryRearrangements): " + error;
                res.status(500).json({"message":result_message});
                console.error(msg);
                webhookIO.postToSlack(msg);
                queryRecord['status'] = 'error';
                queryRecord['message'] = msg;
                queryRecord['end'] = Date.now();
                agaveIO.recordQuery(queryRecord);
            });
    } else if (!facets) {
        // perform non-facets query
        var queryFunction = agaveIO.performQuery;
        if (query && query.length > config.large_query_size) {
            if (config.debug) console.log('VDJ-ADC-API INFO: Large query detected.');
            queryFunction = agaveIO.performLargeQuery;
        }
        //if (config.debug) console.log(query);

        return queryFunction(collection, query, null, page, pagesize)
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
                        if (record['vdjserver_junction_suffixes'])
                            if (projection['vdjserver_junction_suffixes'] == undefined)
                                delete record['vdjserver_junction_suffixes'];

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
                    return queryFunction(collection, query, null, page, pagesize)
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
                                if (record['vdjserver_junction_suffixes'])
                                    if (projection['vdjserver_junction_suffixes'] == undefined)
                                        delete record['vdjserver_junction_suffixes'];

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

        if (single_rep_facet) {
            //console.log('single repertoire facet');
            //console.log(query);

            return agaveIO.performQuery(collection, query, null, null, null, true)
                .then(function(record) {
                    //console.log(record);
                    var results = [];
                    if (record) {
                        var new_entry = {}
                        new_entry[facets] = single_rep_id;
                        new_entry['count'] = record['_size'];
                        results.push(new_entry);
                    }
                    if (config.debug) console.log('VDJ-ADC-API INFO: facets rearrangement query returning ' + results.length + ' results to client.');
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
                    var msg = "VDJ-ADC-API ERROR (queryRearrangements, facets): " + error
                        + '\nWhile performing query: ' + query;
                    res.status(500).json({"message":result_message});
                    console.error(msg);
                    webhookIO.postToSlack(msg);
                    queryRecord['status'] = 'error';
                    queryRecord['message'] = msg;
                    queryRecord['end'] = Date.now();
                    agaveIO.recordQuery(queryRecord);
                });

        } else {

            return performFacets(collection, query, field, 1, pagesize)
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
                    if (config.debug) console.log('VDJ-ADC-API INFO: facets rearrangement query returning ' + results.length + ' results to client.');
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
                    var msg = "VDJ-ADC-API ERROR (queryRearrangements, facets): " + error
                        + '\nWhile performing query: ';                
                    if (query && query.length > config.large_query_size)
                        msg += 'a very large query (' + query.length + ')';
                    else
                        msg += query;
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
}
