'use strict';

//
// app-async.js
// Application entry point
//
// VDJServer Community Data Portal
// ADC API Asynchronous Extension for VDJServer
// https://vdjserver.org
//
// Copyright (C) 2021 The University of Texas Southwestern Medical Center
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
var asyncController = require('./api/controllers/async-query');

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
app.set('port', config.async_port);
app.use(allowCrossDomain);
// trust proxy so we can get client IP
app.set('trust proxy', true);

//app.redisConfig = {
//    port: 6379,
//    host: 'localhost',
//};

app.use(errorHandler({
    dumpExceptions: true,
    showStack: true,
}));

// Downgrade to host vdj user
// This is also so that the /vdjZ Corral file volume can be accessed,
// as it is restricted to the TACC vdj account.
// read/write access is required.
console.log('VDJ-ADC-API-ASYNC INFO: Downgrading to host user: ' + config.hostServiceAccount);
process.setgid(config.hostServiceGroup);
process.setuid(config.hostServiceAccount);
console.log('VDJ-ADC-API-ASYNC INFO: Current uid: ' + process.getuid());
console.log('VDJ-ADC-API-ASYNC INFO: Current gid: ' + process.getgid());

// Verify we can login with guest account
var GuestAccount = require('./api/models/guestAccount');
GuestAccount.getToken()
    .then(function(guestToken) {
        console.log('VDJ-ADC-API-ASYNC INFO: Successfully acquired guest token.');

        // Load AIRR Schema
        return airr.schema();
    })
    .then(function(schema) {
        // save in global
        global.airr = schema;

        console.log('VDJ-ADC-API-ASYNC INFO: Loaded AIRR Schema, version ' + schema['Info']['version']);

        // Load API
        var apiFile = path.resolve(__dirname, 'api/swagger/adc-api-async.yaml');
        console.log('VDJ-ADC-API-ASYNC INFO: Using ADC API Async specification: ' + apiFile);
        var api_spec = yaml.safeLoad(fs.readFileSync(apiFile, 'utf8'));
        console.log('VDJ-ADC-API-ASYNC INFO: Loaded ADC API Async version: ' + api_spec.info.version);

        // Load internal notify API
        var notifyFile = path.resolve(__dirname, 'api/swagger/async-notify.yaml');
        console.log('VDJ-ADC-API-ASYNC INFO: notify API specification: ' + notifyFile);
        var notify_spec = yaml.safeLoad(fs.readFileSync(notifyFile, 'utf8'));
        // copy paths
        for (var p in notify_spec['paths']) {
            api_spec['paths'][p] = notify_spec['paths'][p];
        }

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
                res.status(500).json(err.errors);
            },
            consumesMiddleware: {
                'application/json': bodyParser.json(),
                'application/x-www-form-urlencoded': bodyParser.urlencoded({extended: true})
            },
            operations: {
                // service status and info
                get_service_status: statusController.getStatus,
                get_info: statusController.getInfo,

                // queries
                get_query_status: asyncController.getQueryStatus,
                async_repertoire: asyncController.asyncQueryRepertoire,
                async_rearrangement: asyncController.asyncQueryRearrangement,
                async_clone: asyncController.asyncQueryClone,
                async_notify: asyncController.asyncNotify
            }
        });

        app.listen(app.get('port'), function() {
            console.log('VDJ-ADC-API-ASYNC INFO: VDJServer ADC API service listening on port ' + app.get('port'));
        });
    })
    .then(function() {
        if (config.async.enable_poll) {
            console.log('VDJ-ADC-API-ASYNC INFO: Polling ENABLED for LRQ');
            AsyncQueue.triggerPolling();
        }
    })
    .catch(function(error) {
        var msg = 'VDJ-ADC-API-ASYNC ERROR: Service could not be start.\n' + error;
        console.error(msg);
        console.trace(msg);
        webhookIO.postToSlack(msg);
        // continue in case its a temporary error
        //process.exit(1);
    });

// Queue Management
var AsyncQueue = require('./api/controllers/async-queue');
AsyncQueue.processQueryJobs();
