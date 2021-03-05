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
var webhookIO = require('../vendor/webhookIO');
var repertoireController = require('./repertoire');
var rearrangementController = require('./rearrangement');

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
    var countQueue = new Queue('lrq count');
    var submitQueue = new Queue('lrq submit');
    var finishQueue = new Queue('lrq finish');

    countQueue.process(async (job) => {
        // If we do not know the size of the result set, which we generally do not unless
        // the query specifies a size, we first perform a count. The query controller
        // defines count_aggr to generate the count.

        var msg = null;
        var metadata = job['data']['metadata'];
        if (config.debug) console.log('VDJ-ADC-ASYNC-API INFO: submitting count aggregation for LRQ:', metadata['uuid']);
        console.log(job['data']);

        // submit the count aggregation query
        var notification = agaveSettings.notifyHost + '/airr/async/v1/notify/' + metadata['uuid'];
        var count_aggr = [];
        for (var line in metadata['value']['count_aggr']) {
            for (var key in metadata['value']['count_aggr'][line]) {
                // add the $ back in
                var new_object = {};
                var new_key = '$' + key;
                new_object[new_key] = metadata['value']['count_aggr'][line][key];
                count_aggr.push(new_object);
            }
        }
        console.log(count_aggr);
        var async_query = await agaveIO.performAsyncAggregation('count_query', metadata['value']['collection'], count_aggr, notification)
            .catch(function(error) {
                msg = 'VDJ-ADC-ASYNC-API ERROR (countQueue): Could not submit count query for LRQ ' + metadata['uuid'] + '.\n.' + error;
                console.error(msg);
                webhookIO.postToSlack(msg);
            });

        // set to error status
        if (! async_query) {
            metadata["value"]["status"] = "ERROR";
            await agaveIO.updateMetadata(metadata['uuid'], metadata['name'], metadata['value'], null);
            return Promise.reject(new Error(msg));
        }

        if (config.debug) console.log('VDJ-ADC-ASYNC-API INFO: Count aggregation submitted with LRQ ID:', async_query['_id']);

        // update metadata
        metadata['value']['lrq_id'] = async_query['_id'];
        metadata['value']['status'] = 'COUNTING';
        await agaveIO.updateMetadata(metadata['uuid'], metadata['name'], metadata['value'], null)
            .catch(function(error) {
                msg = 'VDJ-ADC-ASYNC-API ERROR (countQueue): Could not update metadata for LRQ ' + metadata["uuid"] + '.\n' + error;
                console.error(msg);
                webhookIO.postToSlack(msg);
            });

        return Promise.resolve();
    });

    submitQueue.process(async (job) => {
        // submit query LRQ API

        var msg = null;
        var metadata = job['data']['metadata'];
        if (config.debug) console.log('VDJ-ADC-ASYNC-API INFO: submitting query for LRQ:', metadata['uuid']);
        console.log(job['data']);

        // generate the full query
        var query_aggr = [];
        for (var line in metadata['value']['query_aggr']) {
            for (var key in metadata['value']['query_aggr'][line]) {
                // add the $ back in
                var new_object = {};
                var new_key = '$' + key;
                new_object[new_key] = metadata['value']['query_aggr'][line][key];
                query_aggr.push(new_object);
            }
        }
        console.log(query_aggr);

        // submit the full query
        var notification = agaveSettings.notifyHost + '/airr/async/v1/notify/' + metadata['uuid'];
        var async_query = await agaveIO.performAsyncAggregation('full_query', metadata['value']['collection'], query_aggr, notification)
            .catch(function(error) {
                msg = 'VDJ-ADC-ASYNC-API ERROR (submitQueue): Could not submit full query for LRQ ' + metadata['uuid'] + '.\n.' + error;
                console.error(msg);
                webhookIO.postToSlack(msg);
            });

        // set to error status if failed
        if (! async_query) {
            metadata["value"]["status"] = "ERROR";
            await agaveIO.updateMetadata(metadata['uuid'], metadata['name'], metadata['value'], null);
            return Promise.reject(new Error(msg));
        }

        if (config.debug) console.log('VDJ-ADC-ASYNC-API INFO: Full query submitted with LRQ ID:', async_query['_id']);

        // update metadata
        metadata['value']['lrq_id'] = async_query['_id'];
        metadata['value']['status'] = 'SUBMITTED';
        await agaveIO.updateMetadata(metadata['uuid'], metadata['name'], metadata['value'], null)
            .catch(function(error) {
                msg = 'VDJ-ADC-ASYNC-API ERROR (submitQueue): Could not update metadata for LRQ ' + metadata["uuid"] + '.\n' + error;
                console.error(msg);
                webhookIO.postToSlack(msg);
            });

        return Promise.resolve();
    });

    finishQueue.process(async (job) => {
        // process data
        console.log('process data');
        console.log(job['data']);
        var metadata = job['data']['metadata'];

        var controller = null;
        if (metadata["value"]["endpoint"] == "repertoire") controller = repertoireController;
        if (metadata["value"]["endpoint"] == "rearrangement") controller = rearrangementController;
        if (! controller) {
            var msg = 'Unknown endpoint: ' + metadata["value"]["endpoint"];
            console.error(msg);
            return Promise.reject(new Error(msg));
        }

        // process data into final format
        var msg = null;
        var outname = await controller.processLRQfile(metadata["uuid"])
            .catch(function(error) {
                msg = 'VDJ-ADC-ASYNC-API ERROR (finishQueue): Could not finish processing LRQ ' + metadata["uuid"] + '.\n' + error;
                console.error(msg);
                webhookIO.postToSlack(msg);
            });

        // set to error status
        if (! outname) {
            metadata["value"]["status"] = "ERROR";
            await agaveIO.updateMetadata(metadata['uuid'], metadata['name'], metadata['value'], null);
            return Promise.reject(new Error(msg));
        }

        if (config.debug) console.log('VDJ-ADC-ASYNC-API INFO: final processed file: ' + outname);
        metadata["value"]["final_file"] = outname;

        // create postit with expiration
        // TODO: How to handle permanent?
        var url = 'https://' + agaveSettings.hostname
            + '/files/v2/media/system/'
            + agaveSettings.storageSystem
            + '//irplus/data/lrqdata/' + outname
            + '?force=true';

        var postit = await agaveIO.createPublicFilePostit(url, false, config.async.max_uses, config.async.lifetime)
            .catch(function(error) {
                msg = 'VDJ-ADC-ASYNC-API ERROR (finishQueue): Could not create postit for LRQ ' + metadata["uuid"] + '.\n' + error;
                console.error(msg);
                webhookIO.postToSlack(msg);
            });

        // set to error status
        if (! postit) {
            metadata["value"]["status"] = "ERROR";
            await agaveIO.updateMetadata(metadata['uuid'], metadata['name'], metadata['value'], null);
            return Promise.reject(new Error(msg));
        }

        // update with processed file
        if (config.debug) console.log('VDJ-ADC-ASYNC-API INFO: Created postit: ' + postit["postit"]);
        metadata["value"]["postit_id"] = postit["postit"];
        metadata["value"]["download_url"] = postit["_links"]["self"]["href"];
        metadata["value"]["status"] = "FINISHED";
        var retry = false;
        await agaveIO.updateMetadata(metadata['uuid'], metadata['name'], metadata['value'], null)
            .catch(function(error) {
                msg = 'VDJ-ADC-ASYNC-API ERROR (finishQueue): Could not update metadata for LRQ ' + metadata["uuid"] + '.\n' + error;
                console.error(msg);
                retry = true;
            });
        if (retry) {
            console.log('VDJ-ADC-ASYNC-API INFO (finishQueue): Retrying updateMetadata');
            await agaveIO.updateMetadata(metadata['uuid'], metadata['name'], metadata['value'], null)
            .catch(function(error) {
                msg = 'VDJ-ADC-ASYNC-API ERROR (finishQueue): Could not update metadata for LRQ ' + metadata["uuid"] + '. Metadata in inconsistent state.\n' + error;
                console.error(msg);
                webhookIO.postToSlack(msg);
                return Promise.reject(new Error(msg));
            });
        }

        // TODO: send notification

        return Promise.resolve();
    });
}
