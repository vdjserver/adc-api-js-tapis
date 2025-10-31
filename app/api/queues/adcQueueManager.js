
'use strict';

//
// adcQueueManager.js
// Manage ADC repository tasks
//
// VDJServer Analysis Portal
// VDJ Web API service
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

var adcQueueManager = {};
module.exports = adcQueueManager;

// App
var app = require('../../app');
var config = require('../../config/config');

// Schemas
var airr = require('airr-js');
var vdj_schema = require('vdjserver-schema');

// Tapis
var tapisSettings = require('vdj-tapis-js/tapisSettings');
var tapisIO = tapisSettings.get_default_tapis();
var ServiceAccount = tapisIO.serviceAccount;
var GuestAccount = tapisIO.guestAccount;
var webhookIO = require('vdj-tapis-js/webhookIO');
var mongoIO = require('vdj-tapis-js/mongoIO');

// Node Libraries
var Queue = require('bull');

// Bull queues
var triggerQueue = new Queue('ADC project load trigger', { redis: app.redisConfig });
var submitQueue = new Queue('ADC project load submit', { redis: app.redisConfig });
var repertoireQueue = new Queue('ADC project load repertoire', { redis: app.redisConfig });
var rearrangementCheckQueue = new Queue('ADC project check rearrangement', { redis: app.redisConfig });
var rearrangementLoadQueue = new Queue('ADC project load rearrangement', { redis: app.redisConfig });
var unloadQueue = new Queue('ADC project unload', { redis: app.redisConfig });


//
// Trigger the project load process
// This is called by app initialization or from a project load request
//
adcQueueManager.triggerProjectLoad = function() {
    var context = 'adcQueueManager.triggerProjectLoad';
    var msg = null;

    config.log.info(context, 'start');

    // check if enabled
    if (config.enableADCLoad) {
        config.log.info(context, 'ADC loading is enabled, triggering queue.');
    } else {
        config.log.info(context, 'ADC loading is disabled.');
        return;
    }

    // trigger the queue
    // submit one job to run immediately and another once per hour
    triggerQueue.add({});
    triggerQueue.add({}, { repeat: { cron: '0 * * * *' } });
}

//
// Because project load is resource intensive, we
// only want one task occurring at a time. Here we check the task
// queues to see if any are running. If not, we start a cache entry
// job
//

triggerQueue.process(async (job) => {
    var context = 'adcQueueManager.triggerQueue';
    var msg = null;
    var triggers, jobs;

    config.log.info(context, 'start');

    triggers = await triggerQueue.getJobs(['active']);
    config.log.info(context, 'active trigger jobs (' + triggers.length + ')');
    triggers = await triggerQueue.getJobs(['wait']);
    config.log.info(context, 'wait trigger jobs (' + triggers.length + ')');
    triggers = await triggerQueue.getJobs(['delayed']);
    config.log.info(context, 'delayed trigger jobs (' + triggers.length + ')');

    // check if active jobs in queues
    jobs = await submitQueue.getJobs(['active']);
    //console.log(jobs);
    //console.log(jobs.length);
    //if (jobs.length > 0) {
        config.log.info(context, 'active jobs (' + jobs.length + ') in ADC project load submit queue, skip trigger');
    //    return Promise.resolve();
    //}

    // check if active jobs in queues
    jobs = await repertoireQueue.getJobs(['active']);
    //console.log(jobs);
    //console.log(jobs.length);
    //if (jobs.length > 0) {
        config.log.info(context, 'active jobs (' + jobs.length + ') in ADC project repertoire metadata load queue, skip trigger');
    //    return Promise.resolve();
    //}

    jobs = await rearrangementCheckQueue.getJobs(['active']);
    //console.log(jobs);
    //console.log(jobs.length);
    //if (jobs.length > 0) {
        config.log.info(context, 'active jobs (' + jobs.length + ') in ADC project rearrangement check queue, skip trigger');
    //    return Promise.resolve();
    //}

    jobs = await rearrangementLoadQueue.getJobs(['active']);
    //console.log(jobs);
    //console.log(jobs.length);
    //if (jobs.length > 0) {
        config.log.info(context, 'active jobs (' + jobs.length + ') in ADC project rearrangement load queue, skip trigger');
    //    return Promise.resolve();
    //}

    // check if enabled
    if (config.enableADCLoad) {
        config.log.info(context, 'ADC loading is enabled, submitting ADC project load job.');
        submitQueue.add({});
    } else {
        config.log.info(context, 'ADC loading is disabled.');
        return Promise.resolve();
    }

    return Promise.resolve();
});


//
// Load project data into the VDJServer ADC data repository.
// Currently two main data to be loaded:
// 1) repertoire metadata
// 2) rearrangement data
//
// The repertoire metadata is relatively small and quick to load,
// while the rearrangement data is large and may takes days or
// weeks to competely load. We load the repertoire metadata for
// all projects as soon as possible. However, we currently load
// the rearrangement data for only one project at a time
// to avoid overloading any particular system.
//
// Because the rearrangement data is large, we do the loading process
// in small steps to allow easier recovery from errors. Most of the
// complexity of these tasks involves the rearrangement data.
//
// The load records keep track of the rearrangement collection, so
// that we can support separate load and query collections.
//
// 1. check if projects to be loaded
// 2. load repertoire metadata
// 3. check if rearrangement data to be loaded
// 4. load rearrangement data for each repertoire
//

//
// 1. check if projects to be loaded
//
submitQueue.process(async (job) => {
    var context = 'adcQueueManager.submitQueue';
    var msg = null;

    config.log.info(context, 'start');

    var projectList = await tapisIO.getProjectsToBeLoaded(tapisSettings.mongo_loadCollection)
        .catch(function(error) {
            msg = 'tapisIO.getProjectsToBeLoaded, error: ' + error;
        });
    if (msg) {
        msg = config.log.error(context, msg);
        webhookIO.postToSlack(msg);
        return Promise.reject();
    }

    config.log.info(context, projectList.length + ' project(s) to be loaded.');

    if (projectList.length > 0) {
        repertoireQueue.add({});
    }

    return Promise.resolve();
});

//
// 2. load repertoire metadata
//
repertoireQueue.process(async (job) => {
    try {

    var context = 'adcQueueManager.repertoireQueue';
    var msg = null;
    var projectLoad = null;
    var projectUuid = null;
    var allRepertoiresLoaded = false;

    config.log.info(context, 'start');

    var projectList = await tapisIO.getProjectsToBeLoaded(tapisSettings.mongo_loadCollection)
        .catch(function(error) {
            msg = 'tapisIO.getProjectsToBeLoaded, error: ' + error;
        });
    if (msg) {
        msg = config.log.error(context, msg);
        webhookIO.postToSlack(msg);
        return Promise.reject();
    }

    // look for project that needs repertoire metadata to be loaded
    for (var i = 0; i < projectList.length; ++i) {
        config.log.info(context, 'checking load record: ' + projectList[i]['uuid'] + ' for project: ' + projectList[i]['value']['projectUuid']);
        if (! projectList[i]['value']['repertoireMetadataLoaded']) {
            projectLoad = projectList[i];
            projectUuid = projectLoad['value']['projectUuid'];
            break;
        }
    }

    // we did not find one, so all the repertoire metadata is loaded
    // trigger the rearrangement load task
    if (! projectLoad) {
        config.log.info(context, 'all repertoire metadata is loaded, triggering rearrangement load.');
        allRepertoiresLoaded = true;
        rearrangementCheckQueue.add({});
        config.log.info(context, 'end');
        return Promise.resolve();
    }

    config.log.info(context, 'load repertoire metadata for project: ' + projectUuid);

    var projectMetadata = await tapisIO.getAnyPublicProjectMetadata(projectUuid)
        .catch(function(error) {
            msg = 'tapisIO.getAnyPublicProjectMetadata, error: ' + error;
        });
    if (msg) {
        msg = config.log.error(context, msg);
        webhookIO.postToSlack(msg);
        return Promise.reject();
    }

    if (projectMetadata.length != 1) {
        msg = config.log.error(context, 'internal error, invalid query results for project: ' + projectUuid + ', length 1 != ' + projectMetadata.length);
        webhookIO.postToSlack(msg);
        return Promise.resolve();
    }
    projectMetadata = projectMetadata[0];

    // set ADC dates
    if (! projectMetadata.value.adc_publish_date)
        projectMetadata.value.adc_publish_date = new Date().toISOString();
    else
        projectMetadata.value.adc_update_date = new Date().toISOString();

    await tapisIO.updateDocument(projectMetadata.uuid, projectMetadata.name, projectMetadata.value)
        .catch(function(error) {
            msg = 'tapisIO.updateDocument, error: ' + error;
        });
    if (msg) {
        msg = config.log.error(context, msg);
        webhookIO.postToSlack(msg);
        return Promise.reject();
    }

    var repertoireMetadata = await tapisIO.gatherRepertoireMetadataForProject(projectMetadata, true)
        .catch(function(error) {
            msg = 'tapisIO.gatherRepertoireMetadataForProject, error: ' + error;
        });
    if (msg) {
        msg = config.log.error(context, msg);
        webhookIO.postToSlack(msg);
        return Promise.reject();
    }

    config.log.info(context, 'gathered ' + repertoireMetadata.length
                + ' repertoire metadata for project: ' + projectUuid);

    if (! repertoireMetadata || repertoireMetadata.length == 0) return;

    for (let i in repertoireMetadata) {
        if (! repertoireMetadata[i]['repertoire_id']) {
            msg = 'Entry is missing repertoire_id, aborting!';
            msg = config.log.error(context, msg);
            webhookIO.postToSlack(msg);
            return Promise.reject(new Error(msg));
        }
    }

    // insert repertoires into database
    await mongoIO.loadRepertoireMetadata(repertoireMetadata, tapisSettings.mongo_loadCollection)
        .catch(function(error) {
            msg = 'mongoIO.loadRepertoireMetadata, error: ' + error;
        });
    if (msg) {
        msg = config.log.error(context, msg);
        webhookIO.postToSlack(msg);
        return Promise.reject();
    }

    config.log.info(context, 'repertoire metadata is loaded for project: ' + projectUuid);

    // update the load status
    projectLoad.value.repertoireMetadataLoaded = true;
    await tapisIO.updateDocument(projectLoad.uuid, projectLoad.name, projectLoad.value)
        .catch(function(error) {
            msg = 'tapisIO.updateDocument, error: ' + error;
        });
    if (msg) {
        msg = config.log.error(context, msg);
        webhookIO.postToSlack(msg);
        return Promise.reject();
    }

    // re-check for more projects to load
    adcQueueManager.triggerProjectLoad();

    } catch (e) {
        msg = 'service error: ' + e;
        msg = config.log.error(context, msg);
        webhookIO.postToSlack(msg);
    }

    config.log.info(context, 'end');

    return Promise.resolve();
});


//
// 3. check if rearrangement data to be loaded
//
rearrangementCheckQueue.process(async (job) => {
    try {

    var context = 'adcQueueManager.rearrangementCheckQueue';
    var msg = null;
    var projectLoad = null;
    var projectUuid = null;

    config.log.info(context, 'start');

    var projectList = await tapisIO.getProjectsToBeLoaded(tapisSettings.mongo_loadCollection)
        .catch(function(error) {
            msg = 'tapisIO.getProjectsToBeLoaded, error: ' + error;
        });
    if (msg) {
        msg = config.log.error(context, msg);
        webhookIO.postToSlack(msg);
        return Promise.reject();
    }

    // look for project that needs rearrangement data to be loaded
    for (var i = 0; i < projectList.length; ++i) {
        if (! projectList[i]['value']['rearrangementDataLoaded']) {
            projectLoad = projectList[i];
            projectUuid = projectLoad['value']['projectUuid'];
            break;
        }
    }

    // we did not find one, so all the rearrangement data is loaded
    if (! projectLoad) {
        config.log.info(context, 'all rearrangement data is loaded.');
        config.log.info(context, 'end');
        return Promise.resolve();
    }

    config.log.info(context, 'setup rearrangement data load for project: ' + projectUuid);

    var projectMetadata = await tapisIO.getAnyPublicProjectMetadata(projectUuid)
        .catch(function(error) {
            msg = 'tapisIO.getAnyPublicProjectMetadata, error: ' + error;
        });
    if (msg) {
        msg = config.log.error(context, msg);
        webhookIO.postToSlack(msg);
        return Promise.reject();
    }

    if (projectMetadata.length != 1) {
        msg = config.log.error(context, 'internal error, invalid query results for project: ' + projectUuid + ', length 1 != ' + projectMetadata.length);
        webhookIO.postToSlack(msg);
        return Promise.resolve();
    }
    projectMetadata = projectMetadata[0];

    var repertoireMetadata = await tapisIO.gatherRepertoireMetadataForProject(projectMetadata, true)
        .catch(function(error) {
            msg = 'tapisIO.gatherRepertoireMetadataForProject, error: ' + error;
        });
    if (msg) {
        msg = config.log.error(context, msg);
        webhookIO.postToSlack(msg);
        return Promise.reject();
    }

    if (! repertoireMetadata || repertoireMetadata.length == 0) {
        msg = 'project has no repertoires: ' + projectUuid;
        msg = config.log.error(context, msg);
        webhookIO.postToSlack(msg);
        return Promise.resolve();
    }

    config.log.info(context, 'gathered ' + repertoireMetadata.length
                + ' repertoire metadata for project: ' + projectUuid);

    // check if there are existing rearrangement load records
    var rearrangementLoad = await tapisIO.getRearrangementsToBeLoaded(projectUuid, tapisSettings.mongo_loadCollection)
        .catch(function(error) {
            msg = 'tapisIO.getRearrangementsToBeLoaded, error: ' + error;
        });
    if (msg) {
        msg = config.log.error(context, msg);
        webhookIO.postToSlack(msg);
        return Promise.reject();
    }

    if (rearrangementLoad.length == 0) {
        // need to create the rearrangement load records
        config.log.info(context, 'create rearrangement load records for project: ' + projectUuid);

        for (let i = 0; i < repertoireMetadata.length; i++) {
            let repertoire_id = repertoireMetadata[i]['repertoire_id'];
            await tapisIO.createRearrangementLoadMetadata(projectUuid, repertoire_id, tapisSettings.mongo_loadCollection)
                .catch(function(error) {
                    msg = 'tapisIO.createRearrangementLoadMetadata, error: ' + error;
                });
            if (msg) {
                msg = config.log.error(context, msg);
                webhookIO.postToSlack(msg);
                return Promise.reject();
            }
        }
    } else if (rearrangementLoad.length != repertoireMetadata.length) {
        msg = 'VDJ-API INFO: projectQueueManager.checkRearrangementsToLoadTask, number of repertoires ('
            + repertoireMetadata.length + ') is not equal to number of rearrangement load records ('
            + rearrangementLoad.length + ') for project: ' + projectUuid;
        config.log.info(context, msg);
        config.log.info(context, 'create missing rearrangement load records for project: ' + projectUuid);

        let idx = 0;
        for (let i = 0; i < repertoireMetadata.length; i++) {
            var found = false;
            for (let j = 0; j < rearrangementLoad.length; j++) {
                if (rearrangementLoad[j]['value']['repertoire_id'] == repertoireMetadata[i]['repertoire_id']) {
                    found = true;
                    break;
                }
            }
            if (! found) {
                let repertoire_id = repertoireMetadata[i]['repertoire_id'];
                await tapisIO.createRearrangementLoadMetadata(projectUuid, repertoire_id, tapisSettings.mongo_loadCollection)
                    .catch(function(error) {
                        msg = 'tapisIO.createRearrangementLoadMetadata, error: ' + error;
                    });
                if (msg) {
                    msg = config.log.error(context, msg);
                    webhookIO.postToSlack(msg);
                    return Promise.reject();
                }
                idx++;
            }
        }
    } else {
        config.log.info(context, 'rearrangement load records already created for project: ' + projectUuid);
    }

    // trigger rearrangement load
    rearrangementLoadQueue.add({});

    } catch (e) {
        msg = 'service error: ' + e;
        msg = config.log.error(context, msg);
        webhookIO.postToSlack(msg);
    }

    config.log.info(context, 'end');

    return Promise.resolve();
});

rearrangementLoadQueue.process(async (job) => {
    try {

    var context = 'adcQueueManager.rearrangementLoadQueue';
    var msg = null;
    var projectLoad = null;
    var projectUuid = null;
    var allProjectsLoaded = false;
    var allRearrangementsLoaded = false;

    config.log.info(context, 'start');

    var projectList = await tapisIO.getProjectsToBeLoaded(tapisSettings.mongo_loadCollection)
        .catch(function(error) {
            msg = 'tapisIO.getProjectsToBeLoaded, error: ' + error;
        });
    if (msg) {
        msg = config.log.error(context, msg);
        webhookIO.postToSlack(msg);
        return Promise.reject();
    }

    if (projectList.length == 0) allProjectsLoaded = true;
    else {
        // check to see if any projects have been completely loaded
        for (let i = 0; i < projectList.length; ++i) {
            let proj = projectList[i];
            if (proj['value']['repertoireMetadataLoaded'] && proj['value']['rearrangementDataLoaded']) {
                config.log.info(context, 'project completely loaded: ' + proj.uuid);
                proj.value.isLoaded = true;
                await tapisIO.updateDocument(proj.uuid, proj.name, proj.value)
                    .catch(function(error) {
                        msg = 'tapisIO.updateDocument, error: ' + error;
                    });
                if (msg) {
                    msg = config.log.error(context, msg);
                    webhookIO.postToSlack(msg);
                    return Promise.reject();
                }
            }
        }
    }

    // look for project that needs rearrangement data to be loaded
    for (var i = 0; i < projectList.length; ++i) {
        if (! projectList[i]['value']['rearrangementDataLoaded']) {
            projectLoad = projectList[i];
            projectUuid = projectLoad['value']['projectUuid'];
            break;
        }
    }

    // we did not find one, so all the rearrangement data is loaded
    if (! projectLoad) {
        config.log.info(context, 'all rearrangement data is loaded.');
        allRearrangementsLoaded = true;

        // check to see if any projects have been completely loaded
        for (let i = 0; i < projectList.length; ++i) {
            let proj = projectList[i];
            if (proj['value']['repertoireMetadataLoaded'] && proj['value']['rearrangementDataLoaded']) {
                config.log.info(context, 'project completely loaded: ' + proj.uuid);
                proj.value.isLoaded = true;
                await tapisIO.updateDocument(proj.uuid, proj.name, proj.value)
                    .catch(function(error) {
                        msg = 'tapisIO.updateDocument, error: ' + error;
                    });
                if (msg) {
                    msg = config.log.error(context, msg);
                    webhookIO.postToSlack(msg);
                    return Promise.reject();
                }
            }
        }

        config.log.info(context, 'end');
        return Promise.resolve();
    }

    // check if there are existing rearrangement load records
    var rearrangementLoad = await tapisIO.getRearrangementsToBeLoaded(projectUuid, tapisSettings.mongo_loadCollection)
        .catch(function(error) {
            msg = 'tapisIO.getRearrangementsToBeLoaded, error: ' + error;
        });
    if (msg) {
        msg = config.log.error(context, msg);
        webhookIO.postToSlack(msg);
        return Promise.reject();
    }

    if (! rearrangementLoad || rearrangementLoad.length == 0) {
        msg = 'project has no rearrangement load records: ' + projectUuid;
        msg = config.log.error(context, msg);
        webhookIO.postToSlack(msg);
        return Promise.resolve();
    }

    config.log.info(context, 'gathered ' + rearrangementLoad.length + ' rearrangement load records for project: ' + projectUuid);

    let loadedCount = 0;
    for (let i = 0; i < rearrangementLoad.length; ++i)
        if (rearrangementLoad[i]['value']['isLoaded'])
            ++loadedCount;

    var dataLoad = null;
    for (let i = 0; i < rearrangementLoad.length; ++i) {
        if (! rearrangementLoad[i]['value']['isLoaded']) {
            dataLoad = rearrangementLoad[i];
            break;
        }
    }

    config.log.info(context, loadedCount + ' of the total ' + rearrangementLoad.length
                + ' rearrangement load records have been loaded.');

    var projectMetadata = await tapisIO.getAnyPublicProjectMetadata(projectUuid)
        .catch(function(error) {
            msg = 'tapisIO.getAnyPublicProjectMetadata, error: ' + error;
        });
    if (msg) {
        msg = config.log.error(context, msg);
        webhookIO.postToSlack(msg);
        return Promise.reject();
    }

    if (projectMetadata.length != 1) {
        msg = config.log.error(context, 'internal error, invalid query results for project: ' + projectUuid + ', length 1 != ' + projectMetadata.length);
        webhookIO.postToSlack(msg);
        return Promise.resolve();
    }
    projectMetadata = projectMetadata[0];

    var repertoireMetadata = await tapisIO.gatherRepertoireMetadataForProject(projectMetadata, true)
        .catch(function(error) {
            msg = 'tapisIO.gatherRepertoireMetadataForProject, error: ' + error;
        });
    if (msg) {
        msg = config.log.error(context, msg);
        webhookIO.postToSlack(msg);
        return Promise.reject();
    }

    if (! repertoireMetadata || repertoireMetadata.length == 0) {
        msg = 'project has no repertoires: ' + projectUuid;
        msg = config.log.error(context, msg);
        webhookIO.postToSlack(msg);
        return Promise.resolve();
    }

    if (repertoireMetadata.length != rearrangementLoad.length) {
        msg = 'number (' + rearrangementLoad.length
            + ') of rearrangement load records is not equal to number (' + repertoireMetadata.length
            + ') of repertoires.';
        msg = config.log.error(context, msg);
        webhookIO.postToSlack(msg);
        return Promise.resolve();
    }

    if (! dataLoad) {
        config.log.info(context, 'all rearrangement loads done for project: ' + projectLoad.uuid);
        config.log.info(context, 'project completely loaded: ' + projectLoad.uuid);
        // project to be loaded but no dataLoad means all rearrangement loads have been completed
        // update the load status
        projectLoad.value.rearrangementDataLoaded = true;
        projectLoad.value.isLoaded = true;
        await tapisIO.updateDocument(projectLoad.uuid, projectLoad.name, projectLoad.value)
            .catch(function(error) {
                msg = 'tapisIO.updateDocument, error: ' + error;
            });
        if (msg) {
            msg = config.log.error(context, msg);
            webhookIO.postToSlack(msg);
            return Promise.reject();
        }
    } else {
        config.log.info(context, 'rearrangement data load: '
                    + dataLoad['uuid'] + ' for repertoire: ' + dataLoad['value']['repertoire_id']
                    + ' at load set: ' + dataLoad['value']['load_set']);

        var repertoire = null;
        for (var i = 0; i < repertoireMetadata.length; ++i) {
            if (repertoireMetadata[i]['repertoire_id'] == dataLoad['value']['repertoire_id']) {
                repertoire = repertoireMetadata[i];
                break;
            }
        }

        if (! repertoire) {
            msg = 'could not find repertoire record for repertoire_id: '
                + dataLoad['value']['repertoire_id'];
            msg = config.log.error(context, msg);
            webhookIO.postToSlack(msg);
            return Promise.resolve();
        }

        var primaryDP = null;
        for (var i = 0; i < repertoire['data_processing'].length; ++i) {
            if (repertoire['data_processing'][i]['primary_annotation']) {
                primaryDP = repertoire['data_processing'][i];
                break;
            }
        }

        if (! primaryDP) {
            msg = 'could not find primary data processing for repertoire_id: '
                + dataLoad['value']['repertoire_id'];
            config.log.info(context, msg);
            msg = null;

            // TODO: might need to rethink how to do this
            // If a user attached AIRR TSV files to the repertoire with no data processing
            // versus uploading raw files and processing on VDJServer, we still want to
            // be able to load the project.

            // We need to create a data processing record so that the load process can find
            // the AIRR TSV files.
            
            // AIRR TSV are recorded as FASTA in SequencingData but the actual file type is AIRR TSV
            console.log(JSON.stringify(repertoire, null, 2));
            if (repertoire['sample'][0]['sequencing_files'] && repertoire['sample'][0]['sequencing_files']['file_type'] == 'fasta') {
                let url = 'tapis://' + tapisSettings.storageSystem + "/projects/" + projectUuid + '/files/' + repertoire['sample'][0]['sequencing_files']['filename'];
                let file = await tapisIO.getProjectFileMetadataByURL(projectUuid, url)
                    .catch(function(error) {
                        msg = 'tapisIO.getProjectFileMetadataByURL, error: ' + error;
                    });
                if (msg) {
                    msg = config.log.error(context, msg);
                    webhookIO.postToSlack(msg);
                    return Promise.reject();
                }
                console.log(file);

                if (! file || file.length != 1) {
                    msg = 'Invalid project file info: ' + url;
                    msg = config.log.error(context, msg);
                    webhookIO.postToSlack(msg);
                    return Promise.resolve();
                }
                file = file[0];

                if (file['value']['fileType'] == 9) {
                    config.log.info(context, 'Found an AIRR TSV: ' + url);
                    config.log.info(context, 'Creating a primary data processing record for the AIRR TSV.');

                    let dpschema = airr.get_schema('DataProcessing');
                    let dp = dpschema.template();
                    dp['primary_annotation'] = true;
                    dp['data_processing_files'] = [ file['value']['name'] ];

                    let dp_metadata = await tapisIO.createMetadataForProject(projectUuid, 'data_processing', { 'value': dp }, 'data_processing_id')
                        .catch(function(error) {
                            msg = 'got error for creating data_processing metadata for project: ' + projectUuid + ', error: ' + error;
                        });
                    if (msg) {
                        msg = config.log.error(context, msg);
                        webhookIO.postToSlack(msg);
                        return Promise.resolve();
                    }
                    console.log(JSON.stringify(dp_metadata, null, 2));
                    config.log.info(context, 'Successfully created a primary data processing record for the AIRR TSV: ' + dp_metadata['uuid']);

                    // update the repertoire record
                    let rep_metadata = await tapisIO.getMetadataForProject(projectUuid, repertoire['repertoire_id'])
                        .catch(function(error) {
                            msg = 'got error for project: ' + projectUuid + ' with repertoire_id: ' + repertoire['repertoire_id'] + ', error: ' + error;
                        });
                    if (msg) {
                        msg = config.log.error(context, msg);
                        webhookIO.postToSlack(msg);
                        return Promise.resolve();
                    }
                    console.log(JSON.stringify(rep_metadata, null, 2));
                    rep_metadata = rep_metadata[0];

                    if ((rep_metadata['value']['data_processing'].length == 1) && (rep_metadata['value']['data_processing'][0]['vdjserver_uuid'] == null)) {
                        rep_metadata['value']['data_processing'] = [{ "vdjserver_uuid": dp_metadata['uuid'] }];
                    } else {
                        rep_metadata['value']['data_processing'].push({ "vdjserver_uuid": dp_metadata['uuid'] });
                    }
                    rep_metadata = await tapisIO.updateMetadataForProject(projectUuid, rep_metadata['uuid'], rep_metadata)
                        .catch(function(error) {
                            msg = 'got error for project: ' + projectUuid + ' with repertoire_id: ' + repertoire['repertoire_id'] + ', error: ' + error;
                        });
                    if (msg) {
                        msg = config.log.error(context, msg);
                        webhookIO.postToSlack(msg);
                        return Promise.resolve();
                    }
                    console.log(JSON.stringify(rep_metadata, null, 2));
                    config.log.info(context, 'Successfully updated repertoire with data processing record: ' + repertoire['repertoire_id']);

                    // have it reload everything
                    return Promise.resolve();
                }
            }

            msg = 'could not find primary data processing for repertoire_id: '
                + dataLoad['value']['repertoire_id'];
            msg = config.log.error(context, msg);
            webhookIO.postToSlack(msg);
            return Promise.resolve();
        }

        if (! primaryDP['data_processing_id']) {
            msg = 'no data_processing_id for primary data processing for repertoire_id: '
                + dataLoad['value']['repertoire_id'];
            msg = config.log.error(context, msg);
            webhookIO.postToSlack(msg);
            return Promise.resolve();
        }

        if (! primaryDP['data_processing_files']) {
            msg = 'primary data processing: '
                + primaryDP['data_processing_id'] + " does not have data_processing_files.";
            msg = config.log.error(context, msg);
            webhookIO.postToSlack(msg);
            return Promise.resolve();
        }

        if (primaryDP['data_processing_files'].length == 0) {
            msg = 'primary data processing: '
                + primaryDP['data_processing_id'] + " does not have data_processing_files.";
            msg = config.log.error(context, msg);
            webhookIO.postToSlack(msg);
            return Promise.resolve();
        }

        // get the data processing record
        // TODO: right now this is a (tapis v2) job, but we should switch to using analysis_provenance_id
        // which contains the appropriate information
        config.log.info(context, 'Looking for job archive path for primary data_processing_id: ' + primaryDP['data_processing_id']);
        var jobOutput = await tapisIO.getDocument(primaryDP['data_processing_id'])
            .catch(function(error) {
                msg = 'tapisIO.getDocument, error: ' + error;
            });
        if (msg) {
            msg = config.log.error(context, msg);
            webhookIO.postToSlack(msg);
            return Promise.reject();
        }
        if (jobOutput.length > 0) {
            var job = jobOutput[0];
            console.log(job);
            if (job['name'] == 'tapis_v2_job') {
                console.log(job['name']);
                jobOutput = { archivePath: job['value']['archive_path'] };
            } else if (job['name'] == 'data_processing') {
                console.log(job['name']);
                jobOutput = { archivePath: '/projects/' + projectUuid + '/files' };
            }
        }
        //console.log(jobOutput);

        if (! jobOutput) {
            msg = 'could not get job: ' + primaryDP['data_processing_id'] + ' for primary data processing: ' + primaryDP['data_processing_id'];
            msg = config.log.error(context, msg);
            webhookIO.postToSlack(msg);
            return Promise.resolve();
        }

        if (! jobOutput['archivePath']) {
            msg = 'job: ' + jobOutput.uuid + " is missing archivePath.";
            msg = config.log.error(context, msg);
            webhookIO.postToSlack(msg);
            return Promise.resolve();
        }
        if (jobOutput['archivePath'].length == 0) {
            msg = 'job: ' + jobOutput.uuid + " is missing archivePath.";
            msg = config.log.error(context, msg);
            webhookIO.postToSlack(msg);
            return Promise.resolve();
        }

        // finally, start the rearrangement load!
        await mongoIO.loadRearrangementData(dataLoad, repertoire, primaryDP, jobOutput);
    }

    if (allRearrangementsLoaded && allProjectsLoaded) {
        // if not all loaded trigger start at beginning and check for more
        config.log.info(context, 'all loads done, pausing queue.');
    } else {
        // re-check for more projects to load
        adcQueueManager.triggerProjectLoad();
    }

    } catch (e) {
        msg = 'service error: ' + e;
        msg = config.log.error(context, msg);
        webhookIO.postToSlack(msg);
    }

    config.log.info(context, 'end');

    return Promise.resolve();
});

//
// Unloading
//

adcQueueManager.triggerProjectUnload = function(projectUuid, loadMetadata) {
    var context = 'adcQueueManager.triggerProjectUnload';
    config.log.info(context, 'project: ' + projectUuid);
    unloadQueue.add({projectUuid:projectUuid, loadMetadata:loadMetadata});
}

unloadQueue.process(async (job) => {
    var context = 'adcQueueManager.unloadQueue';
    var msg = null;
    var projectUuid = job['data']['projectUuid'];
    var loadMetadata = job['data']['loadMetadata'];

    config.log.info(context, 'start');

    // get the rearrangement load records
    var rearrangementLoad = await tapisIO.getRearrangementsToBeLoaded(projectUuid, tapisSettings.mongo_loadCollection)
        .catch(function(error) {
            msg = 'tapisIO.getRearrangementsToBeLoaded, error: ' + error;
        });
    if (msg) {
        msg = config.log.error(context, msg);
        webhookIO.postToSlack(msg);
        return Promise.resolve();
    }

    if (! rearrangementLoad || rearrangementLoad.length == 0) {
        config.log.info(context, 'project has no rearrangement load records: ' + projectUuid);
        return Promise.resolve();
    }

    config.log.info(context, 'gathered ' + rearrangementLoad.length + ' rearrangement load records for project: ' + projectUuid);

    // for each load record, delete rearrangements, delete load metadata
    for (let i = 0; i < rearrangementLoad.length; i++) {
        var loadRecord = rearrangementLoad[i];
        var rearrangementCollection = 'rearrangement' + loadRecord['value']['collection'];
        var repertoireCollection = 'repertoire' + loadRecord['value']['collection'];

        if (! loadRecord['value']['repertoire_id']) {
            msg = 'missing repertoire_id from load record: ' + JSON.stringify(loadRecord);
            msg = config.log.error(context, msg);
            webhookIO.postToSlack(msg);
            return Promise.resolve();
        }

        if (loadRecord['value']['collection'] != tapisSettings.mongo_loadCollection) {
            msg = 'load record collection: ' + loadRecord['value']['collection'] + ' != ' + tapisSettings.mongo_loadCollection + ' config load collection';
            msg = config.log.error(context, msg);
            webhookIO.postToSlack(msg);
            return Promise.resolve();
        }

        config.log.info(context, 'deleting rearrangements for repertoire:', loadRecord['value']['repertoire_id']);
        await mongoIO.deleteLoadSet(loadRecord['value']['repertoire_id'], null, rearrangementCollection)
            .catch(function(error) {
                msg = 'mongoIO.deleteLoadSet, error: ' + error;
            });
        if (msg) {
            msg = config.log.error(context, msg);
            webhookIO.postToSlack(msg);
            return Promise.resolve();
        }

        console.log('VDJ-API INFO (unloadQueue): deleting repertoire:', loadRecord['value']['repertoire_id']);
        await mongoIO.deleteRepertoire(loadRecord['value']['repertoire_id'], repertoireCollection)
            .catch(function(error) {
                msg = 'mongoIO.deleteLoadSet, error: ' + error;
            });
        if (msg) {
            msg = config.log.error(context, msg);
            webhookIO.postToSlack(msg);
            return Promise.resolve();
        }

        console.log(loadRecord);
        config.log.info(context, 'deleting rearrangement load record:', loadRecord['uuid']);
        await tapisIO.deleteRecord('tapis_meta', loadRecord['_id']['$oid'])
            .catch(function(error) {
                msg = 'tapisIO.deleteRecord, error: ' + error;
            });
        if (msg) {
            msg = config.log.error(context, msg);
            webhookIO.postToSlack(msg);
            return Promise.resolve();
        }
    }

    config.log.info(context, 'complete');
});
