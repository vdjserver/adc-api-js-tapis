
'use strict';

//
// adcController.js
// Handle ADC repository load/unload/reload end points
//
// VDJServer Analysis Portal
// VDJ API Service
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

var adcController = {};
module.exports = adcController;

// App
var app = require('../../app');
var config = require('../../config/config');

// Controllers
var apiResponseController = require('./apiResponseController');

// Schemas
var airr = require('airr-js');
var vdj_schema = require('vdjserver-schema');

// Queues
var adcQueueManager = require('../queues/adcQueueManager');
var adcDownloadQueueManager = require('../queues/adcDownloadQueueManager');

// Tapis
var tapisSettings = require('vdj-tapis-js/tapisSettings');
var tapisIO = tapisSettings.get_default_tapis();
var ServiceAccount = tapisIO.serviceAccount;
var GuestAccount = tapisIO.guestAccount;
var webhookIO = require('vdj-tapis-js/webhookIO');
var mongoSettings = require('vdj-tapis-js/mongoSettings');


//
// Load project data into VDJServer ADC data repository
//
// Instead of using the project metadata record, we setup
// and additional metadata record (name:projectLoad) that
// keeps track of the state of the load process.
//

// 1. set load flag on project
// 2. load repertoire metadata
// 3. set load flag on each repertoire for rearrangement load
// 4. load rearrangements for each repertoire
// 5. set verification flag

adcController.loadProject = async function(request, response) {
    var context = 'adcController.loadProject';
    var projectUuid = request.params.project_uuid;
    var msg = null;

    // check for project load metadata
    var loadMetadata = await tapisIO.getProjectLoadMetadata(projectUuid, tapisSettings.mongo_loadCollection)
        .catch(function(error) {
            msg = 'tapisIO.getProjectLoadMetadata, error: ' + error;
        });
    if (msg) {
        msg = config.log.error(context, msg);
        webhookIO.postToSlack(msg);
        return apiResponseController.sendError(msg, 500, response);
    }
    console.log(loadMetadata);

    // load record already exists
    if (loadMetadata && loadMetadata[0]) {
        loadMetadata = loadMetadata[0];

        if (loadMetadata['value']['isLoaded']) {
            msg = 'project: ' + projectUuid + ', error: project already loaded'
                + ', metadata: ' + loadMetadata.uuid;
            msg = config.log.error(context, msg);
            webhookIO.postToSlack(msg);            
            return apiResponseController.sendError(msg, 400, response);
        }

        if (loadMetadata['value']['shouldLoad']) {
            msg = 'project: ' + projectUuid + ', error: project already flagged for load'
                + ', metadata: ' + loadMetadata.uuid;
            msg = config.log.error(context, msg);
            webhookIO.postToSlack(msg);            
            return apiResponseController.sendError(msg, 400, response);
        }

        config.log.info(context, 'project: ' + projectUuid + ' load record already exists, marking for load'
                    + ', metadata: ' + loadMetadata.uuid);

        loadMetadata['value']['shouldLoad'] = true;
        await tapisIO.updateDocument(loadMetadata.uuid, loadMetadata.name, loadMetadata.value)
            .catch(function(error) {
                msg = 'tapisIO.updateDocument, error: ' + error;
            });
        if (msg) {
            msg = config.log.error(context, msg);
            webhookIO.postToSlack(msg);
            return apiResponseController.sendError(msg, 500, response);
        }

        adcQueueManager.triggerProjectLoad();

        return apiResponseController.sendSuccess('Project marked for load', response);

    } else {

        // TODO: Project needs to be published?

        // create the project load metadata
       loadMetadata = await tapisIO.createProjectLoadMetadata(projectUuid, mongoSettings.loadCollection)
            .catch(function(error) {
                msg = 'tapisIO.createProjectLoadMetadata, error: ' + error;
            });
        if (msg) {
            msg = config.log.error(context, msg);
            webhookIO.postToSlack(msg);
            return apiResponseController.sendError(msg, 500, response);
        }

        // trigger load queue if necessary
        config.log.info(context, 'project: ' + projectUuid + ' flagged for repository load'
                    + ', metadata: ' + loadMetadata.uuid);

        adcQueueManager.triggerProjectLoad();

        return apiResponseController.sendSuccess('Project marked for load', response);
    }
};

//
// Unload project data from VDJServer ADC data repository
//
adcController.unloadProject = async function(request, response) {
    var projectUuid = request.params.project_uuid;
    var load_id = request.body.load_id;
    var clear_cache = request.body.clear_cache;
    var clear_statistics = request.body.clear_statistics;
    var msg = null;

    return apiResponseController.sendError('Not implemented', 500, response);

/*    console.log('VDJ-API INFO (ProjectController.unloadProject): start, project: ' + projectUuid);
    console.log(request.body);

    // check for project load metadata
    var loadMetadata = await tapisIO.getProjectLoadMetadata(projectUuid, mongoSettings.loadCollection)
        .catch(function(error) {
            msg = 'VDJ-API ERROR: ProjectController.unloadProject - tapisIO.getProjectLoadMetadata, error: ' + error;
        });
    if (msg) {
        console.error(msg);
        webhookIO.postToSlack(msg);
        return apiResponseController.sendError(msg, 500, response);
    }

    if (loadMetadata && loadMetadata[0]) {
        loadMetadata = loadMetadata[0];
        if (loadMetadata['uuid'] != load_id) {
            msg = 'VDJ-API ERROR (ProjectController.unloadProject): Invalid load metadata id for project: ' + projectUuid;
            console.error(msg);
            webhookIO.postToSlack(msg);            
            return apiResponseController.sendError(msg, 400, response);
        }

        // turn off load
        loadMetadata['value']['shouldLoad'] = false;
        loadMetadata['value']['isLoaded'] = false;
        loadMetadata['value']['repertoireMetadataLoaded'] = false;
        loadMetadata['value']['rearrangementDataLoaded'] = false;
        await tapisIO.updateMetadata(loadMetadata.uuid, loadMetadata.name, loadMetadata.value, loadMetadata.associationIds)
            .catch(function(error) {
                msg = 'VDJ-API ERROR: ProjectController.unloadProject - tapisIO.getProjectLoadMetadata, error: ' + error;
            });
        if (msg) {
            console.error(msg);
            webhookIO.postToSlack(msg);
            return apiResponseController.sendError(msg, 500, response);
        }

        // trigger load queue if necessary
        console.log('VDJ-API INFO: ProjectController.unloadProject, project: ' + projectUuid + ' flagged for repository unload'
            + ', metadata: ' + loadMetadata.uuid);

        projectQueueManager.triggerProjectUnload(projectUuid, loadMetadata);

        // clear ADC download cache
        if (clear_cache) {
            await ServiceAccount.getToken()
                .catch(function(error) {
                    msg = 'VDJ-API ERROR (ProjectController.unloadProject): ServiceAccount.getToken, error: ' + error;
                });
            if (msg) {
                console.error(msg);
                webhookIO.postToSlack(msg);
                return apiResponseController.sendError(msg, 500, response);
            }

            // get the study_id
            var projectMetadata = await tapisIO.getProjectMetadata(ServiceAccount.accessToken(), projectUuid)
                .catch(function(error) {
                    msg = 'VDJ-API ERROR (ProjectController.unloadProject): tapisIO.getProjectMetadata, error: ' + error;
                });
            if (msg) {
                console.error(msg);
                webhookIO.postToSlack(msg);
                return apiResponseController.sendError(msg, 500, response);
            }

            // assume VDJServer repository
            adcDownloadQueueManager.triggerClearCache('vdjserver', projectMetadata['value']['study_id']);
        }

        // clear statistics cache
        if (clear_statistics) {
            console.log('TODO: clear statistics cache');
        }

        return apiResponseController.sendSuccess('Project queued for unload', response);
    } else {
        msg = 'VDJ-API ERROR (ProjectController.unloadProject): project: ' + projectUuid + ' does not have load metadata.';
        console.error(msg);
        webhookIO.postToSlack(msg);            
        return apiResponseController.sendError(msg, 400, response);
    } */
};

//
// Reload repertoire metadata for project in VDJServer ADC data repository
//
adcController.reloadProject = async function(request, response) {
    var projectUuid = request.params.project_uuid;
    var load_id = request.body.load_id;
    var msg = null;

    return apiResponseController.sendError('Not implemented', 500, response);

/*    console.log('VDJ-API INFO (ProjectController.reloadProject): start, project: ' + projectUuid);
    console.log(request.body);

    // check for project load metadata
    var loadMetadata = await tapisIO.getProjectLoadMetadata(projectUuid, mongoSettings.loadCollection)
        .catch(function(error) {
            msg = 'VDJ-API ERROR: ProjectController.reloadProject - tapisIO.getProjectLoadMetadata, error: ' + error;
        });
    if (msg) {
        console.error(msg);
        webhookIO.postToSlack(msg);
        return apiResponseController.sendError(msg, 500, response);
    }

    if (loadMetadata && loadMetadata[0]) {
        loadMetadata = loadMetadata[0];
        if (loadMetadata['uuid'] != load_id) {
            msg = 'VDJ-API ERROR (ProjectController.reloadProject): Invalid load metadata id for project: ' + projectUuid + ', ' + load_id + ' != ' + loadMetadata['uuid'];
            console.error(msg);
            webhookIO.postToSlack(msg);            
            return apiResponseController.sendError(msg, 400, response);
        }

        // flag repertoire metadata as not loaded
        loadMetadata['value']['isLoaded'] = false;
        loadMetadata['value']['repertoireMetadataLoaded'] = false;
        await tapisIO.updateMetadata(loadMetadata.uuid, loadMetadata.name, loadMetadata.value, loadMetadata.associationIds)
            .catch(function(error) {
                msg = 'VDJ-API ERROR: ProjectController.reloadProject - tapisIO.getProjectLoadMetadata, error: ' + error;
            });
        if (msg) {
            console.error(msg);
            webhookIO.postToSlack(msg);
            return apiResponseController.sendError(msg, 500, response);
        }

        // trigger load queue if necessary
        console.log('VDJ-API INFO: ProjectController.reloadProject, project: ' + projectUuid + ' flagged for repository reload'
            + ', metadata: ' + loadMetadata.uuid);

        projectQueueManager.triggerProjectLoad(projectUuid, loadMetadata);

        // flag ADC download cache
        await ServiceAccount.getToken()
            .catch(function(error) {
                msg = 'VDJ-API ERROR (ProjectController.reloadProject): ServiceAccount.getToken, error: ' + error;
            });
        if (msg) {
            console.error(msg);
            webhookIO.postToSlack(msg);
            return apiResponseController.sendError(msg, 500, response);
        }

        // get the study_id
        var projectMetadata = await tapisIO.getProjectMetadata(ServiceAccount.accessToken(), projectUuid)
            .catch(function(error) {
                msg = 'VDJ-API ERROR (ProjectController.reloadProject): tapisIO.getProjectMetadata, error: ' + error;
            });
        if (msg) {
            console.error(msg);
            webhookIO.postToSlack(msg);
            return apiResponseController.sendError(msg, 500, response);
        }

        // assume VDJServer repository
        adcDownloadQueueManager.recacheRepertoireMetadata('vdjserver', projectMetadata['value']['study_id']);

        return apiResponseController.sendSuccess('Project queued for reload', response);
    } else {
        msg = 'VDJ-API ERROR (ProjectController.reloadProject): project: ' + projectUuid + ' does not have load metadata.';
        console.error(msg);
        webhookIO.postToSlack(msg);            
        return apiResponseController.sendError(msg, 400, response);
    } */
};
