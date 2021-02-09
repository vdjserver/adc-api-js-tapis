'use strict';

//
// async-query.js
// Handle incoming asynchronous query requests
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

var AsyncController = {};
module.exports = AsyncController;

// App
var app = require('../../app-async');
var agaveIO = require('../vendor/agaveIO');
var repertoireController = require('./repertoire');

// Server environment config
var config = require('../../config/config');

var Queue = require('bull');
var finishQueue = new Queue('lrq finish');

// return status of asynchronous query
AsyncController.getQueryStatus = function(req, res) {
    // Verify we can login with guest account
    var GuestAccount = require('../models/guestAccount');
    GuestAccount.getToken()
        .then(function(guestToken) {
            res.json({"result":"success"});
        })
        .catch(function(error) {
            var msg = 'VDJServer ADC API ERROR (getStatus): Could not acquire guest token.\n.' + error;
            res.status(500).json({"message":"Internal service error."});
            console.error(msg);
            webhookIO.postToSlack(msg);
        });
}

// submit asynchronous query
AsyncController.asyncQueryRepertoire = function(req, res) {
    if (config.debug) console.log('VDJ-ADC-API INFO: asynchronous query for repertoires.');

    req.params.do_async = true;
    return repertoireController.queryRepertoires(req, res);

    res.status(500).json({"message":"Not implemented."});
}

// submit asynchronous query
AsyncController.asyncQueryRearrangement = function(req, res) {
    if (config.debug) console.log('VDJ-ADC-API INFO: asynchronous query for rearrangements.');

    res.status(500).json({"message":"Not implemented."});
}

// submit asynchronous query
AsyncController.asyncQueryClone = function(req, res) {
    if (config.debug) console.log('VDJ-ADC-API INFO: asynchronous query for clones.');

    res.status(500).json({"message":"Not implemented."});
}

// receive notification from Tapis LRQ
AsyncController.asyncNotify = function(req, res) {
try {
    console.log('VDJ-ADC-API-ASYNC INFO: Received LRQ notification: ' + JSON.stringify(req.body));

    // return a response
    res.status(200).json({"message":"notification received."});

    // HACK: pull id from location string
    var f = req.body['result']['location'].split('lrq-');
    console.log(f);
    f = f[1].split('.gz');
    console.log(f);
    var lrq_id = f[0];
    console.log(lrq_id);

    // search for metadata item for LRQ
    return agaveIO.getAsyncQueryMetadata(lrq_id)
        .then(function(metadata) {
            console.log(metadata);
        })
        .catch(function(error) {
            var msg = 'VDJ-ADC-ASYNC-API ERROR (asyncNotify): error.\n.' + error;
            //res.status(500).json({"message":"Internal service error."});
            console.error(msg);
            //webhookIO.postToSlack(msg);
        });
} catch (e) {
    console.log(e);
}
}
