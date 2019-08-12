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
    getRearrangement: getRearrangement,
    queryRearrangements: queryRearrangements
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
	var schema = global.airr['Rearrangement'];
	var props = schema;

	// traverse down the object schema hierarchy to find field definition
	var objs = content['field'].split('.');
	for (var i = 0; i < objs.length; ++i) {
	    var p = objs[i];
	    if (props.type == 'array') {
		console.log(props.items);
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
	    console.error(content['field'] + ' is not found in AIRR schema.');
	}
    }
    console.log('type: ' + content_type);

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
    console.log('value: ' + content_value);

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
	console.error('Unknown operator in filters:', filter['op']);
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
    console.log('getRearrangement: ' + req.swagger.params['rearrangement_id'].value);

    var collection = 'rearrangement';
    var query = '{ filename_uuid: "' + req.swagger.params['rearrangement_id'].value + '" }';
    //var query = '{rearrangement_id:"' + req.swagger.params['rearrangement_id'].value + '"}';

    agaveIO.performQuery(collection, query)
	.then(function(record) {
	    console.log(record);
	    if (record) {
		if (record['_id']) delete record['_id'];
		res.json(record);
	    } else
		res.status(404).json({});
	});
}

function queryRearrangements(req, res) {
    console.log('queryRearrangements');

    req.swagger.operation.parameterObjects.forEach(function(parameter) {
	console.log(parameter.name);
	console.log(parameter.type);
	console.log(req.swagger.params[parameter.name].value);
    });

    var results = [];
    var result = {};
    var result_flag = false;
    var result_message = "Unknown error";

    var bodyData = req.swagger.params['data'].value;

    // field projection
    var projection = {};
    if (bodyData['fields'] != undefined) {
	var fields = bodyData['fields'];
	console.log('fields: ', fields);
	if (! (fields instanceof Array)) {
	    result_message = "fields parameter is not an array.";
	    res.status(400).json({"success":false,"message":result_message});
	    return;
	}
	for (var i = 0; i < fields.length; ++i) {
	    if (fields[i] == '_id') continue;
	    projection[fields[i]] = 1;
	}
    }
    projection['_id'] = 0;

    // format parameter
    var format = 'json';
    if (bodyData['format'] != undefined)
	format = bodyData['format'];
    if ((format != 'json') && (format != 'airr')) {
	res.status(400).end();
	return;
    }

    // from parameter
    var from = 0;
    if (bodyData['from'] != undefined)
	from = bodyData['from'];

    // size parameter
    var size = 0;
    if (bodyData['size'] != undefined)
	size = bodyData['size'];

    // construct query string
    var filter = {};
    var query = undefined;
    if (bodyData['filters'] != undefined) {
	filter = bodyData['filters'];
	console.log(filter);
	query = constructQueryOperation(filter);
	console.log(query);

	if (!query) {
	    result_message = "Could not construct valid query.";
	    res.status(400).json({"success":false,"message":result_message});
	    return;
	}
    }

    // facets parameter
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
    info['title'] = 'AIRR Data Commons API'
    info['description'] = 'API response for rearrangement query'
    info['version'] = schema.version;
    info['contact'] = schema.contact;

    // Handle client HTTP request abort
    var abortQuery = false;
    req.on("close", function() {
	console.log('Client request closed unexpectedly');
	abortQuery = true;
    });

    if (!facets) {
	// format parameter
	var headers = [];
	if (format == 'json') {
	    res.setHeader('Content-Type', 'application/json');
	    res.setHeader('Content-Disposition', 'attachment;filename="data.json"');
	} else if (format == 'airr') {
	    res.setHeader('Content-Type', 'text/tsv');
	    res.setHeader('Content-Disposition', 'attachment;filename="data.tsv"');

	    // Load AIRR spec for field names
	    var schema = global.airr['Rearrangement'];
	    if (!schema) {
		console.error('Rearrangement schema missing.');
		res.status(500).end();
		return;
	    }
	    for (var p in schema['properties']) headers.push(p);

	    res.write(headers.join('\t'));
	    res.write('\n');
	    console.log(headers);
	}

	var first = true;
	if (format == 'json')
	    res.write('{"Info":' + JSON.stringify(info) + ',"Rearrangement": [\n');

	var collection = 'rearrangement';
	console.log(query);
	agaveIO.performQuery(collection, query)
	    .then(function(records) {
		console.log(records);

		var entry = null;

		if (abortQuery) {
		    console.log('aborting query');
		    cursor.close(function(err, result) {
			// db will be closed by callback
		    });
		} else {
		    // data cleanup
		    var record = '';
		    for (var p in entry) {
			if (!entry[p]) delete entry[p];
			else if ((typeof entry[p] == 'string') && (entry[p].length == 0)) delete entry[p];
			else if (p == '_id') delete entry[p];
			//else if (custom_file) custom_file.dataCleanForQuerySequencesData(p, entry, req, res);
		    }

		    if (!first) {
			if (format == 'json') res.write(',\n');
			if (format == 'airr') res.write('\n');
		    }  else {
			first = false;
		    }

		    if (format == 'json') res.write(JSON.stringify(entry));
		    if (format == 'airr') {
			var vals = [];
			for (var i = 0; i < headers.length; ++i) {
			    var p = headers[i];
			    if (!entry[p]) vals.push('');
			    else vals.push(entry[p]);
			}
			res.write(vals.join('\t'));
		    }
		}
	        if (format == 'json') res.write(']}\n');
	        if (format == 'airr') res.write('\n');
	        res.end();
	    });
    }
}
