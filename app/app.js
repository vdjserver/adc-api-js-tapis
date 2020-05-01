'use strict';

//
// app.js
// Application entry point
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

var app = require('express')();
var path = require('path');
var fs = require('fs');
var yaml = require('js-yaml');
var Runner = require('swagger-node-runner');

// Server environment config
var config = require('./config/config');
var airr = require('./api/helpers/airr-schema');

var webhookIO = require('./api/vendor/webhookIO');

module.exports = app; // for testing

// Swagger middleware config
var swaggerConfig = {
  appRoot: __dirname, // required config
  configDir: 'config'
};

// Verify we can login with guest account
var GuestAccount = require('./api/models/guestAccount');
GuestAccount.getToken()
    .then(function(guestToken) {
	console.log('VDJServer ADC API INFO: Successfully acquired guest token.');

	// Load swagger API
	//console.log(config.appRoot);
	var swaggerFile = path.resolve(swaggerConfig.appRoot, 'api/swagger/adc-api.yaml');
	console.log('Using ADC API specification: ' + swaggerFile);
	swaggerConfig.swagger = yaml.safeLoad(fs.readFileSync(swaggerFile, 'utf8'));
	console.log('Loaded ADC API version: ' + swaggerConfig.swagger.info.version);

	// Load AIRR Schema
	return airr.schema();
    })
    .then(function(schema) {
	// store the schema as a global so all code can see it
	console.log('Loaded AIRR Schema, version ' + schema['Info']['version']);
	global.airr = schema;

	Runner.create(swaggerConfig, function(err, runner) {
	    if (err) { throw err; }

	    // install middleware
	    var swaggerExpress = runner.expressMiddleware();
	    swaggerExpress.register(app);

	    var port = config.port || 8020;
	    app.listen(port);

	    console.log('VDJServer ADC API listening on port:' + port);
	});
    })
    .fail(function(error) {
	console.error('VDJServer ADC API ERROR: Service could not be start.\n' + error);
	webhookIO.postToSlack('VDJServer ADC API ERROR: Unable to login with guest account.\nSystem may need to be restarted.\n' + error);
	//process.exit(1);
    });
