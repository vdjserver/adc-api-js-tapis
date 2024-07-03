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

var express = require('express');
var bodyParser   = require('body-parser');
var openapi = require('express-openapi');
var path = require('path');
var fs = require('fs');
var yaml = require('js-yaml');
var $RefParser = require("@apidevtools/json-schema-ref-parser");
var airr = require('airr-js');
var vdj_schema = require('vdjserver-schema');

// Express app
var app = module.exports = express();
var context = 'app';

// Server environment config
var config = require('./config/config');

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
app.redisConfig = {
    port: 6379,
    host: 'vdjr-redis'
};

// Tapis
if (config.tapis_version == 2) config.log.info(context, 'Using Tapis V2 API', true);
else if (config.tapis_version == 3) config.log.info(context, 'Using Tapis V3 API', true);
else {
    config.log.error(context, 'Invalid Tapis version, check TAPIS_VERSION environment variable');
    process.exit(1);
}
var tapisV2 = require('vdj-tapis-js/tapis');
var tapisV3 = require('vdj-tapis-js/tapisV3');
var tapisIO = null;
if (config.tapis_version == 2) tapisIO = tapisV2;
if (config.tapis_version == 3) tapisIO = tapisV3;
tapisIO.set_config(config);
var tapisSettings = tapisIO.tapisSettings;
var ServiceAccount = tapisIO.serviceAccount;
var GuestAccount = tapisIO.guestAccount;
var webhookIO = require('vdj-tapis-js/webhookIO');

// Controllers
var statusController = require('./api/controllers/status');
var repertoireController = require('./api/controllers/repertoire');
var rearrangementController = require('./api/controllers/rearrangement');
var cloneController = require('./api/controllers/clone');
var cellController = require('./api/controllers/cell');
var expressionController = require('./api/controllers/expression');
var receptorController = require('./api/controllers/receptor');

// Verify we can login with guest and service account
GuestAccount.getToken()
    .then(function(guestToken) {
        config.log.info(context, 'Successfully acquired guest token.', true);

        // Load AIRR Schema
        return ServiceAccount.getToken();
    })
    .then(function(serviceToken) {
        config.log.info(context, 'Successfully acquired service token.', true);

        // wait for the AIRR schema to be loaded
        return airr.load_schema();
    })
    .then(function() {
        config.log.info(context, 'Loaded AIRR Schema version ' + airr.get_info()['version']);

        // wait for the VDJServer schema to be loaded
        return vdj_schema.load_schema();
    })
    .then(function() {
        config.log.info(context, 'Loaded VDJServer Schema version ' + vdj_schema.get_info()['version']);

        // Load ADC API
        var apiFile = path.resolve(__dirname, 'api/swagger/adc-api-openapi3.yaml');
        config.log.info(context, 'Using ADC API specification: ' + apiFile, true);
        var api_spec = yaml.safeLoad(fs.readFileSync(apiFile, 'utf8'));
        config.log.info(context, 'Loaded ADC API version: ' + api_spec.info.version, true);

        // dereference the API spec
        return $RefParser.dereference(api_spec);
    })
    .then(function(api_schema) {

        // wrap the operations functions to catch syntax errors and such
        // we do not get a good stack trace with the middleware error handler
        var try_function = async function (request, response, the_function) {
            try {
                await the_function(request, response);
            } catch (e) {
                console.error(e);
                console.error(e.stack);
                throw e;
            }
        };

        openapi.initialize({
            apiDoc: api_schema,
            app: app,
            promiseMode: true,
            errorMiddleware: function(err, req, res, next) {
                console.log('Got an error!');
                console.log(JSON.stringify(err));
                console.trace("Here I am!");
                if (err["status"] == 400)
                    res.status(400).json(err.errors);
                else
                    res.status(500).json(err.errors);
            },
            consumesMiddleware: {
                'application/json': bodyParser.json({limit: config.max_query_size})
                //'application/x-www-form-urlencoded': bodyParser.urlencoded({extended: true})
            },
            operations: {
                // service status and info
                get_service_status: statusController.getStatus,
                get_info: statusController.getInfo,

                // repertoires
                get_repertoire: async function(req, res) { return try_function(req, res, repertoireController.getRepertoire); },
                query_repertoires: async function(req, res) { return try_function(req, res, repertoireController.queryRepertoires); },

                // rearrangements
                get_rearrangement: async function(req, res) { return try_function(req, res, rearrangementController.getRearrangement); },
                query_rearrangements: async function(req, res) { return try_function(req, res, rearrangementController.queryRearrangements); },

                // clones
                get_clone: async function(req, res) { return try_function(req, res, cloneController.getClone); },
                query_clones: async function(req, res) { return try_function(req, res, cloneController.queryClones); },

                // cells
                get_cell: async function(req, res) { return try_function(req, res, cellController.getCell); },
                query_cell: async function(req, res) { return try_function(req, res, cellController.queryCells); },

                // expression
                get_expression: async function(req, res) { return try_function(req, res, expressionController.getExpression); },
                query_expression: async function(req, res) { return try_function(req, res, expressionController.queryExpressions); },

                // receptor
                get_receptor: async function(req, res) { return try_function(req, res, receptorController.getReceptor); },
                query_receptor: async function(req, res) { return try_function(req, res, receptorController.queryReceptors); }
            }
        });

        app.listen(app.get('port'), function() {
            config.log.info(context, 'VDJServer ADC API service listening on port ' + app.get('port'), true);
        });
    })
    .catch(function(error) {
        var msg = config.log.error(context, 'Service could not be start.\n' + error);
        //console.trace(msg);
        webhookIO.postToSlack(msg);
        // continue in case its a temporary error
        //process.exit(1);
    });
