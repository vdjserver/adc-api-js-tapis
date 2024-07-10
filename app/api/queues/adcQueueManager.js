
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

// Tapis
var tapisSettings = require('vdj-tapis-js/tapisSettings');
var tapisIO = tapisSettings.get_default_tapis();
var ServiceAccount = tapisIO.serviceAccount;
var GuestAccount = tapisIO.guestAccount;
var webhookIO = require('vdj-tapis-js/webhookIO');
var mongoIO = require('vdj-tapis-js/mongoIO');

// Node Libraries
var Queue = require('bull');
var jsonApprover = require('json-approver');

// Bull queues
var unloadQueue = new Queue('ADC project unload', { redis: app.redisConfig });




/*
  OLD CODE


//
// Because loading rearrangement data is resource intensive, we
// only want one load occurring at a time. Here we check the task
// queues to see if a rearrangement load is running.
//
adcQueueManager.checkRearrangementLoad = function() {

    console.log('VDJ-API INFO: projectQueueManager.checkRearrangementLoad');

    var isRunning = false;

    var activePromise = new Promise(function(resolve, reject) {
        kue.Job.rangeByType('rearrangementLoadTask', 'active', 0, 1000, 'asc', function(error, jobs) {
            console.log(jobs.length);
            if (jobs.length > 0) isRunning = true;
            resolve();
        });
    });

    var inactivePromise = new Promise(function(resolve, reject) {
        kue.Job.rangeByType('rearrangementLoadTask', 'inactive', 0, 1000, 'asc', function(error, jobs) {
            console.log(jobs.length);
            if (jobs.length > 0) isRunning = true;
            resolve();
        });
    });

    return activePromise
        .then(function() {
            return inactivePromise;
        })
        .then(function() {
            if (! isRunning) {
                // no rearrangement load is running so kick off a task
                console.log('VDJ-API INFO: projectQueueManager.checkRearrangementLoad, no rearrangement load task running, triggering task.');
                taskQueue
                    .create('rearrangementLoadTask', null)
                    .removeOnComplete(true)
                    .attempts(5)
                    .backoff({delay: 60 * 1000, type: 'fixed'})
                    .save();
            } else {
                console.log('VDJ-API INFO: projectQueueManager.checkRearrangementLoad, a rearrangement load task is running.');
            }
    
            return isRunning;
        });
};


//
// Trigger queue process to load for projects to be loaded
//
adcQueueManager.triggerProjectLoad = function() {
    console.log('VDJ-API INFO (ProjectQueueManager.triggerProjectLoad):');
    taskQueue
        .create('checkProjectsToLoadTask', null)
        .removeOnComplete(true)
        .attempts(5)
        .backoff({delay: 60 * 1000, type: 'fixed'})
        .save();
}


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

    // 1. check if projects to be loaded
    taskQueue.process('checkProjectsToLoadTask', function(task, done) {
        var msg;

        console.log('VDJ-API INFO: projectQueueManager.checkProjectsToLoadTask, task started.');

        tapisIO.getProjectsToBeLoaded(mongoSettings.loadCollection)
            .then(function(projectList) {
                console.log('VDJ-API INFO: projectQueueManager.checkProjectsToLoadTask, ' + projectList.length + ' project(s) to be loaded.');
                if (projectList.length > 0) {
                    // there are projects to be loaded so trigger next task
                    taskQueue
                        .create('loadRepertoireMetadataTask', null)
                        .removeOnComplete(true)
                        .attempts(5)
                        .backoff({delay: 60 * 1000, type: 'fixed'})
                        .save();
                }
            })
            .then(function() {
                console.log('VDJ-API INFO: projectQueueManager.checkProjectsToLoadTask, task done.');
                done();
            })
            .catch(function(error) {
                if (!msg) msg = 'VDJ-API ERROR: projectQueueManager.checkProjectsToLoadTask - error ' + error;
                console.error(msg);
                webhookIO.postToSlack(msg);
                done(new Error(msg));
            });
    });

    // 2. load repertoire metadata
    taskQueue.process('loadRepertoireMetadataTask', function(task, done) {
        var msg;
        var projectLoad = null;
        var projectUuid = null;
        var allRepertoiresLoaded = false;

        console.log('VDJ-API INFO: projectQueueManager.loadRepertoireMetadataTask, task started.');

        tapisIO.getProjectsToBeLoaded(mongoSettings.loadCollection)
            .then(function(projectList) {
                // look for project that needs repertoire metadata to be loaded
                for (var i = 0; i < projectList.length; ++i) {
                    console.log('VDJ-API INFO: projectQueueManager.loadRepertoireMetadataTask, checking load record: '
                                + projectList[i]['uuid'] + ' for project: ' + projectList[i]['associationIds'][0]);
                    if (! projectList[i]['value']['repertoireMetadataLoaded']) {
                        projectLoad = projectList[i];
                        projectUuid = projectLoad['associationIds'][0];
                        break;
                    }
                }
                return;
            })
            .then(function() {
                // we did not find one, so all the repertoire metadata is loaded
                // trigger the next task
                if (! projectLoad) {
                    console.log('VDJ-API INFO: projectQueueManager.loadRepertoireMetadataTask, all repertoire metadata is loaded.');
                    allRepertoiresLoaded = true;
                    return null;
                }

                console.log('VDJ-API INFO: projectQueueManager.loadRepertoireMetadataTask, load repertoire metadata for project: ' + projectUuid);

                return tapisIO.getMetadata(projectUuid)
                    .then(function(projectMetadata) {
                        // set ADC dates
                        if (! projectMetadata.value.adc_publish_date)
                            projectMetadata.value.adc_publish_date = new Date().toISOString();
                        else
                            projectMetadata.value.adc_update_date = new Date().toISOString();

                        return tapisIO.updateMetadata(projectMetadata.uuid, projectMetadata.name, projectMetadata.value, projectMetadata.associationIds);
                    })
                    .then(function(projectMetadata) {
                        // gather the repertoire objects
                        return tapisIO.gatherRepertoireMetadataForProject(projectUuid, true);
                    })
                    .then(function(repertoireMetadata) {
                        //console.log(JSON.stringify(repertoireMetadata));
                        console.log('VDJ-API INFO: projectQueueManager.loadRepertoireMetadataTask, gathered ' + repertoireMetadata.length
                                    + ' repertoire metadata for project: ' + projectUuid);

                        if (! repertoireMetadata || repertoireMetadata.length == 0) return;

                        for (let i in repertoireMetadata) {
                            if (! repertoireMetadata[i]['repertoire_id']) {
                                msg = 'VDJ-API ERROR (projectQueueManager.loadRepertoireMetadataTask): Entry is missing repertoire_id, aborting!';
                                return Promise.reject(new Error(msg));
                            }
                        }

                        // insert repertoires into database
                        // TODO: we should use RestHeart meta/v3 API but we are getting errors
                        // TODO: using direct access to MongoDB for now
                        return mongoIO.loadRepertoireMetadata(repertoireMetadata, mongoSettings.loadCollection);
                    })
                    .then(function(result) {
                        console.log('VDJ-API INFO: projectQueueManager.loadRepertoireMetadataTask, repertoire metadata is loaded for project: ' + projectUuid);
                        // update the load status
                        projectLoad.value.repertoireMetadataLoaded = true;
                        return tapisIO.updateMetadata(projectLoad.uuid, projectLoad.name, projectLoad.value, projectLoad.associationIds);
                    });
            })
            .then(function() {
                if (allRepertoiresLoaded) {
                    // if all project repertoire data is loaded then trigger rearrangement load check
                    taskQueue
                        .create('checkRearrangementsToLoadTask', null)
                        .removeOnComplete(true)
                        .attempts(5)
                        .backoff({delay: 60 * 1000, type: 'fixed'})
                        .save();
                } else {
                    // otherwise re-check for more projects to load
                    taskQueue
                        .create('checkProjectsToLoadTask', null)
                        .removeOnComplete(true)
                        .attempts(5)
                        .backoff({delay: 60 * 1000, type: 'fixed'})
                        .save();
                }
                console.log('VDJ-API INFO: projectQueueManager.loadRepertoireMetadataTask, task done.');
                done();
            })
            .catch(function(error) {
                if (!msg) msg = 'VDJ-API ERROR: projectQueueManager.loadRepertoireMetadataTask - error ' + error;
                console.error(msg);
                webhookIO.postToSlack(msg);
                done(new Error(msg));
            });
    });

    // 3. check if rearrangement data to be loaded
    taskQueue.process('checkRearrangementsToLoadTask', function(task, done) {
        var msg = null;
        var projectLoad = null;
        var projectUuid = null;
        var repertoireMetadata = null;

        console.log('VDJ-API INFO: projectQueueManager.checkRearrangementsToLoadTask, task started.');

        tapisIO.getProjectsToBeLoaded(mongoSettings.loadCollection)
            .then(function(projectList) {
                console.log('VDJ-API INFO: projectQueueManager.checkRearrangementsToLoadTask, ' + projectList.length + ' project(s) to be loaded.');

                // look for project that needs rearrangement data to be loaded
                for (var i = 0; i < projectList.length; ++i) {
                    if (! projectList[i]['value']['rearrangementDataLoaded']) {
                        projectLoad = projectList[i];
                        projectUuid = projectLoad['associationIds'][0];
                        break;
                    }
                }
                return;
            })
            .then(function() {
                // we did not find one, so all the rearrangement data is loaded
                if (! projectLoad) {
                    console.log('VDJ-API INFO: projectQueueManager.checkRearrangementsToLoadTask, all rearrangement data is loaded.');
                    return null;
                }

                console.log('VDJ-API INFO: projectQueueManager.checkRearrangementsToLoadTask, setup rearrangement data load for project: ' + projectUuid);

                // gather the repertoire objects
                return tapisIO.gatherRepertoireMetadataForProject(projectUuid, true)
                    .then(function(_repertoireMetadata) {
                        repertoireMetadata = _repertoireMetadata;
                        //console.log(JSON.stringify(repertoireMetadata));
                        console.log('VDJ-API INFO: projectQueueManager.checkRearrangementsToLoadTask, gathered ' + repertoireMetadata.length
                                    + ' repertoire metadata for project: ' + projectUuid);

                        if (! repertoireMetadata || repertoireMetadata.length == 0) {
                            msg = 'VDJ-API ERROR: project has no repertoires: ' + projectUuid;
                            return;
                        }

                        // check if there are existing rearrangement load records
                        return tapisIO.getRearrangementsToBeLoaded(projectUuid, mongoSettings.loadCollection);
                    })
                    .then(function(rearrangementLoad) {
                        if (!rearrangementLoad) return;

                        if (rearrangementLoad.length == 0) {
                            // need to create the rearrangement load records
                            console.log('VDJ-API INFO: projectQueueManager.checkRearrangementsToLoadTask, create rearrangement load records for project: ' + projectUuid);
                            var promises = [];

                            for (var i = 0; i < repertoireMetadata.length; i++) {
                                var repertoire_id = repertoireMetadata[i]['repertoire_id'];
                                promises[i] = tapisIO.createRearrangementLoadMetadata(projectUuid, repertoire_id, mongoSettings.loadCollection);
                            }

                            return Promise.allSettled(promises);
                        } else if (rearrangementLoad.length != repertoireMetadata.length) {
                            msg = 'VDJ-API INFO: projectQueueManager.checkRearrangementsToLoadTask, number of repertoires ('
                                + repertoireMetadata.length + ') is not equal to number of rearrangement load records ('
                                + rearrangementLoad.length + ') for project: ' + projectUuid;
                            console.log(msg);
                            console.log('VDJ-API INFO: projectQueueManager.checkRearrangementsToLoadTask, create missing rearrangement load records for project: ' + projectUuid);

                            var promises = [];

                            var idx = 0;
                            for (var i = 0; i < repertoireMetadata.length; i++) {
                                var found = false;
                                for (var j = 0; j < rearrangementLoad.length; j++) {
                                    if (rearrangementLoad[j]['value']['repertoire_id'] == repertoireMetadata[i]['repertoire_id']) {
                                        found = true;
                                        break;
                                    }
                                }
                                if (! found) {
                                    var repertoire_id = repertoireMetadata[i]['repertoire_id'];
                                    promises[idx] = tapisIO.createRearrangementLoadMetadata(projectUuid, repertoire_id, mongoSettings.loadCollection);
                                    idx++;
                                }
                            }

                            return Promise.allSettled(promises);
                        } else {
                            console.log('VDJ-API INFO: projectQueueManager.checkRearrangementsToLoadTask, rearrangement load records already created for project: ' + projectUuid);
                            return;
                        }
                    });
            })
            .then(function() {
                console.log('VDJ-API INFO: projectQueueManager.checkRearrangementsToLoadTask, task done.');
                if (msg) {
                    // an error occurred so stop the task
                    console.error(msg);
                    webhookIO.postToSlack(msg);
                    done(new Error(msg));
                } else {
                    // otherwise trigger rearrangement load if necessary
                    ProjectQueueManager.checkRearrangementLoad();
                    done();
                }
            })
            .catch(function(error) {
                if (!msg) msg = 'VDJ-API ERROR: projectQueueManager.checkRearrangementsToLoadTask - error ' + error;
                console.error(msg);
                webhookIO.postToSlack(msg);
                done(new Error(msg));
            });
    });

    // 4. load rearrangement data for each repertoire
    taskQueue.process('rearrangementLoadTask', function(task, done) {
        var msg = null;
        var projectLoad = null;
        var projectUuid = null;
        var rearrangementLoad = null;
        var repertoireMetadata = null;
        var repertoire = null;
        var dataLoad = null;
        var primaryDP = null;
        var jobOutput = null;
        var allProjectsLoaded = false;
        var allRearrangementsLoaded = false;

        console.log('VDJ-API INFO: projectQueueManager.rearrangementLoadTask, task started.');

        tapisIO.getProjectsToBeLoaded(mongoSettings.loadCollection)
            .then(function(projectList) {
                console.log('VDJ-API INFO: projectQueueManager.rearrangementLoadTask, ' + projectList.length + ' project(s) to be loaded.');

                // look for project that needs rearrangement data to be loaded
                for (var i = 0; i < projectList.length; ++i) {
                    if (! projectList[i]['value']['rearrangementDataLoaded']) {
                        projectLoad = projectList[i];
                        projectUuid = projectLoad['associationIds'][0];
                        break;
                    }
                }
                if (projectList.length == 0) allProjectsLoaded = true;

                // we did not find one, so all the rearrangement data is loaded
                if (! projectLoad) {
                    console.log('VDJ-API INFO: projectQueueManager.rearrangementLoadTask, all rearrangement data is loaded.');
                    allRearrangementsLoaded = true;

                    // but the project is to be loaded, check to see if all is done and update
                    for (var i = 0; i < projectList.length; ++i) {
                        var proj = projectList[i];
                        if (proj['value']['repertoireMetadataLoaded'] && proj['value']['rearrangementDataLoaded']) {
                            console.log('VDJ-API INFO: projectQueueManager.rearrangementLoadTask, project completely loaded: ' + proj.uuid);
                            proj.value.isLoaded = true;
                            return tapisIO.updateMetadata(proj.uuid, proj.name, proj.value, proj.associationIds);
                        }
                    }
                }

                return;
            })
            .then(function() {
                if (! projectLoad) return;

                // check if there are existing rearrangement load records
                return tapisIO.getRearrangementsToBeLoaded(projectUuid, mongoSettings.loadCollection)
                    .then(function(_rearrangementLoad) {
                        rearrangementLoad = _rearrangementLoad;
                        if (! rearrangementLoad || rearrangementLoad.length == 0) {
                            msg = 'VDJ-API ERROR: projectQueueManager.rearrangementLoadTask, project has no rearrangement load records: ' + projectUuid;
                            return null;
                        }

                        console.log('VDJ-API INFO: projectQueueManager.rearrangementLoadTask, gathered ' + rearrangementLoad.length
                                    + ' rearrangement load records for project: ' + projectUuid);

                        var loadedCount = 0;
                        for (var i = 0; i < rearrangementLoad.length; ++i)
                            if (rearrangementLoad[i]['value']['isLoaded'])
                                ++loadedCount;
                                
                        for (var i = 0; i < rearrangementLoad.length; ++i) {
                            if (! rearrangementLoad[i]['value']['isLoaded']) {
                                dataLoad = rearrangementLoad[i];
                                break;
                            }
                        }

                        console.log('VDJ-API INFO: projectQueueManager.rearrangementLoadTask, ' + loadedCount
                                    + ' of the total ' + rearrangementLoad.length
                                    + ' rearrangement load records have been loaded.');

                        return tapisIO.gatherRepertoireMetadataForProject(projectUuid, true);
                    })
            })
            .then(function(_repertoireMetadata) {
                if (! projectLoad) return;
                if (! dataLoad) {
                    console.log('VDJ-API INFO: projectQueueManager.rearrangementLoadTask, all rearrangement loads done for project: ' + projectLoad.uuid);
                    console.log('VDJ-API INFO: projectQueueManager.rearrangementLoadTask, project completely loaded: ' + projectLoad.uuid);
                    // project to be loaded but no dataLoad means all rearrangement loads have been completed
                    // update the load status
                    projectLoad.value.rearrangementDataLoaded = true;
                    projectLoad.value.isLoaded = true;
                    return tapisIO.updateMetadata(projectLoad.uuid, projectLoad.name, projectLoad.value, projectLoad.associationIds);
                }

                //console.log(dataLoad);
                repertoireMetadata = _repertoireMetadata;

                if (repertoireMetadata.length != rearrangementLoad.length) {
                    msg = 'VDJ-API ERROR: projectQueueManager.rearrangementLoadTask, number (' + rearrangementLoad.length
                        + ') of rearrangement load records is not equal to number (' + repertoireMetadata.length
                        + ') of repertoires.';
                    return null;
                }

                console.log('VDJ-API INFO: projectQueueManager.rearrangementLoadTask, rearrangement data load: '
                            + dataLoad['uuid'] + ' for repertoire: ' + dataLoad['value']['repertoire_id']
                            + ' at load set: ' + dataLoad['value']['load_set']);

                for (var i = 0; i < repertoireMetadata.length; ++i) {
                    if (repertoireMetadata[i]['repertoire_id'] == dataLoad['value']['repertoire_id']) {
                        repertoire = repertoireMetadata[i];
                        break;
                    }
                }
                //console.log(repertoire);

                if (! repertoire) {
                    msg = 'VDJ-API ERROR: projectQueueManager.rearrangementLoadTask, could not find repertoire record for repertoire_id: '
                        + dataLoad['value']['repertoire_id'];
                    return null;
                }

                for (var i = 0; i < repertoire['data_processing'].length; ++i) {
                    if (repertoire['data_processing'][i]['primary_annotation']) {
                        primaryDP = repertoire['data_processing'][i];
                        break;
                    }
                }

                if (! primaryDP) {
                    msg = 'VDJ-API ERROR: projectQueueManager.rearrangementLoadTask, could not find primary data processing for repertoire_id: '
                        + dataLoad['value']['repertoire_id'];
                    return null;
                }
                
                if (! primaryDP['data_processing_id']) {
                    msg = 'VDJ-API ERROR: projectQueueManager.rearrangementLoadTask, no data_processing_id for primary data processing for repertoire_id: '
                        + dataLoad['value']['repertoire_id'];
                    return null;
                }

                if (! primaryDP['data_processing_files']) {
                    msg = 'VDJ-API ERROR: projectQueueManager.rearrangementLoadTask, primary data processing: '
                        + primaryDP['data_processing_id'] + " does not have data_processing_files.";
                    return null;
                }

                if (primaryDP['data_processing_files'].length == 0) {
                    msg = 'VDJ-API ERROR: projectQueueManager.rearrangementLoadTask, primary data processing: '
                        + primaryDP['data_processing_id'] + " does not have data_processing_files.";
                    return null;
                }

                // get the data processing record
                // TODO: right now this is a job, but we should switch to using analysis_provenance_id
                // which contains the appropriate information
                return tapisIO.getJobOutput(primaryDP['data_processing_id'])
                    .then(function(_job) {
                        if (! _job) {
                            msg = 'VDJ-API ERROR: projectQueueManager.rearrangementLoadTask, could not get job: '
                                + primaryDP['data_processing_id'] + ' for primary data processing: ' + primaryDP['data_processing_id'];
                            return null;
                        }
                        jobOutput = _job;
                        //console.log(jobOutput);

                        if (! jobOutput['archivePath']) {
                            msg = 'VDJ-API ERROR: projectQueueManager.rearrangementLoadTask, job: ' + jobOutput.uuid + " is missing archivePath.";
                            return null;
                        }
                        if (jobOutput['archivePath'].length == 0) {
                            msg = 'VDJ-API ERROR: projectQueueManager.rearrangementLoadTask, job: ' + jobOutput.uuid + " is missing archivePath.";
                            return null;
                        }

                        // finally, start the rearrangement load!
                        return mongoIO.loadRearrangementData(dataLoad, repertoire, primaryDP, jobOutput);
                    })
            })
            .then(function() {
                console.log('VDJ-API INFO: projectQueueManager.rearrangementLoadTask, task done.');
                if (msg) {
                    // an error occurred so stop the task
                    console.error(msg);
                    webhookIO.postToSlack(msg);
                    done(new Error(msg));
                } else {
                    // if not all loaded trigger start at beginning and check for more
                    if (allRearrangementsLoaded && allProjectsLoaded) {
                        console.log('VDJ-API INFO: projectQueueManager.rearrangementLoadTask, all loads done, pausing queue.');
                    }
                    else {
                        taskQueue
                            .create('checkProjectsToLoadTask', null)
                            .removeOnComplete(true)
                            .attempts(5)
                            .backoff({delay: 60 * 1000, type: 'fixed'})
                            .save();
                    }

                    done();
                }
            })
            .catch(function(error) {
                if (!msg) msg = 'VDJ-API ERROR: projectQueueManager.rearrangementLoadTask - error ' + error;
                console.error(msg);
                webhookIO.postToSlack(msg);
                done(new Error(msg));
            });

    });
};
*/


adcQueueManager.triggerProjectUnload = function(projectUuid, loadMetadata) {
    console.log('VDJ-API INFO (ProjectQueueManager.triggerProjectUnload):');
    unloadQueue.add({projectUuid:projectUuid, loadMetadata:loadMetadata});
}

unloadQueue.process(async (job) => {
    var msg = null;
    var projectUuid = job['data']['projectUuid'];
    var loadMetadata = job['data']['loadMetadata'];

    console.log('VDJ-API INFO (unloadQueue): start');

    // get the rearrangement load records
    var rearrangementLoad = await tapisIO.getRearrangementsToBeLoaded(projectUuid, tapisSettings.mongo_loadCollection)
        .catch(function(error) {
            msg = 'VDJ-API ERROR (unloadQueue): tapisIO.getRearrangementsToBeLoaded, error: ' + error;
        });
    if (msg) {
        console.error(msg);
        webhookIO.postToSlack(msg);
        return Promise.resolve();
    }

    if (! rearrangementLoad || rearrangementLoad.length == 0) {
        console.log('VDJ-API INFO (unloadQueue): project has no rearrangement load records: ' + projectUuid);
        return Promise.resolve();
    }

    console.log('VDJ-API INFO (unloadQueue): gathered ' + rearrangementLoad.length + ' rearrangement load records for project: ' + projectUuid);

    // for each load record, delete rearrangements, delete load metadata
    for (let i = 0; i < rearrangementLoad.length; i++) {
        var loadRecord = rearrangementLoad[i];
        var rearrangementCollection = 'rearrangement' + loadRecord['value']['collection'];
        var repertoireCollection = 'repertoire' + loadRecord['value']['collection'];

        if (! loadRecord['value']['repertoire_id']) {
            msg = 'VDJ-API ERROR (unloadQueue): missing repertoire_id from load record: ' + JSON.stringify(loadRecord);
            console.error(msg);
            webhookIO.postToSlack(msg);
            return Promise.resolve();
        }

        if (loadRecord['value']['collection'] != tapisSettings.mongo_loadCollection) {
            msg = 'VDJ-API ERROR (unloadQueue): load record collection: ' + loadRecord['value']['collection'] + ' != ' + tapisSettings.mongo_loadCollection + ' config load collection';
            console.error(msg);
            webhookIO.postToSlack(msg);
            return Promise.resolve();
        }

        console.log('VDJ-API INFO (unloadQueue): deleting rearrangements for repertoire:', loadRecord['value']['repertoire_id']);
        await mongoIO.deleteLoadSet(loadRecord['value']['repertoire_id'], null, rearrangementCollection)
            .catch(function(error) {
                msg = 'VDJ-API ERROR (unloadQueue): mongoIO.deleteLoadSet, error: ' + error;
            });
        if (msg) {
            console.error(msg);
            webhookIO.postToSlack(msg);
            return Promise.resolve();
        }

        console.log('VDJ-API INFO (unloadQueue): deleting repertoire:', loadRecord['value']['repertoire_id']);
        await mongoIO.deleteRepertoire(loadRecord['value']['repertoire_id'], repertoireCollection)
            .catch(function(error) {
                msg = 'VDJ-API ERROR (unloadQueue): mongoIO.deleteLoadSet, error: ' + error;
            });
        if (msg) {
            console.error(msg);
            webhookIO.postToSlack(msg);
            return Promise.resolve();
        }

        console.log('VDJ-API INFO (unloadQueue): deleting rearrangement load record:', loadRecord['uuid']);
        await ServiceAccount.getToken()
            .catch(function(error) {
                msg = 'VDJ-API ERROR (unloadQueue): ServiceAccount.getToken, error: ' + error;
            });
        if (msg) {
            console.error(msg);
            webhookIO.postToSlack(msg);
            return Promise.resolve();
        }

        await tapisIO.deleteMetadata(ServiceAccount.accessToken(), loadRecord['uuid'])
            .catch(function(error) {
                msg = 'VDJ-API ERROR (unloadQueue): tapisIO.deleteMetadata, error: ' + error;
            });
        if (msg) {
            console.error(msg);
            webhookIO.postToSlack(msg);
            return Promise.resolve();
        }
    }

    console.log('VDJ-API INFO (unloadQueue): complete');
});
