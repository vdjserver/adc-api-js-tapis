
'use strict';

//
// adcDownloadQueueManager.js
// Manage ADC download cache tasks
//
// VDJServer Analysis Portal
// VDJ Web API service
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

var ADCDownloadQueueManager = {};
module.exports = ADCDownloadQueueManager;

// App
var app = require('../../app');
var config = require('../../config/config');

// Tapis
var tapisSettings = require('vdj-tapis-js/tapisSettings');
var tapisIO = tapisSettings.get_default_tapis();
var tapisSettings = tapisIO.tapisSettings;
var ServiceAccount = tapisIO.serviceAccount;
var webhookIO = require('vdj-tapis-js/webhookIO');
var emailIO = require('vdj-tapis-js/emailIO');
var adcIO = require('vdj-tapis-js/adcIO');

// Node Libraries
var Queue = require('bull');
var fs = require('fs');
const fsPromises = require('fs').promises;
const zlib = require('zlib');
var stream = require('stream');
var tar = require('tar');

var triggerQueue = new Queue('ADC download cache trigger', { redis: app.redisConfig });
var cacheQueue = new Queue('ADC download cache entry', { redis: app.redisConfig });
var submitQueue = new Queue('ADC download cache submit', { redis: app.redisConfig });
var finishQueue = new Queue('ADC download cache finish', { redis: app.redisConfig });
var finishStudyQueue = new Queue('ADC download cache study finish', { redis: app.redisConfig });
var clearQueue = new Queue('ADC download cache clear', { redis: app.redisConfig });

//
// Trigger the download cache process
// check and create, if necessary, the adc_cache metadata singleton.
// This is called by app initialization
//
ADCDownloadQueueManager.triggerDownloadCache = async function() {
    var msg = null;

    if (config.debug) console.log('VDJ-API INFO: ADCDownloadQueueManager.triggerDownloadCache');
    
    var adc_cache = await tapisIO.getADCDownloadCache()
        .catch(function(error) {
            msg = 'VDJ-API ERROR: ADCDownloadQueueManager.triggerDownloadCache, error ' + error;
        });
    if (msg) {
        console.error(msg);
        webhookIO.postToSlack(msg);
        return;
    }

    //console.log(adc_cache);
    if (adc_cache.length == 0) {
        console.log('VDJ-API INFO: ADCDownloadQueueManager.triggerDownloadCache, creating adc_cache metadata singleton');

        // create the adc_cache metadata singleton
        adc_cache = await tapisIO.createADCDownloadCache()
            .catch(function(error) {
                msg = 'VDJ-API ERROR: ADCDownloadQueueManager.triggerDownloadCache, error ' + error;
            });
        if (msg) {
            console.error(msg);
            webhookIO.postToSlack(msg);
            return;
        }
    } else {
        adc_cache = adc_cache[0];
    }
    console.log('VDJ-API INFO: ADCDownloadQueueManager.triggerDownloadCache, current enable_cache = ' + adc_cache['value']['enable_cache']);
    //console.log(adc_cache);

    // enable the cache
    console.log('VDJ-API INFO: ADCDownloadQueueManager.triggerDownloadCache, enabling cache');
    adc_cache['value']['enable_cache'] = true;
    await tapisIO.updateDocument(adc_cache['uuid'], adc_cache['name'], adc_cache['value'], null)
        .catch(function(error) {
            msg = 'VDJ-API ERROR: ADCDownloadQueueManager.triggerDownloadCache, error ' + error;
        });
    if (msg) {
        console.error(msg);
        webhookIO.postToSlack(msg);
        return;
    }

    // trigger the queue
    console.log('VDJ-API INFO: ADCDownloadQueueManager.triggerDownloadCache, cache enabled, creating queues');
    // submit one job to run immediately and another once per hour
    triggerQueue.add({adc_cache: adc_cache});
    triggerQueue.add({adc_cache: adc_cache}, { repeat: { cron: '0 * * * *' } });
}


//
// Because populating the download cache is resource intensive, we
// only want one task occurring at a time. Here we check the task
// queues to see if any are running. If not, we start a cache entry
// job
//

triggerQueue.process(async (job) => {
    var msg = null;

    console.log('VDJ-API INFO: Triggering ADC download cache queue');
    //console.log(job['data']);

    if (config.debug) {
        var triggers = await triggerQueue.getJobs(['active']);
        console.log('VDJ-API INFO: active trigger jobs (' + triggers.length + ')');
        var triggers = await triggerQueue.getJobs(['wait']);
        console.log('VDJ-API INFO: wait trigger jobs (' + triggers.length + ')');
        var triggers = await triggerQueue.getJobs(['delayed']);
        console.log('VDJ-API INFO: delayed trigger jobs (' + triggers.length + ')');
        //console.log(triggers);
    }

    // check if active jobs in queues
    var jobs = await submitQueue.getJobs(['active']);
    //console.log(jobs);
    //console.log(jobs.length);
    if (jobs.length > 0) {
        console.log('VDJ-API INFO: active jobs (' + jobs.length + ') in ADC download cache submit queue, skip trigger');
        return Promise.resolve();
    }

    // check if active jobs in queues
    var jobs = await cacheQueue.getJobs(['active']);
    //console.log(jobs);
    //console.log(jobs.length);
    if (jobs.length > 0) {
        console.log('VDJ-API INFO: active jobs (' + jobs.length + ') in ADC download cache entry queue, skip trigger');
        return Promise.resolve();
    }

    jobs = await finishQueue.getJobs(['active']);
    //console.log(jobs);
    //console.log(jobs.length);
    if (jobs.length > 0) {
        console.log('VDJ-API INFO: active jobs (' + jobs.length + ') in ADC download cache finish queue, skip trigger');
        return Promise.resolve();
    }

    // nothing running so submit
    var adc_cache = await tapisIO.getADCDownloadCache()
        .catch(function(error) {
            msg = 'VDJ-API ERROR: triggerQueue, error ' + error;
        });
    if (msg) {
        console.error(msg);
        webhookIO.postToSlack(msg);
        return Promise.resolve();
    }
    // verify cache is enabled
    if (adc_cache[0]['value']['enable_cache']) {
        console.log('VDJ-API INFO: submitting ADC download cache job');
        submitQueue.add({adc_cache: adc_cache});
    } else {
        console.log('VDJ-API INFO: ADC download cache is not enabled');
    }

    return Promise.resolve();
});

// ADC download cache process
//
// top level job which gathers what is to be cached,
// creates/updates metadata entries for each cached item,
// then submits smaller individual jobs to generate cache contents
//
// 1. Create/update cache entries
// 2. Get next study/repertoire to be cached
// 3. do the caching
//
// we attempt to write in a re-entrant fashion so we can just restart if failure occurs
//
submitQueue.process(async (job) => {
    var msg = null;

    console.log('VDJ-API INFO: starting ADC download cache job');
    //console.log(job['data']);

    // get set of ADC repositories
    var repos = await tapisIO.getSystemADCRepositories()
        .catch(function(error) {
            msg = 'VDJ-API ERROR: ADCDownloadQueueManager submitQueue, tapisIO.getSystemADCRepositories error ' + error;
        });
    if (msg) {
        console.error(msg);
        webhookIO.postToSlack(msg);
        return Promise.resolve();
    }

    if (!repos || repos.length != 1) {
        msg = 'VDJ-API ERROR: ADCDownloadQueueManager submitQueue, tapisIO.getSystemADCRepositories invalid metadata: ' + repos;
        console.error(msg);
        webhookIO.postToSlack(msg);
        return Promise.resolve();
    }

    // create/update cache entries for each repository
    repos = repos[0]['value'][config.adcRepositoryEntry];
    //console.log(repos);

    for (var repository_id in repos) {
        // only if cache is enabled on repository
        if (! repos[repository_id]['enable_cache']) continue;

        console.log('VDJ-API INFO: ADC download cache submit job for repository:', repository_id);

        // query studies from the ADC repository
        var studies = await adcIO.getStudies(repos[repository_id])
            .catch(function(error) {
                msg = 'VDJ-API ERROR: ADCDownloadQueueManager submitQueue, adcIO.getStudies error ' + error;
            });
        if (msg) {
            console.error(msg);
            webhookIO.postToSlack(msg);
            return Promise.resolve();
        }
        console.log('VDJ-API INFO:', studies.length, 'studies for repository:', repository_id);
        //console.log(studies);

        // get any cached study entries for the repository
        var cached_studies = await tapisIO.getStudyCacheEntries(repository_id)
            .catch(function(error) {
                msg = 'VDJ-API ERROR: ADCDownloadQueueManager submitQueue, tapisIO.getCachedStudies error ' + error;
            });
        if (msg) {
            console.error(msg);
            webhookIO.postToSlack(msg);
            return Promise.resolve();
        }
        //console.log(cached_studies);
        // turn into dictionary keyed by study_id
        var cached_studies_dict = {};
        for (var i in cached_studies) {
            var study_id = cached_studies[i]['value']['study_id'];
            if (cached_studies_dict[study_id]) {
                msg = 'VDJ-API ERROR: ADCDownloadQueueManager submitQueue, duplicate study_id: ' + study_id;
                console.error(msg);
                webhookIO.postToSlack(msg);
                return Promise.resolve();
            } else cached_studies_dict[study_id] = cached_studies[i];
        }
        console.log('VDJ-API INFO:', cached_studies.length, 'cache study entries for repository:', repository_id);

        // create study cache entries if necessary
        for (var s in studies) {
            var study_id = studies[s]['study.study_id'];
            //console.log(study_id);
            // TODO: we should check if an existing study has been updated
            if (cached_studies_dict[study_id]) continue;

            // query repertoires from the ADC repository for the study
            var repertoire_metadata = await adcIO.getRepertoires(repos[repository_id], study_id)
                .catch(function(error) {
                    msg = 'VDJ-API ERROR: ADCDownloadQueueManager submitQueue, adcIO.getRepertoires error ' + error;
                });
            if (msg) {
                console.error(msg);
                webhookIO.postToSlack(msg);
                return Promise.resolve();
            }
            var reps = repertoire_metadata['Repertoire'];
            console.log('VDJ-API INFO:', reps.length, 'repertoires for study:', study_id);

            if (reps.length == 0) continue;

            // For VDJServer, verify that the study has been completely loaded
            var vdjserver_uuid = reps[0]['study']['vdjserver_uuid'];
            if (vdjserver_uuid) {
                console.log('VDJ-API INFO: check project load:', vdjserver_uuid);
                var projectLoad = await tapisIO.getProjectLoadMetadata(vdjserver_uuid, tapisSettings.mongo_loadCollection)
                    .catch(function(error) {
                        msg = 'VDJ-API ERROR: ADCDownloadQueueManager submitQueue, tapisIO.createCachedStudyMetadata error ' + error;
                    });
                if (msg) {
                    console.error(msg);
                    webhookIO.postToSlack(msg);
                    return Promise.resolve();
                }
                if (!projectLoad) continue;
                if (projectLoad.length == 0) continue;
                if (!projectLoad[0]['value']['isLoaded']) {
                    console.log('VDJ-API INFO: skipping ADC study:', study_id, 'because not completely loaded, load record:', projectLoad[0]['uuid']);
                    continue;
                }
            }

            // insert cache entry
            console.log('VDJ-API INFO: ADC study to be cached:', study_id);
            var cache_entry = await tapisIO.createCachedStudyMetadata(repository_id, study_id, true)
                .catch(function(error) {
                    msg = 'VDJ-API ERROR: ADCDownloadQueueManager submitQueue, tapisIO.createCachedStudyMetadata error ' + error;
                });
            if (msg) {
                console.error(msg);
                webhookIO.postToSlack(msg);
                return Promise.resolve();
            }
            console.log('VDJ-API INFO: caching enabled for ADC study:', study_id);
            //console.log(cache_entry);
        }

        // reload with any new entries
        cached_studies = await tapisIO.getStudyCacheEntries(repository_id)
            .catch(function(error) {
                msg = 'VDJ-API ERROR: ADCDownloadQueueManager submitQueue, tapisIO.getCachedStudies error ' + error;
            });
        if (msg) {
            console.error(msg);
            webhookIO.postToSlack(msg);
            return Promise.resolve();
        }
        // turn into dictionary keyed by study_id
        cached_studies_dict = {};
        for (var i in cached_studies) {
            var study_id = cached_studies[i]['value']['study_id'];
            if (cached_studies_dict[study_id]) {
                msg = 'VDJ-API ERROR: ADCDownloadQueueManager submitQueue, duplicate study_id: ' + study_id;
                console.error(msg);
                webhookIO.postToSlack(msg);
                return Promise.resolve();
            } else cached_studies_dict[study_id] = cached_studies[i];
        }
        console.log('VDJ-API INFO:', cached_studies.length, 'cache study entries for repository:', repository_id);
        //console.log(cached_studies);

        // create repertoire cache entries if necessary
        for (var s in cached_studies) {
            if (! cached_studies[s]['value']['should_cache']) continue;
            if (cached_studies[s]['value']['is_cached']) continue;
            var study_id = cached_studies[s]['value']['study_id'];

            // query repertoires from the ADC repository for the study
            var repertoire_metadata = await adcIO.getRepertoires(repos[repository_id], study_id)
                .catch(function(error) {
                    msg = 'VDJ-API ERROR: ADCDownloadQueueManager submitQueue, adcIO.getRepertoires error ' + error;
                });
            if (msg) {
                console.error(msg);
                webhookIO.postToSlack(msg);
                return Promise.resolve();
            }
            var reps = repertoire_metadata['Repertoire'];
            console.log('VDJ-API INFO:', reps.length, 'repertoires for study:', study_id);
            //console.log(reps);

            // get any cached repertoire entries for the study
            var cached_reps = await tapisIO.getRepertoireCacheEntries(repository_id, study_id, null, null, null)
                .catch(function(error) {
                    msg = 'VDJ-API ERROR: ADCDownloadQueueManager submitQueue, tapisIO.getRepertoireCacheEntries error ' + error;
                });
            if (msg) {
                console.error(msg);
                webhookIO.postToSlack(msg);
                return Promise.resolve();
            }
            // turn into dictionary keyed by repertoire_id
            var cached_reps_dict = {};
            for (var i in cached_reps) {
                var repertoire_id = cached_reps[i]['value']['repertoire_id'];
                if (cached_reps_dict[repertoire_id]) {
                    msg = 'VDJ-API ERROR: ADCDownloadQueueManager submitQueue, duplicate repertoire_id: ' + repertoire_id;
                    console.error(msg);
                    webhookIO.postToSlack(msg);
                    return Promise.resolve();
                } else cached_reps_dict[repertoire_id] = cached_reps[i];
            }
            console.log('VDJ-API INFO:', cached_reps.length, 'cache repertoire entries for study:', study_id);

            for (var r in reps) {
                var repertoire_id = reps[r]['repertoire_id'];

                // TODO: we might want to update the existing entry
                if (cached_reps_dict[repertoire_id]) continue;

                // create cache entry
                var cache_entry = await tapisIO.createCachedRepertoireMetadata(repository_id, study_id, repertoire_id, true)
                    .catch(function(error) {
                        msg = 'VDJ-API ERROR: ADCDownloadQueueManager submitQueue, tapisIO.createCachedRepertoireMetadata error ' + error;
                    });
                if (msg) {
                    console.error(msg);
                    webhookIO.postToSlack(msg);
                    return Promise.resolve();
                }
                console.log('VDJ-API INFO: caching enabled for ADC repertoire:', repertoire_id, 'for study:', study_id);
            }
        }
    }
    console.log('VDJ-API INFO: all cache entries updated.');

    // All cache entries should be created/updated
    // Now do the caching
    // we submit only one job for now, with trigger
    for (var repository_id in repos) {
        // only if cache is enabled on repository
        if (! repos[repository_id]['enable_cache']) continue;

        console.log('VDJ-API INFO: ADC query and download job for repository:', repository_id);

        // get the cached study entries for the repository
        var cached_studies = await tapisIO.getStudyCacheEntries(repository_id)
            .catch(function(error) {
                msg = 'VDJ-API ERROR: ADCDownloadQueueManager submitQueue, tapisIO.getCachedStudies error ' + error;
            });
        if (msg) {
            console.error(msg);
            webhookIO.postToSlack(msg);
            return Promise.resolve();
        }
        console.log('VDJ-API INFO:', cached_studies.length, 'cache study entries for repository:', repository_id);
        //console.log(cached_studies);

        // check if all of the repertoires have been cached for a study
        for (var s in cached_studies) {
            if (! cached_studies[s]['value']['should_cache']) continue;
            if (cached_studies[s]['value']['is_cached']) continue;
            var study_id = cached_studies[s]['value']['study_id'];

            // get the cached repertoire entries for the study
            var cached_reps = await tapisIO.getRepertoireCacheEntries(repository_id, study_id, null, null, null)
                .catch(function(error) {
                    msg = 'VDJ-API ERROR: ADCDownloadQueueManager submitQueue, tapisIO.getRepertoireCacheEntries error ' + error;
                });
            if (msg) {
                console.error(msg);
                webhookIO.postToSlack(msg);
                return Promise.resolve();
            }

            // have they all been cached?
            var doneCaching = true;
            var repcnt = 0;
            for (var i in cached_reps) {
                doneCaching &= cached_reps[i]['value']['is_cached'];
                if (cached_reps[i]['value']['is_cached']) repcnt += 1;
            }
            if (doneCaching) {
                console.log('VDJ-API INFO: (submitQueue): all', cached_reps.length, 'repertoires have been cached for study:', study_id);
                finishStudyQueue.add({repository:repos[repository_id], study_cache:cached_studies[s]});
                return Promise.resolve();
            } else {
                console.log('VDJ-API INFO: (submitQueue):', repcnt, 'of', cached_reps.length, 'repertoires have been cached for study:', study_id);
                for (var i in cached_reps) {
                    var entry = cached_reps[i];
                    if (! entry['value']['is_cached']) {
                        cacheQueue.add({repository:repos[repository_id], study_cache:cached_studies[s], repertoire_cache:entry});
                        return Promise.resolve();
                    }
                }
            }
        }
    }

    console.log('VDJ-API INFO (submitQueue): everything is cached.');

    return Promise.resolve();
});

cacheQueue.process(async (job) => {
    var msg = null;
    var context = 'ADCDownloadQueueManager cacheQueue'

    console.log('VDJ-API INFO: start ADC query and download job');

    // process data
    console.log(job['data']);
    var repository = job['data']['repository'];
    var repertoire_cache = job['data']['repertoire_cache'];
    var repertoire_id = repertoire_cache['value']['repertoire_id'];
    var study_cache_uuid = job['data']['study_cache']['uuid'];
    var tapis_path = 'agave://data.vdjserver.org//community/cache';

    //console.log(study_cache_uuid);
    console.log('VDJ-API INFO: creating cache directory:', study_cache_uuid);

    await tapisIO.createCommunityCacheDirectory(study_cache_uuid)
        .catch(function(error) {
            msg = 'VDJ-API ERROR: ADCDownloadQueueManager cacheQueue, tapisIO.createCommunityCacheDirectory error ' + error;
        });
    if (msg) {
        console.error(msg);
        webhookIO.postToSlack(msg);
        return Promise.resolve();
    }

    // does the repertoire_cache already have an async query id
    if (repertoire_cache['value']['async_query_id']) {
        console.log('VDJ-API INFO: repertoire has existing async query:', repertoire_cache['value']['async_query_id']);

        // get status of that query
        var query_status = await adcIO.asyncQueryStatus(repository, repertoire_cache['value']['async_query_id'])
            .catch(function(error) {
                msg = 'VDJ-API ERROR: ADCDownloadQueueManager cacheQueue, could not get status for ADC ASYNC query '
                    + repertoire_cache['value']['async_query_id'] + ' for repository ' + repository + '\n' + error;
            });
            if (msg) {
                console.error(msg);
                webhookIO.postToSlack(msg);
                return Promise.resolve();
            }

        // if ERROR, then we want to retry the async query
        if (query_status['status'] == 'ERROR') {
            // remove old query id or just let the process below overwrite it?
            console.log('VDJ-API INFO: async query had an error, retrying. Query status:', query_status);
        } else {
            // other statuses probably means it is still running, so just return
            console.log('VDJ-API INFO: async query still processing.');

            // query status is finished then presumably the finishQueue has been notified
            // TODO: may need to handle case when we did not get notification
            if (query_status['status'] == 'FINISHED') {
                console.log('VDJ-API INFO: async query is FINISHED, manually sending notification.');
                // manually send notification
                var notification = { url: tapisSettings.notifyHost + '/api/v2/adc/cache/notify/' + repertoire_cache['uuid'], method: 'POST' };
                await adcIO.sendNotification(notification, query_status)
                    .catch(function(error) {
                        msg = 'VDJ-API ERROR: ADCDownloadQueueManager cacheQueue, could not manually send notification '
                            + repertoire_cache['uuid'] + '\n' + error;
                        console.error(msg);
                        webhookIO.postToSlack(msg);
                    });
            }
            return Promise.resolve();
        }
    }

    // use ADC ASYNC API if supported
    // TODO: we should get this from the repository info
    if (repository['supports_async']) {
        var notification = { url: tapisSettings.notifyHost + '/api/v2/adc/cache/notify/' + repertoire_cache['uuid'], method: 'POST' };
        var query_id = await adcIO.asyncGetRearrangements(repository, repertoire_id, notification)
            .catch(function(error) {
                msg = 'VDJ-API ERROR: ADCDownloadQueueManager cacheQueue, could not submit ADC ASYNC query for repertoire_id '
                    + repertoire_id + ' for repository ' + repository + '\n' + error;
            });
        if (msg) {
            console.error(msg);
            webhookIO.postToSlack(msg);
            return Promise.resolve();
        }

        console.log(query_id);

        // save query_id in repertoire cache metadata
        repertoire_cache['value']['async_query_id'] = query_id['query_id'];
        await tapisIO.updateDocument(repertoire_cache['uuid'], repertoire_cache['name'], repertoire_cache['value'], null)
            .catch(function(error) {
                msg = 'VDJ-API ERROR: ADCDownloadQueueManager cacheQueue, error ' + error;
            });
        if (msg) {
            console.error(msg);
            webhookIO.postToSlack(msg);
            return Promise.resolve();
        }
    } else {
        // otherwise we do our own download
        config.log.info(context, 'ADC ASYNC API not available for repository: ' + repository['repository_id']);

        var filename = repertoire_cache['uuid'] + '.airr.tsv';
        var filepath = config.lrqdata_path + filename;
        await adcIO.downloadRearrangements(repository, repertoire_id, filepath)
            .catch(function(error) {
                msg = 'Could not download rearrangements for repertoire_id '
                    + repertoire_id + ' for repository ' + repository + '\n' + error;
                msg = config.log.error(context, msg);
            });
        if (msg) {
            webhookIO.postToSlack(msg);
            return Promise.resolve();
        }

        // finish the download
        ADCDownloadQueueManager.finishDownload({study_cache: job['data']['study_cache'], repertoire_cache: repertoire_cache, query_status: {'final_file':filename, 'delete_file':filepath}});
    }

    // update cache metadata entry
    //console.log('update metadata');

    // okay we got to the end
    return Promise.resolve();
});

ADCDownloadQueueManager.finishDownload = function(data) {
    finishQueue.add(data);
}

// Create the cached rearrangement file in its final spot
// We directly access the Corral file system
ADCDownloadQueueManager.processRearrangementFile = async function(repertoire_id, filename, cache_dir) {
    var infile = config.lrqdata_path + filename;
    var cache_path = config.vdjserver_data_path + 'community/cache/' + cache_dir + '/';
    var outname = repertoire_id + '.airr.tsv.gz';
    var outfile = cache_path + outname;

    console.log('VDJ-API INFO (ADCDownloadQueueManager.processRearrangementFile): input file:', infile);
    console.log('VDJ-API INFO (ADCDownloadQueueManager.processRearrangementFile): output file:', outfile);

    return new Promise(function(resolve, reject) {
        // Open read/write streams
        var readable = fs.createReadStream(infile)
            .on('error', function(e) { return reject(e); });
        var writable = fs.createWriteStream(outfile)
            .on('error', function(e) { return reject(e); });

        // process the stream
        readable.pipe(zlib.createGzip())
            .on('error', function(e) { return reject(e); })
            .pipe(writable)
            .on('finish', function() {
                console.log('end of stream');
                writable.end();
            });

        writable.on('finish', function() {
            console.log('finish of write stream');
            return resolve(outname);
        });
    });
}

finishQueue.process(async (job) => {
    var msg = null;
    var context = 'ADCDownloadQueueManager.finishQueue';

    var study_cache = job['data']['study_cache'];
    var repertoire_cache = job['data']['repertoire_cache'];
    var query_status = job['data']['query_status'];
    console.log(study_cache);
    console.log(repertoire_cache);
    console.log(query_status);

    // reload cache metadata, to check if already finished
    var metadata = await tapisIO.getDocument(repertoire_cache['uuid'])
        .catch(function(error) {
            msg = 'VDJ-API ERROR (finishQueuee): Could not get metadata id: ' + repertoire_cache['uuid'] + ', error: ' + error;
            console.error(msg);
            webhookIO.postToSlack(msg);
            return Promise.reject(new Error(msg));
        });
    if ((! metadata['value']['should_cache']) || (metadata['value']['is_cached'])) {
        console.log('VDJ-API INFO (finishQueue): already cached:',repertoire_cache['uuid'],', skipping finish process');
        return Promise.resolve();
    }

    // locate the file, copy it to the cache directory and gzip
    var outname = await ADCDownloadQueueManager.processRearrangementFile(repertoire_cache['value']['repertoire_id'], query_status['final_file'], study_cache['uuid'])
        .catch(function(error) {
            msg = 'VDJ-API ERROR (finishQueue): Could not finish processing rearrangement file for repertoire cache: ' + repertoire_cache['uuid'] + '.\n' + error;
            console.error(msg);
            webhookIO.postToSlack(msg);
            return Promise.reject(new Error(msg));
        });

    // delete temporary file
    if (query_status['delete_file']) {
        try {
            config.log.info(context, 'Deleting temporary file: ' + query_status['delete_file']);
            await fsPromises.unlink(query_status['delete_file']);
        } catch (e) {
            if (e.code != 'ENOENT') {
                msg = config.log.error(context, 'Unknown error deleting ' + query_status['delete_file'] + ', error: ' + e);
                webhookIO.postToSlack(msg);
            }
        }
    }

    // create permanent postit
    var url = 'https://' + tapisSettings.hostname
        + '/files/v2/media/system/'
        + tapisSettings.storageSystem
        + '//community/cache/' + study_cache['uuid'] + '/' + outname
        + '?force=true';

    var postit = await tapisIO.createPublicFilePostit(url, true)
        .catch(function(error) {
            msg = 'VDJ-API ERROR (finishQueue): Could not create postit for rearrangement file for repertoire cache: ' + repertoire_cache['uuid'] + '.\n' + error;
            console.error(msg);
            webhookIO.postToSlack(msg);
            return Promise.reject(new Error(msg));
        });

    // update the metadata
    if (config.debug) console.log('VDJ-API INFO (finishQueue): Created postit: ' + postit["postit"]);
    repertoire_cache["value"]["archive_file"] = outname;
    repertoire_cache["value"]["postit_id"] = postit["postit"];
    repertoire_cache["value"]["download_url"] = postit["_links"]["self"]["href"];
    repertoire_cache["value"]["is_cached"] = true;
    var cache_path = config.vdjserver_data_path + 'community/cache/' + study_cache['uuid'] + '/';
    var stats = fs.statSync(cache_path + outname);
    repertoire_cache["value"]["file_size"] = stats.size;
    await tapisIO.updateDocument(repertoire_cache['uuid'], repertoire_cache['name'], repertoire_cache['value'], null)
        .catch(function(error) {
            msg = 'VDJ-API ERROR (finishQueue): Could not update metadata for repertoire cache: ' + repertoire_cache['uuid'] + '.\n' + error;
            console.error(msg);
            webhookIO.postToSlack(msg);
            return Promise.reject(new Error(msg));
        });

    console.log('VDJ-API INFO: finishing ADC download cache job');

    ADCDownloadQueueManager.triggerDownloadCache();

    return Promise.resolve();
});

// Create a single archive for the whole study
// We directly access the Corral file system
ADCDownloadQueueManager.processStudyFile = async function(cache_dir, file_list, file_num) {
    var cache_path = config.vdjserver_data_path + 'community/cache/' + cache_dir + '/';
    var outfile;
    if (file_num == 0) outfile = 'study.tar';
    else outfile = 'study' + file_num + '.tar';
    var outname = cache_path + outfile;

    console.log('VDJ-API INFO (ADCDownloadQueueManager.processStudyFile):', file_list.length, ' input files');
    console.log('VDJ-API INFO (ADCDownloadQueueManager.processStudyFile): output file:', outname);

    //await tar.create({ gzip:false, file:outname, cwd:cache_path }, file_list);

    const { exec } = require('child_process');
    var files = file_list.join(' ');
    var cmd = 'tar cf ' + outfile + ' ' + files;
    console.log(cmd);
    return new Promise(function(resolve, reject) {
        exec(cmd, { cwd:cache_path }, (error, stdout, stderr) => {
            if (error) {
                console.error('exec error:', error);
                return reject(new Error(error));
            }
            console.log('stdout:', stdout);
            console.error('stderr:', stderr);
            return resolve(outfile);
        });
    });

    //return Promise.resolve(outfile);
}

// With the rearrangements cached in AIRR TSV files for all repertoires
// in a study, now create archive for the whole study
finishStudyQueue.process(async (job) => {
    var msg = null;
    var context = 'ADCDownloadQueueManager.finishStudyQueue';

    var repository = job['data']['repository'];
    var study_cache = job['data']['study_cache'];

    config.log.info(context, 'start job for repository: ' + study_cache['value']['repository_id'] + ' and study: ' + study_cache['value']['study_id']);

    // reload cache metadata, to check if already finished
    var metadata = await tapisIO.getDocument(study_cache['uuid'])
        .catch(function(error) {
            msg = 'VDJ-API ERROR (finishStudyQueue): Could not get metadata id: ' + study_cache['uuid'] + ', error: ' + error;
            console.error(msg);
            webhookIO.postToSlack(msg);
            return Promise.reject(new Error(msg));
        });
    metadata = metadata[0];
    if ((! metadata['value']['should_cache']) || (metadata['value']['is_cached'])) {
        console.log('VDJ-API INFO (finishStudyQueue): already cached:',study_cache['uuid'],', skipping finish process');
        return Promise.resolve();
    }

    // get the cached repertoire entries for the study
    var cached_reps = await tapisIO.getRepertoireCacheEntries(study_cache['value']['repository_id'], study_cache['value']['study_id'], null, null, null)
        .catch(function(error) {
            msg = 'VDJ-API ERROR (finishStudyQueue): tapisIO.getRepertoireCacheEntries error ' + error;
        });
    if (msg) {
        console.error(msg);
        webhookIO.postToSlack(msg);
        return Promise.reject(new Error(msg));
    }
    //console.log(cached_reps);

    // get all the repertoire metadata for the study and put in file
    var repertoire_metadata = await adcIO.getRepertoires(repository, study_cache['value']['study_id'])
        .catch(function(error) {
            msg = 'VDJ-API ERROR (finishStudyQueue): tapisIO.getRepertoires error ' + error;
        });
    if (msg) {
        console.error(msg);
        webhookIO.postToSlack(msg);
        return Promise.reject(new Error(msg));
    }
    //console.log(repertoire_metadata);

    var cache_path = config.vdjserver_data_path + 'community/cache/' + study_cache['uuid'] + '/';
    var metaname = 'repertoires.airr.json';
    var metafile = cache_path + metaname;
    config.log.info(context, "Writing repertoire metadata json to file: " + metafile);
    try {
        fs.writeFileSync(metafile, JSON.stringify(repertoire_metadata, null, 2));
    } catch (e) {
        msg = config.log.error(context, "Error writing repertoire metadata file: " + metafile + ", error: " + e);
        webhookIO.postToSlack(msg);
        return Promise.reject(new Error(msg));
    }

    var file_list = ['repertoires.airr.json'];
    for (let i in cached_reps) file_list.push(cached_reps[i]['value']['archive_file']);
    console.log(file_list);

    // TODO: analyze the size of files so that a single archive is not too big, split into multiple files
    var max = 50 * 1024 * 1024 * 1024;
    var current_size = 0;
    var file_list = [ ['repertoires.airr.json'] ];
    var idx = 0;
    for (let i in cached_reps) {
        if (! cached_reps[i]['value']['file_size']) {
            // missing file size so add it
            var repertoire_cache = cached_reps[i];
            var stats = fs.statSync(cache_path + repertoire_cache["value"]["archive_file"]);
            repertoire_cache["value"]["file_size"] = stats.size;
            await tapisIO.updateDocument(repertoire_cache['uuid'], repertoire_cache['name'], repertoire_cache['value'], null)
                .catch(function(error) {
                    msg = 'VDJ-API ERROR (finishStudyQueue): Could not update metadata for repertoire cache: ' + repertoire_cache['uuid'] + '.\n' + error;
                    console.error(msg);
                    webhookIO.postToSlack(msg);
                    return Promise.reject(new Error(msg));
                });
        }

        if ((current_size + cached_reps[i]['value']['file_size']) < max) {
            file_list[idx].push(cached_reps[i]['value']['archive_file']);
            current_size += cached_reps[i]['value']['file_size'];
        } else {
            idx += 1;
            file_list[idx] = [];
            file_list[idx].push(cached_reps[i]['value']['archive_file']);
            current_size = cached_reps[i]['value']['file_size'];
        }
    }
    console.log(file_list);

    var outnames = [];
    var postits = [];
    for (let i = 0; i <= idx; ++i) {
        // create the study archive
        var outname = await ADCDownloadQueueManager.processStudyFile(study_cache['uuid'], file_list[i], i)
            .catch(function(error) {
                msg = 'VDJ-API ERROR (finishStudyQueue): Could not create study archive for study cache: ' + study_cache['uuid'] + '.\n' + error;
                console.error(msg);
                webhookIO.postToSlack(msg);
                return Promise.reject(new Error(msg));
            });
        outnames.push(outname);

        // create permanent postit
        //var url = 'https://' + tapisSettings.hostname
        //    + '/files/v2/media/system/'
        //    + tapisSettings.storageSystem
        //    + '//community/cache/' + study_cache['uuid'] + '/' + outname
        //    + '?force=true';

        let fileobj = { allowedUses: 2000000000, validSeconds: 2000000000 };
        fileobj['path'] = outname;
        var postit = await tapisIO.createADCDownloadCachePostit(study_cache['uuid'], fileobj)
            .catch(function(error) {
                msg = 'VDJ-API ERROR (finishStudyQueue): Could not create postit for study archive for study cache: ' + study_cache['uuid'] + '.\n' + error;
                console.error(msg);
                webhookIO.postToSlack(msg);
                return Promise.reject(new Error(msg));
            });
        console.log(postit);
        postits.push(postit);
        if (config.debug) console.log('VDJ-API INFO (finishStudyQueue): Created postit: ' + postit["id"]);
    }

    // update the metadata
    if (idx == 0) {
        study_cache["value"]["archive_file"] = outnames[0];
        study_cache["value"]["postit_id"] = postits[0]["id"];
        study_cache["value"]["download_url"] = postits[0]["redeemUrl"];
        let stats = fs.statSync(cache_path + outnames[0]);
        study_cache["value"]["file_size"] = stats.size;
    } else {
        var postit_list = [];
        var url_list = [];
        var size_list = [];
        for (let i = 0; i <= idx; ++i) {
            postit_list.push(postits[i]["id"]);
            url_list.push(postits[i]["redeemUrl"]);
            let stats = fs.statSync(cache_path + outnames[i]);
            size_list.push(stats.size);
        }
        study_cache["value"]["archive_file"] = outnames;
        study_cache["value"]["postit_id"] = postit_list;
        study_cache["value"]["download_url"] = url_list;
        study_cache["value"]["file_size"] = size_list;
    }
    study_cache["value"]["is_cached"] = true;

    await tapisIO.updateDocument(study_cache['uuid'], study_cache['name'], study_cache['value'], null)
        .catch(function(error) {
            msg = 'VDJ-API ERROR (finishStudyQueue): Could not update metadata for study cache: ' + study_cache['uuid'] + '.\n' + error;
            console.error(msg);
            webhookIO.postToSlack(msg);
            return Promise.reject(new Error(msg));
        });

    console.log('VDJ-API INFO (finishStudyQueue): end job for repository:', study_cache['value']['repository_id'], 'and study:', study_cache['value']['study_id']);

    // retrigger
    ADCDownloadQueueManager.triggerDownloadCache();

    return Promise.resolve();
});

//
// Clear the download cache process
//
ADCDownloadQueueManager.triggerClearCache = function(repository_id, study_id) {
    console.log('VDJ-API INFO (ADCDownloadQueueManager.triggerClearCache): start');
    clearQueue.add({ repository_id:repository_id, study_id:study_id });
}

//
// This is specialized function when the repertoire metadata has been updated
// but the rearrangement data has not changed. In this case we only need to
// put a new repertoire metadata file and re-generate the study archive file.
//
ADCDownloadQueueManager.recacheRepertoireMetadata = async function(repository_id, study_id) {
    var msg = null;

    console.log('VDJ-API INFO (ADCDownloadQueueManager.recacheRepertoireMetadata): start');

    var study_cache = await tapisIO.getStudyCacheEntries(repository_id, study_id)
        .catch(function(error) {
            msg = 'VDJ-API ERROR (ADCDownloadQueueManager.recacheRepertoireMetadata): tapisIO.getCachedStudies error ' + error;
        });
    if (msg) {
        console.error(msg);
        webhookIO.postToSlack(msg);
        return Promise.resolve();
    }

    if (! study_cache || study_cache.length != 1) {
        msg = 'VDJ-API INFO (ADCDownloadQueueManager.recacheRepertoireMetadata): incorrect number of study cache entries: ' + JSON.stringify(study_cache);
        console.error(msg);
        webhookIO.postToSlack(msg);
        return Promise.resolve();
    }
    study_cache = study_cache[0];

    // flag the archive file to be re-generated
    study_cache["value"]["is_cached"] = false;
    study_cache["value"]["archive_file"] = null;

    await tapisIO.updateDocument(study_cache['uuid'], study_cache['name'], study_cache['value'], null)
        .catch(function(error) {
            msg = 'VDJ-API ERROR (ADCDownloadQueueManager.recacheRepertoireMetadata): Could not update metadata for study cache: ' + study_cache['uuid'] + '.\n' + error;
            console.error(msg);
            webhookIO.postToSlack(msg);
            return Promise.reject(new Error(msg));
        });

    console.log('VDJ-API INFO (ADCDownloadQueueManager.recacheRepertoireMetadata): end');
}

clearQueue.process(async (job) => {
    var msg = null;
    var repository_id = job['data']['repository_id'];
    var study_id = job['data']['study_id'];

    console.log('VDJ-API INFO (clearQueue): start');

    console.log('VDJ-API INFO (clearQueue): clear ADC download cache for repository:', repository_id, 'and study:', study_id);

    var study_cache = await tapisIO.getStudyCacheEntries(repository_id, study_id)
        .catch(function(error) {
            msg = 'VDJ-API ERROR: ADCDownloadQueueManager clearQueue, tapisIO.getCachedStudies error ' + error;
        });
    if (msg) {
        console.error(msg);
        webhookIO.postToSlack(msg);
        return Promise.resolve();
    }

    if (! study_cache || study_cache.length != 1) {
        msg = 'VDJ-API INFO (clearQueue): incorrect number of study cache entries: ' + JSON.stringify(study_cache);
        console.error(msg);
        webhookIO.postToSlack(msg);
        return Promise.resolve();
    }
    study_cache = study_cache[0];

    // get any cached repertoire entries for the study
    var cached_reps = await tapisIO.getRepertoireCacheEntries(repository_id, study_id, null, null, null)
        .catch(function(error) {
            msg = 'VDJ-API ERROR (clearQueue): tapisIO.getRepertoireCacheEntries error ' + error;
        });
    if (msg) {
        console.error(msg);
        webhookIO.postToSlack(msg);
        return Promise.resolve();
    }

    console.log('VDJ-API INFO (clearQueue):', cached_reps.length, 'cache repertoire entries for study:', study_id);

    await ServiceAccount.getToken()
        .catch(function(error) {
            msg = 'VDJ-API ERROR (unloadQueue): ServiceAccount.getToken, error: ' + error;
        });
    if (msg) {
        console.error(msg);
        webhookIO.postToSlack(msg);
        return Promise.resolve();
    }

    // delete the whole study cache directory
    var cache_path = config.vdjserver_data_path + 'community/cache/' + study_cache['uuid'];
    console.log('VDJ-API INFO (clearQueue): deleting ADC directory:', cache_path);
    fs.rmdirSync(cache_path, { recursive:true });

    // for each cached repertoire entry, delete the postit, delete the metadata
    for (let i in cached_reps) {
        console.log('VDJ-API INFO (clearQueue): deleting ADC repertoire cache record:', cached_reps[i]['uuid']);

        if (cached_reps[i]['value']['postit_id']) {
            await tapisIO.deletePostit(cached_reps[i]['value']['postit_id'])
                .catch(function(error) {
                    msg = 'VDJ-API ERROR (clearQueue): tapisIO.deletePostit: ' + cached_reps[i]['value']['postit_id'] + ', error ' + error;
                });
            if (msg) {
                console.error(msg);
                webhookIO.postToSlack(msg);
                // postits not critical so just continue
            }
        }

        await tapisIO.deleteMetadata(ServiceAccount.accessToken(), cached_reps[i]['uuid'])
            .catch(function(error) {
                msg = 'VDJ-API ERROR (clearQueue): tapisIO.deleteMetadata: ' + cached_reps[i]['uuid'] + ', error ' + error;
            });
        if (msg) {
            console.error(msg);
            webhookIO.postToSlack(msg);
            return Promise.resolve();
        }
    }

    // for study, delete the postit, delete the metadata
    console.log('VDJ-API INFO (clearQueue): deleting ADC study cache record:', study_cache['uuid']);
    if (study_cache['value']['postit_id']) {
        await tapisIO.deletePostit(study_cache['value']['postit_id'])
            .catch(function(error) {
                msg = 'VDJ-API ERROR (clearQueue): tapisIO.deletePostit: ' + study_cache['value']['postit_id'] + ', error ' + error;
            });
        if (msg) {
            console.error(msg);
            webhookIO.postToSlack(msg);
            // postits not critical so just continue
        }
    }

    await tapisIO.deleteMetadata(ServiceAccount.accessToken(), study_cache['uuid'])
        .catch(function(error) {
            msg = 'VDJ-API ERROR (clearQueue): tapisIO.deleteMetadata: ' + study_cache['uuid'] + ', error ' + error;
        });
    if (msg) {
        console.error(msg);
        webhookIO.postToSlack(msg);
        return Promise.resolve();
    }

    console.log('VDJ-API INFO (clearQueue): complete');
});
