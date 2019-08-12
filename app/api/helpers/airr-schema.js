'use strict';

// Server environment config
var config = require('../../config/config');
var mongoSettings = require('../../config/mongoSettings');

// Node Libraries
var yaml = require('js-yaml');
var path = require('path');
var fs = require('fs');
var $RefParser = require('json-schema-ref-parser');

// API customization
var custom_file = undefined;
if (config.custom_file) {
    custom_file = require('../../config/' + config.custom_file);
}

// AIRR config
var airrConfig = {
  appRoot: __dirname, // required config
  configDir: 'config'
};

module.exports.schema = function() {
    // Load AIRR spec for field names
    var airrFile = path.resolve(airrConfig.appRoot, '../../config/airr-schema.yaml');
    //console.log(airrFile);
    var doc = yaml.safeLoad(fs.readFileSync(airrFile));
    if (!doc) {
	console.error('Could not load AIRR schema yaml file.');
	throw new Error('Could not load AIRR schema yaml file.');
    }
    // dereference all $ref objects, returns a promise
    return $RefParser.dereference(doc);
}
