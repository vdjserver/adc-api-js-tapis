'use strict';

//
// async-queue.js
// Job queue for processing asynchronous query requests
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

var AsyncQueue = {};
module.exports = AsyncQueue;

// App
var app = require('../../app-async');
var agaveIO = require('../vendor/agaveIO');

// Server environment config
var agaveSettings = require('../../config/tapisSettings');
var config = require('../../config/config');

var Queue = require('bull');

// Steps for a long-running query
// 1. Process request parameters, construct query
// 2. Submit query to Tapis LRQ API
// 3. Create metadata record with any additional info
// ... wait for notification that query is done
// 4. Additional processing/formating of the data, move file?
// 5. Update metadata with status
// 6. Send notification

AsyncQueue.processQueryJobs = function() {
    var submitQueue = new Queue('lrq submit');
    var finishQueue = new Queue('lrq finish');

    submitQueue.process(async (job) => {
        // submit query LRQ API
        console.log('submitting query');
        console.log(job['data']);

        var metadata = null;
        var notification = agaveSettings.notifyHost + '/airr/async/v1/notify/' + job['data']['metadata']['uuid'];
        return agaveIO.performAsyncQuery(job['data']['collection'], job['data']['query'], null, null, null, null, notification)
            .then(function(async_query) {
                metadata = job['data']['metadata'];
                console.log(async_query);
                metadata['value']['lrq_id'] = async_query['_id'];
                metadata['value']['status'] = 'SUBMITTED';
                return agaveIO.updateMetadata(metadata['uuid'], metadata['name'], metadata['value'], null);
            })
            .then(function() {
                // create task to wait for finish notification
                //finishQueue.add({query: 'some info'});

                return Promise.resolve();
            })
            .catch(function(error) {
                var msg = 'VDJ-ADC-ASYNC-API ERROR (submitQueue): Could not submit LRQ.\n.' + error;
                // TODO: update metadata with ERROR
                console.error(msg);
                webhookIO.postToSlack(msg);
                return Promise.reject(new Error(msg));
            });
    });

    finishQueue.process(async (job) => {
        // process data
        console.log('process data');
        console.log(job['data']);

        // create postit with expiration
        // TODO: How to handle permanent?

        // update metadata record
        console.log('update metadata');
        
        return Promise.resolve();
    });

}
