'use strict';

//
// airr-schema.js
// Helper functions for the AIRR Schema
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

// Server environment config
var config = require('../../config/config');

// Node Libraries
var yaml = require('js-yaml');
var path = require('path');
var fs = require('fs');
var $RefParser = require('json-schema-ref-parser');

var airr = {};
module.exports = airr;

// AIRR config
var airrConfig = {
  appRoot: __dirname, // required config
  configDir: 'config'
};

airr.schema = function() {
    // Load AIRR spec for field names
    var airrFile = path.resolve(airrConfig.appRoot, '../../config/airr-schema.yaml');
    //console.log(airrFile);
    var doc = yaml.safeLoad(fs.readFileSync(airrFile));
    if (!doc) {
        var msg = 'VDJServer ADC API ERROR: Could not load AIRR schema yaml file.';
	console.error(msg);
	throw new Error(msg);
    }
    // dereference all $ref objects, returns a promise
    return $RefParser.dereference(doc);
}

// Given a field, check if included in field set
// Field sets include:
// miairr, for only MiAIRR fields
// airr-core, for all required and identifier fields
// airr-schema, for all fields
airr.checkSet = function(schema, field_set, f) {
    switch (field_set) {
    case 'miairr':
        if ((schema['properties'][f]['x-airr']) && (schema['properties'][f]['x-airr']['miairr']))
	    return true;
        break;
    case 'airr-core':
        // miairr
        if ((schema['properties'][f]['x-airr']) && (schema['properties'][f]['x-airr']['miairr']))
	    return true;
        // identifer
        if ((schema['properties'][f]['x-airr']) && (schema['properties'][f]['x-airr']['identifier']))
            return true;
        // required
        if ((schema['required']) && (schema['required'].indexOf(f) >= 0))
            return true;
        break;
    case 'airr-schema':
        // all fields
        return true;
        break;
    }
    return false;
}

// Recursively walk through schema and collect fields based upon field set.
// The schema loader resolves the $ref references so we do not need to follow them.
airr.collectFields = function(schema, field_set, field_list, context, force) {
    for (var f in schema['properties']) {
	var full_field = f;
	if (context) full_field = context + '.' + f;
	//console.log(full_field);
	//console.log(schema['properties'][f]);

        // check if deprecated
        if ((schema['properties'][f]['x-airr']) && (schema['properties'][f]['x-airr']['deprecated']))
            continue;

        var field_type = schema['properties'][f]['type'];
        switch (field_type) {
        case 'object':
	    // sub-object
            if ((schema['properties'][f]['x-airr']) && (schema['properties'][f]['x-airr']['ontology'])) {
                // if it is an ontology object, check the object then force the ontology fields if necessary
                if (airr.checkSet(schema, field_set, f))
	            airr.collectFields(schema['properties'][f], field_set, field_list, full_field, true);
            } else
	        airr.collectFields(schema['properties'][f], field_set, field_list, full_field, force);
            break;
        case 'array':
	    if (schema['properties'][f]['items']['type'] == 'object') {
		// array of sub-objects
		airr.collectFields(schema['properties'][f]['items'], field_set, field_list, full_field, force);
            } else if (schema['properties'][f]['items']['allOf']) {
		// array of composite objects
		for (var s in schema['properties'][f]['items']['allOf']) {
		    airr.collectFields(schema['properties'][f]['items']['allOf'][s], field_set, field_list, full_field, force);
		}
            } else {
                // array of primitive types
                if (airr.checkSet(schema, field_set, f))
                    field_list.push(full_field);
            }
            break;
        case 'string':
        case 'number':
        case 'integer':
        case 'boolean':
            // primitive types
            if (force)
                field_list.push(full_field);
            else if (airr.checkSet(schema, field_set, f))
                field_list.push(full_field);
            break;
        default:
	    // unhandled schema structure
	    console.error('VDJServer ADC API INFO: Unhandled schema structure: ' + full_field);
            break;
	}
    }
}

// Add the fields to the document if any are missing
airr.addFields = function(document, field_list, schema) {
    for (var r in field_list) {
	var path = field_list[r].split('.');
	var obj = document;
	var spec = schema;
	for (var p = 0; p < path.length; p++) {
	    spec = spec['properties'][path[p]];
            // if not in the spec then give up
            if (!spec) break;

	    if (spec['type'] == 'array') {
		if ((spec['items']['type'] == undefined) || (spec['items']['type'] == 'object')) {
		    // array of object
		    if (obj[path[p]] == undefined) obj[path[p]] = [{}];
		    var sub_spec = spec['items'];
		    if (spec['items']['allOf']) {
			// need to combine the properties
			sub_spec = { type: 'object', properties: {} };
			for (var i in spec['items']['allOf']) {
			    var sub_obj = spec['items']['allOf'][i];
			    for (var j in sub_obj['properties']) {
				sub_spec['properties'][j] = sub_obj['properties'][j];
			    }
			}
		    }
		    for (var a in obj[path[p]]) {
			airr.addFields(obj[path[p]][a], [ path.slice(p+1).join('.') ], sub_spec);
		    }
		} else {
		    // array of primitive data types
		    if (obj[path[p]] == undefined) obj[path[p]] = null;
		}
		break;
	    } else if (spec['type'] == 'object') {
		if (obj[path[p]] == undefined) {
		    if (p == path.length - 1) obj[path[p]] = null;
		    else obj[path[p]] = {};
		}
		obj = obj[path[p]];
	    } else if (obj[path[p]] != undefined) obj = obj[path[p]];
	    else if (p == path.length - 1) obj[path[p]] = null;
	    else console.error('VDJServer ADC API ERROR: Internal error (addFields) do not know how to handle path element: ' + p);
	}
    }
}
