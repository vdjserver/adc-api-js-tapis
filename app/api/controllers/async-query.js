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
var rearrangementController = require('./rearrangement');

// Server environment config
var config = require('../../config/config');

var Queue = require('bull');
var finishQueue = new Queue('lrq finish');

// return status of asynchronous query
AsyncController.getQueryStatus = function(req, res) {
    var uuid = req.params.query_id;

    agaveIO.getMetadata(uuid)
        .then(function(metadata) {
            console.log(metadata);
            if (! metadata) {
                res.status(404).json({"message":"Unknown query identifier."});
                return;
            }
            if (metadata['name'] != 'async_query') {
                res.status(400).json({"message":"Invalid query identifier."});
                return;
            }

            // restrict the info that is sent back
            var entry = {
                query_id: metadata.uuid,
                endpoint: metadata.value.endpoint,
                status: metadata.value.status,
                created: metadata.created,
                final_file: metadata.value.final_file,
                download_url: metadata.value.download_url
            };

            res.json(entry);
        })
        .catch(function(error) {
            var msg = 'VDJ-ADC-API ERROR (getStatus): Could not get status.\n.' + error;
            res.status(500).json({"message":"Internal service error."});
            console.error(msg);
            //webhookIO.postToSlack(msg);
        });
}

// submit asynchronous query
AsyncController.asyncQueryRepertoire = function(req, res) {
    if (config.debug) console.log('VDJ-ADC-API INFO: asynchronous query for repertoires.');

    req.params.do_async = true;
    return repertoireController.queryRepertoires(req, res);
}

// submit asynchronous query
AsyncController.asyncQueryRearrangement = function(req, res) {
try {
    if (config.debug) console.log('VDJ-ADC-API INFO: asynchronous query for rearrangements.');

    req.params.do_async = true;
    return rearrangementController.queryRearrangements(req, res);
} catch (e) {
    console.log(e);
}
}

// submit asynchronous query
AsyncController.asyncQueryClone = function(req, res) {
    if (config.debug) console.log('VDJ-ADC-API INFO: asynchronous query for clones.');

    res.status(500).json({"message":"Not implemented."});
}

// receive notification from Tapis LRQ
AsyncController.asyncNotify = function(req, res) {
try {
    console.log('VDJ-ADC-API-ASYNC INFO: Received LRQ notification id:', req.params.notify_id, 'body:', JSON.stringify(req.body));

    // return a response
    res.status(200).json({"message":"notification received."});

    // search for metadata item based on LRQ id
    var lrq_id = req.body['result']['_id']
    console.log(lrq_id);
    return agaveIO.getAsyncQueryMetadata(lrq_id)
        .then(function(metadata) {
            console.log(metadata);
            if (metadata.length != 1) {
                return Promise.reject(new Error('Expected single metadata entry but got ' + metadata.length));
            }
            var entry = metadata[0];
            if (entry['uuid'] != req.params.notify_id) {
                return Promise.reject(new Error('Notification id and LRQ id do not match: ' + req.params.notify_id + ' != ' + entry['uuid']));
            }

            if (req.body['status'] == 'FINISHED') {
                entry['value']['status'] = 'PROCESSING';
                entry['value']['raw_file'] = req.body['result']['location'];
            } else {
                // TODO: what else besides FINISHED?
                entry['value']['status'] = req.body['status'];
            }

            // update with additional info
            return agaveIO.updateMetadata(entry['uuid'], entry['name'], entry['value'], null);
        })
        .then(function(metadata) {
            // submit queue job to finish processing
            // TODO: should we retry on error?
            finishQueue.add({metadata: metadata});
        })
        .catch(function(error) {
            var msg = 'VDJ-ADC-ASYNC-API ERROR (asyncNotify): ' + error;
            console.error(msg);
            //webhookIO.postToSlack(msg);
        });
} catch (e) {
    console.log(e);
}
}
