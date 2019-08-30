'use strict';

var util = require('util');

// Server environment config
var config = require('../../config/config');
var agaveSettings = require('../../config/tapisSettings');

var assert = require('assert');

// Processing
var agaveIO = require('../vendor/agaveIO');

// API customization
var custom_file = undefined;
if (config.custom_file) {
    custom_file = require('../../config/' + config.custom_file);
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
    var content_type = 'string';
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
	    return '{"' + content['field'] + '": { "$ne":"' + content_value + '"}}';
	}
	return null;

    case '<':
	if ((content['field'] != undefined) && (content_value != undefined)) {
	    return '{"' + content['field'] + '": { "$lt":"' + content_value + '"}}';
	}
	return null;

    case '<=':
	if ((content['field'] != undefined) && (content_value != undefined)) {
	    return '{"' + content['field'] + '": { "$lte":"' + content_value + '"}}';
	}
	return null;

    case '>':
	if ((content['field'] != undefined) && (content_value != undefined)) {
	    return '{"' + content['field'] + '": { "$gt":"' + content_value + '"}}';
	}
	return null;

    case '>=':
	if ((content['field'] != undefined) && (content_value != undefined)) {
	    return '{"' + content['field'] + '": { "$gte":"' + content_value + '"}}';
	}
	return null;

    case 'contains':
	if ((content['field'] != undefined) && (content_value != undefined)) {
	    return '{"' + content['field'] + '": { "$regex":' + content_value + ', "$options": "i"}}';
	}
	return null;

    case 'is': // is missing
	if (content['field'] != undefined) {
	    return '{"' + content['field'] + '": { "$exists": false } }';
	}
	return null;

    case 'not': // is not missing
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
	    return '{"' + content['field'] + '": { "$in":' + content_value + '}}';
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
	console.error('VDJ-ADC-API ERROR: Unknown operator in filters:', filter['op']);
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
	    if (record['_returned'] == 0) {
		res.json({"Info":info,"Repertoire":[]});
	    } else {
		record = record['_embedded'][0];
		if (record['_id']) delete record['_id'];
		if (record['_etag']) delete record['_etag'];
		res.json({"Info":info,"Repertoire":[record]});
	    }
	})
	.fail(function(error) {
	    console.error('VDJ-ADC-API INFO: getRepertoire error: ' + error);
	    res.status(500).json({"message":result_message});
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
    var page = 0;
    var pagesize = config.max_size;

    // size parameter
    var size = 0;
    if (bodyData['size'] != undefined)
	size = bodyData['size'];
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
    var from = 0;
    var from_skip = 0;
    var size_stop = pagesize;
    if (bodyData['from'] != undefined)
	from = bodyData['from'];
    if (from < 0) {
	result_message = "Negative from (" + from + ") not allowed.";
	res.status(400).json({"message":result_message});
	return;
    }
    if (from != 0) {
	page = Math.trunc(from / pagesize);
	from_skip = from % pagesize;
	size_stop = from_skip + size;
    }

    // we might need to do a second query to get the rest
    var second_size = 0;
    if ((from + size) > (page + 1)*pagesize) {
	second_size = (from + size) - (page + 1)*pagesize;
    }

    // construct query string
    var filter = {};
    var query = undefined;
    if (bodyData['filters'] != undefined) {
	filter = bodyData['filters'];
	//console.log(filter);
	query = constructQueryOperation(filter);
	//console.log(query);

	if (!query) {
	    result_message = "Could not construct valid query.";
	    res.status(400).json({"message":result_message});
	    return;
	}
    }

    var facets = bodyData['facets'];
    var agg = [];
    if (facets != undefined) {
	if (query) agg.push({ $match: query });
	agg.push(
		{ $group: {
		    _id: '$' + facets,
		    count: { $sum: 1}
		}});
	console.log(agg);
    }

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
    if (!facets) {
	var collection = 'repertoire';
	//console.log(query);
	agaveIO.performQuery(collection, query, projection, page, pagesize)
	    .then(function(records) {
		if (abortQuery) {
		    console.log('VDJ-ADC-API INFO: client aborted query.');
		    return;
		}

		console.log('VDJ-ADC-API INFO: query returned ' + records['_returned'] + ' records.');
		if (records['_returned'] == 0) {
		    results = [];
		} else {
		    // loop through records, clean data
		    // and only retrieve desired from/size
		    for (var i in records['_embedded']) {
			if (i < from_skip) continue;
			if (i >= size_stop) break;
			var record = records['_embedded'][i];
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

		if ((!second_size) || (results.length < pagesize)) {
		    // only one query so return the results	
		    console.log('VDJ-ADC-API INFO: returning ' + results.length + ' records to client.');
		    res.json({"Info":info,"Repertoire":results});
		} else {
		    // we need to do a second query for the rest
		    page += 1;
		    agaveIO.performQuery(collection, query, projection, page, pagesize)
			.then(function(records) {
			    console.log('VDJ-ADC-API INFO: second query returned ' + records['_returned'] + ' records.')

			    // loop through records, clean data
			    // and only retrieve desired from/size
			    for (var i in records['_embedded']) {
				if (i >= second_size) break;
				var record = records['_embedded'][i];
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
		console.error("VDJ-ADC-API ERROR: " + error);
		res.status(500).json({"message":result_message});
	    });
    }
}
