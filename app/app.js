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
var errorHandler = require('errorhandler');
var bodyParser   = require('body-parser');
var openapi = require('express-openapi');
var path = require('path');
var fs = require('fs');
var yaml = require('js-yaml');

// Server environment config
var config = require('./config/config');
var airr = require('./api/helpers/airr-schema');

var webhookIO = require('./api/vendor/webhookIO');

module.exports = app; // for testing

// CORS
var allowCrossDomain = function(request, response, next) {
    response.header('Access-Control-Allow-Origin', '*');
    response.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
    response.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Content-Length, X-Requested-With');

    // intercept OPTIONS method
    if ('OPTIONS' === request.method) {
        response.status(200).end();
    }
    else {
        next();
    }
};

// Server Settings
app.set('port', config.port);
app.use(allowCrossDomain);
// trust proxy so we can get client IP
app.set('trust proxy', true);

app.use(errorHandler({
    dumpExceptions: true,
    showStack: true,
}));

// Verify we can login with guest account
var GuestAccount = require('./api/models/guestAccount');
GuestAccount.getToken()
    .then(function(guestToken) {
	console.log('VDJ-ADC-API INFO: Successfully acquired guest token.');

	// Load API
	var apiFile = path.resolve(__dirname, 'api/swagger/adc-api.yaml');
	console.log('VDJ-ADC-API INFO: Using ADC API specification: ' + apiFile);
	global.apiDoc = yaml.safeLoad(fs.readFileSync(apiFile, 'utf8'));
	console.log('VDJ-ADC-API INFO: Loaded ADC API version: ' + global.apiDoc.info.version);

	// Load AIRR Schema
	return airr.schema();
    })
    .then(function(schema) {
	// store the schema as a global so all code can see it
	console.log('VDJ-ADC-API INFO: Loaded AIRR Schema, version ' + schema['Info']['version']);
	global.airr = schema;

        openapi.initialize({
            apiDoc: global.apiDoc,
            app: app,
            promiseMode: true,
            consumesMiddleware: {
                'application/json': bodyParser.json(),
                'application/x-www-form-urlencoded': bodyParser.urlencoded({extended: true})
            },
            operations: {
                get_service_status: apiResponseController.confirmUpStatus,

                // rearrangement statistics
                rearrangement_count: statsController.RearrangementCount,
                rearrangement_junction_length: statsController.RearrangementJunctionLength,
                rearrangement_gene_usage: statsController.RearrangementGeneUsage,

                // clone statistics
                clone_count: statsController.CloneCount,
                clone_junction_length: statsController.CloneJunctionLength,
                clone_gene_usage: statsController.CloneGeneUsage
            }
        });

        app.listen(app.get('port'), function() {
            console.log('VDJ-ADC-API INFO: VDJServer ADC API service listening on port ' + app.get('port'));
        });
    })
    .fail(function(error) {
        var msg = 'VDJ-ADC-API ERROR: Service could not be start.\n' + error;
	console.error(msg);
	webhookIO.postToSlack(msg);
        // continue in case its a temporary error
	//process.exit(1);
    });
