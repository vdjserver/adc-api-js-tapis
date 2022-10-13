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

// Server environment config
var config = require('./config/config');
var airr = require('./api/helpers/airr-schema');
var webhookIO = require('./api/vendor/webhookIO');

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

/*
    This is hack for when x-www-form-urlencoded is really JSON.
    We don't want to use it.

app.use(
  bodyParser.raw({ type : 'application/x-www-form-urlencoded' }),
  function(req, res, next) {
    try {
      req.body = JSON.parse(req.body)
    } catch(e) {
      req.body = require('qs').parse(req.body.toString());
    }
    next();
  }
);
*/

// Verify we can login with guest account
var GuestAccount = require('./api/models/guestAccount');
GuestAccount.getToken()
    .then(function(guestToken) {
        console.log('VDJ-ADC-API INFO: Successfully acquired guest token.');

        // Load AIRR Schema
        return airr.schema();
    })
    .then(function(schema) {
        // save in global
        global.airr = schema;

        console.log('VDJ-ADC-API INFO: Loaded AIRR Schema, version ' + schema['Info']['version']);

        // Load API
        var apiFile = path.resolve(__dirname, 'api/swagger/adc-api.yaml');
        console.log('VDJ-ADC-API INFO: Using ADC API specification: ' + apiFile);
        var api_spec = yaml.safeLoad(fs.readFileSync(apiFile, 'utf8'));
        console.log('VDJ-ADC-API INFO: Loaded ADC API version: ' + api_spec.info.version);

        // dereference the API spec
        //
        // OPENAPI BUG: We should not have to do this, but openapi does not seem
        // to recognize the nullable flags or the types with $ref
        // https://github.com/kogosoftwarellc/open-api/issues/647
        return $RefParser.dereference(api_spec);
    })
    .then(function(api_schema) {
        //console.log(api_schema);

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
            console.log('VDJ-ADC-API INFO: VDJServer ADC API service listening on port ' + app.get('port'));
        });
    })
    .catch(function(error) {
        var msg = 'VDJ-ADC-API ERROR: Service could not be start.\n' + error;
        console.error(msg);
        console.trace(msg);
        webhookIO.postToSlack(msg);
        // continue in case its a temporary error
        //process.exit(1);
    });
