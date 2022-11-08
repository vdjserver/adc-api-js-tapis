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
var errorHandler = require('errorhandler');
var bodyParser   = require('body-parser');
var openapi = require('express-openapi');
var path = require('path');
var fs = require('fs');
var yaml = require('js-yaml');
var $RefParser = require("@apidevtools/json-schema-ref-parser");

// Express app
var app = module.exports = express();
var context = 'app';

// Server environment config
var config = require('./config/config');
var airr = require('./api/helpers/airr-schema');
var webhookIO = require('./api/vendor/webhookIO');

// Tapis
if (config.tapis_version == 2) config.log.info(context, 'Using Tapis V2 API', true);
else if (config.tapis_version == 3) config.log.info(context, 'Using Tapis V3 API', true);
else {
    config.log.error(context, 'Invalid Tapis version, check TAPIS_VERSION environment variable');
    process.exit(1);
}
var tapisIO = null;
if (config.tapis_version == 2) tapisIO = require('vdj-tapis-js');
if (config.tapis_version == 3) tapisIO = require('vdj-tapis-js/tapisV3');

// Controllers
var statusController = require('./api/controllers/status');
var repertoireController = require('./api/controllers/repertoire');
var rearrangementController = require('./api/controllers/rearrangement');
var cloneController = require('./api/controllers/clone');
var cellController = require('./api/controllers/cell');
var expressionController = require('./api/controllers/expression');
var receptorController = require('./api/controllers/receptor');

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

// Verify we can login with guest and service account
var ServiceAccount = tapisIO.serviceAccount;
var GuestAccount = tapisIO.guestAccount;
GuestAccount.getToken()
    .then(function(guestToken) {
        config.log.info(context, 'Successfully acquired guest token.', true);

        // Load AIRR Schema
        return ServiceAccount.getToken();
    })
    .then(function(serviceToken) {
        config.log.info(context, 'Successfully acquired service token.', true);

        // Load AIRR Schema
        return airr.schema();
    })
    .then(function(schema) {
        // save in global
        global.airr = schema;

        config.log.info(context, 'Loaded AIRR Schema, version ' + schema['Info']['version'], true);

        // Load API
        var apiFile = path.resolve(__dirname, 'api/swagger/adc-api.yaml');
        config.log.info(context, 'Using ADC API specification: ' + apiFile, true);
        var api_spec = yaml.safeLoad(fs.readFileSync(apiFile, 'utf8'));
        config.log.info(context, 'Loaded ADC API version: ' + api_spec.info.version, true);

        // dereference the API spec
        //
        // OPENAPI BUG: We should not have to do this, but openapi does not seem
        // to recognize the nullable flags or the types with $ref
        // https://github.com/kogosoftwarellc/open-api/issues/647
        return $RefParser.dereference(api_spec);
    })
    .then(function(api_schema) {
        // save in global
        global.adc_api = api_schema;
        //console.log(JSON.stringify(api_schema.components.schemas.cell_extension, null, 2));

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
                get_repertoire: repertoireController.getRepertoire,
                query_repertoires: repertoireController.queryRepertoires,
                
                // rearrangements
                get_rearrangement: rearrangementController.getRearrangement,
                query_rearrangements: rearrangementController.queryRearrangements,

                // clones
                get_clone: cloneController.getClone,
                query_clones: cloneController.queryClones,

                // cells
                get_cell: cellController.getCell,
                query_cell: cellController.queryCells,

                // expression
                get_expression: expressionController.getExpression,
                query_expression: expressionController.queryExpressions,

                // receptor
                get_receptor: receptorController.getReceptor,
                query_receptor: receptorController.queryReceptors
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
