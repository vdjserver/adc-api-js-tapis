'use strict';

//
// agaveIO.js
// Encapsulate requests to Tapis (Agave) API
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

var agaveIO  = {};
module.exports = agaveIO;

// Settings
var agaveSettings = require('../../config/tapisSettings');
var mongoSettings = require('../../config/mongoSettings');

// Models
var ServiceAccount = require('../models/serviceAccount');
var GuestAccount = require('../models/guestAccount');

// Processing
//var webhookIO = require('../vendor/webhookIO');

// Node Libraries
var jsonApprover = require('json-approver');

//
// Generic send request
//
agaveIO.sendRequest = function(requestSettings, postData) {

    return new Promise(function(resolve, reject) {
        var request = require('https').request(requestSettings, function(response) {

            var output = '';

            response.on('data', function(chunk) {
                output += chunk;
            });

            response.on('end', function() {

                var responseObject;

                if ((response.statusCode >= 400) && (response.statusCode != 404)) {
                    reject(new Error('Request error: ' + output));
                } else if (output.length == 0) {
                    resolve(null);
                } else if (output && jsonApprover.isJSON(output)) {
                    responseObject = JSON.parse(output);
                    resolve(responseObject);
                } else {
                    console.error('VDJ-ADC-API ERROR: Agave response is not json: ' + output);
                    reject(new Error('Agave response is not json: ' + output));
                }
            });
        });

        request.on('error', function(error) {
            console.error('VDJ-ADC-API ERROR: Agave connection error:' + JSON.stringify(error));
            reject(new Error('Agave connection error:' + JSON.stringify(error)));
        });

        if (postData) {
            // Request body parameters
            request.write(postData);
        }

        request.end();
    });
};

agaveIO.sendTokenRequest = function(requestSettings, postData) {

    return new Promise(function(resolve, reject) {
        var request = require('https').request(requestSettings, function(response) {

            var output = '';

            response.on('data', function(chunk) {
                output += chunk;
            });

            response.on('end', function() {

                var responseObject;

                if (output && jsonApprover.isJSON(output)) {
                    responseObject = JSON.parse(output);
                } else {
                    console.error('VDJ-ADC-API ERROR: Agave response is not json: ' + output);
                    reject(new Error('Agave response is not json: ' + output));
                }

                if (responseObject
                    && responseObject.access_token
                    && responseObject.refresh_token
                    && responseObject.token_type
                    && responseObject.expires_in)
                {
                    resolve(responseObject);
                } else {
                    reject(new Error('Agave response returned an error: ' + output));
                }
            });
        });

        request.on('error', function() {
            console.error('VDJ-ADC-API ERROR: Agave connection error:' + JSON.stringify(error));
            reject(new Error('Agave connection error:' + JSON.stringify(error)));
        });

        if (postData) {
            // Request body parameters
            request.write(postData);
        }

        request.end();
    });
};


// Fetches a user token based on the supplied auth object
// and returns the auth object with token data on success
agaveIO.getToken = function(auth) {

    var postData = 'grant_type=password&scope=PRODUCTION&username=' + auth.username + '&password=' + auth.password;

    var requestSettings = {
        host:     agaveSettings.hostname,
        method:   'POST',
        auth:     agaveSettings.clientKey + ':' + agaveSettings.clientSecret,
        path:     '/token',
        rejectUnauthorized: false,
        headers: {
            'Content-Type':   'application/x-www-form-urlencoded',
            'Content-Length': Buffer.byteLength(postData)
        }
    };

    return agaveIO.sendTokenRequest(requestSettings, postData);
};

agaveIO.performLargeQuery = function(collection, query, projection, page, pagesize) {

    var postData = query;
    if (! postData) return Promise.reject(new Error('Empty query passed to agaveIO.performLargeQuery'));

    return GuestAccount.getToken()
        .then(function(token) {
            var mark = false;
            var requestSettings = {
                host:     agaveSettings.hostname,
                method:   'POST',
                path:     '/meta/v3/' + mongoSettings.dbname + '/' + collection + '/_filter',
                rejectUnauthorized: false,
                headers: {
                    'Accept':   'application/json',
                    'Authorization': 'Bearer ' + GuestAccount.accessToken(),
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(postData)
                }
            };
            if (projection != null) {
                if (mark) requestSettings['path'] += '&';
                else requestSettings['path'] += '?';
                mark = true;
                requestSettings['path'] += 'keys=' + encodeURIComponent(JSON.stringify(projection));
            }
            if (page != null) {
                if (mark) requestSettings['path'] += '&';
                else requestSettings['path'] += '?';
                mark = true;
                requestSettings['path'] += 'page=' + encodeURIComponent(page);
            }
            if (pagesize != null) {
                if (mark) requestSettings['path'] += '&';
                else requestSettings['path'] += '?';
                mark = true;
                requestSettings['path'] += 'pagesize=' + encodeURIComponent(pagesize);
            }
            var sort = {};
            if (sort) {
                if (mark) requestSettings['path'] += '&';
                else requestSettings['path'] += '?';
                mark = true;
                requestSettings['path'] += 'sort=' + encodeURIComponent(JSON.stringify(sort));
            }

            //console.log(requestSettings);

            return agaveIO.sendRequest(requestSettings, postData);
        })
        .then(function(responseObject) {
            return Promise.resolve(responseObject);
        })
        .catch(function(errorObject) {
            console.error('performQuery: ' + errorObject);
            return Promise.reject(errorObject);
        });
};

agaveIO.performQuery = function(collection, query, projection, page, pagesize, count) {

    return GuestAccount.getToken()
        .then(function(token) {
            var mark = false;
            var requestSettings = {
                host:     agaveSettings.hostname,
                method:   'GET',
                path:     '/meta/v3/' + mongoSettings.dbname + '/' + collection,
                rejectUnauthorized: false,
                headers: {
                    'Accept':   'application/json',
                    'Authorization': 'Bearer ' + GuestAccount.accessToken()
                }
            };
            if (count) {
                requestSettings['path'] += '/_size';
            }
            if (query != null) {
                if (mark) requestSettings['path'] += '&';
                else requestSettings['path'] += '?';
                mark = true;
                requestSettings['path'] += 'filter=' + encodeURIComponent(query);
            }
            if (projection != null) {
                if (mark) requestSettings['path'] += '&';
                else requestSettings['path'] += '?';
                mark = true;
                requestSettings['path'] += 'keys=' + encodeURIComponent(JSON.stringify(projection));
            }
            if (page != null) {
                if (mark) requestSettings['path'] += '&';
                else requestSettings['path'] += '?';
                mark = true;
                requestSettings['path'] += 'page=' + encodeURIComponent(page);
            }
            if (pagesize != null) {
                if (mark) requestSettings['path'] += '&';
                else requestSettings['path'] += '?';
                mark = true;
                requestSettings['path'] += 'pagesize=' + encodeURIComponent(pagesize);
            }
            var sort = {};
            if (sort) {
                if (mark) requestSettings['path'] += '&';
                else requestSettings['path'] += '?';
                mark = true;
                requestSettings['path'] += 'sort=' + encodeURIComponent(JSON.stringify(sort));
            }

            //console.log(requestSettings);

            return agaveIO.sendRequest(requestSettings, null);
//        })
//        .then(function(responseObject) {
//            return Promise.resolve(responseObject);
//        })
//        .catch(function(errorObject) {
//            console.error('performQuery: ' + errorObject);
//            return Promise.reject(errorObject);
        });
};

agaveIO.performAsyncQuery = function(collection, query, projection, page, pagesize, count, notification) {

    var postData = {
        name: "query",
        queryType: "SIMPLE",
        query: [ query ]
    };
    if (notification) postData['notification'] = notification;
    postData = JSON.stringify(postData);

    return ServiceAccount.getToken()
        .then(function(token) {
            var mark = false;
            var requestSettings = {
                host:     agaveSettings.hostname,
                method:   'POST',
                path:     '/meta/v3/' + mongoSettings.dbname + '/' + collection + '/_lrq',
                rejectUnauthorized: false,
                headers: {
                    'Content-Type': 'application/json',
                    'Accept':   'application/json',
                    'Authorization': 'Bearer ' + ServiceAccount.accessToken(),
                    'Content-Length': Buffer.byteLength(postData)
                }
            };

            console.log(requestSettings);

            return agaveIO.sendRequest(requestSettings, postData);
        })
        .then(function(responseObject) {
            return Promise.resolve(responseObject);
        })
        .catch(function(errorObject) {
            console.error('performAsyncQuery: ' + errorObject);
            return Promise.reject(errorObject);
        });
};

agaveIO.performLargeAggregation = function(collection, aggregation, query, field, page, pagesize) {

    var postData = '{"match":' + query + ',"field":"' + field + '"}';
    //console.log(postData);

    return GuestAccount.getToken()
        .then(function(token) {
            var mark = false;
            var requestSettings = {
                host:     agaveSettings.hostname,
                method:   'POST',
                path:     '/meta/v3/' + mongoSettings.dbname + '/' + collection + '/_aggrs/' + aggregation,
                rejectUnauthorized: false,
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'Authorization': 'Bearer ' + GuestAccount.accessToken(),
                    'Content-Length': Buffer.byteLength(postData)
                }
            };
            if (page != null) {
                if (mark) requestSettings['path'] += '&';
                else requestSettings['path'] += '?';
                mark = true;
                requestSettings['path'] += 'page=' + encodeURIComponent(page);
            }
            if (pagesize != null) {
                if (mark) requestSettings['path'] += '&';
                else requestSettings['path'] += '?';
                mark = true;
                requestSettings['path'] += 'pagesize=' + encodeURIComponent(pagesize);
            }

            //console.log(requestSettings);

            return agaveIO.sendRequest(requestSettings, postData);
        })
        .then(function(responseObject) {
            return Promise.resolve(responseObject);
        })
        .catch(function(errorObject) {
            return Promise.reject(errorObject);
        });
};

agaveIO.performAggregation = function(collection, aggregation, query, field, page, pagesize) {

    return GuestAccount.getToken()
        .then(function(token) {
            var requestSettings = {
                host:     agaveSettings.hostname,
                method:   'GET',
                path:     '/meta/v3/' + mongoSettings.dbname + '/' + collection + '/_aggrs/' + aggregation,
                rejectUnauthorized: false,
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'Authorization': 'Bearer ' + GuestAccount.accessToken()
                }
            };

            requestSettings['path'] += '?avars=';
            requestSettings['path'] += encodeURIComponent('{"match":' + query + ',"field":"' + field + '"}');
            var mark = true;

            if (page != null) {
                if (mark) requestSettings['path'] += '&';
                else requestSettings['path'] += '?';
                mark = true;
                requestSettings['path'] += 'page=' + encodeURIComponent(page);
            }
            if (pagesize != null) {
                if (mark) requestSettings['path'] += '&';
                else requestSettings['path'] += '?';
                mark = true;
                requestSettings['path'] += 'pagesize=' + encodeURIComponent(pagesize);
            }

            //console.log(requestSettings);

            return agaveIO.sendRequest(requestSettings, null);
        })
        .then(function(responseObject) {
            return Promise.resolve(responseObject);
        })
        .catch(function(errorObject) {
            return Promise.reject(errorObject);
        });
};

agaveIO.performAsyncAggregation = function(name, collection, query, notification) {

    var postData = {
        name: name,
        queryType: "AGGREGATION",
        query: query
    };
    if (notification) postData['notification'] = notification;
    postData = JSON.stringify(postData);

    return ServiceAccount.getToken()
        .then(function(token) {
            var mark = false;
            var requestSettings = {
                host:     agaveSettings.hostname,
                method:   'POST',
                path:     '/meta/v3/' + mongoSettings.dbname + '/' + collection + '/_lrq',
                rejectUnauthorized: false,
                headers: {
                    'Content-Type': 'application/json',
                    'Accept':   'application/json',
                    'Authorization': 'Bearer ' + ServiceAccount.accessToken(),
                    'Content-Length': Buffer.byteLength(postData)
                }
            };

            console.log(requestSettings);

            return agaveIO.sendRequest(requestSettings, postData);
        })
        .then(function(responseObject) {
            return Promise.resolve(responseObject);
        })
        .catch(function(errorObject) {
            console.error('performAsyncQuery: ' + errorObject);
            return Promise.reject(errorObject);
        });
};

agaveIO.getLRQStatus = function(lrq_id) {

    return ServiceAccount.getToken()
        .then(function(token) {
            var requestSettings = {
                host:     agaveSettings.hostname,
                method:   'GET',
                path:     '/meta/v3/LRG/vdjserver.org/' + lrg_id,
                rejectUnauthorized: false,
                headers: {
                    'Accept':   'application/json',
                    'Authorization': 'Bearer ' + ServiceAccount.accessToken()
                }
            };

            //console.log(requestSettings);

            return agaveIO.sendRequest(requestSettings, null);
        });
};

agaveIO.recordQuery = function(query) {

    return ServiceAccount.getToken()
        .then(function(token) {

            var postData = JSON.stringify(query);

            var requestSettings = {
                host:     agaveSettings.hostname,
                method:   'POST',
                path:     '/meta/v3/' + mongoSettings.dbname + '/query',
                rejectUnauthorized: false,
                headers: {
                    'Accept':   'application/json',
                    'Authorization': 'Bearer ' + ServiceAccount.accessToken(),
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(postData)
                }
            };

            //console.log(requestSettings);

            return agaveIO.sendRequest(requestSettings, postData);
        })
        .then(function(responseObject) {
            return Promise.resolve(responseObject);
        })
        .catch(function(errorObject) {
            console.error(errorObject);
            return Promise.reject(errorObject);
        });
};

agaveIO.getMetadata = function(uuid) {

    return ServiceAccount.getToken()
        .then(function(token) {
            var requestSettings = {
                host:     agaveSettings.hostname,
                method:   'GET',
                path:     '/meta/v2/data/' + uuid,
                rejectUnauthorized: false,
                headers: {
                    'Authorization': 'Bearer ' + ServiceAccount.accessToken()
                }
            };

            return agaveIO.sendRequest(requestSettings, null);
        })
        .then(function(responseObject) {
            return Promise.resolve(responseObject.result);
        })
        .catch(function(errorObject) {
            return Promise.reject(errorObject);
        });
};

agaveIO.updateMetadata = function(uuid, name, value, associationIds) {

    var postData = {
        name: name,
        value: value
    };
    if (associationIds) postData.associationIds = associationIds;

    postData = JSON.stringify(postData);

    return ServiceAccount.getToken()
        .then(function(token) {
            var requestSettings = {
                host:     agaveSettings.hostname,
                method:   'POST',
                path:     '/meta/v2/data/' + uuid,
                rejectUnauthorized: false,
                headers: {
                    'Content-Type':   'application/json',
                    'Content-Length': Buffer.byteLength(postData),
                    'Authorization': 'Bearer ' + ServiceAccount.accessToken()
                }
            };
            return agaveIO.sendRequest(requestSettings, postData);
        })
        .then(function(responseObject) {
            return Promise.resolve(responseObject.result);
        })
        .catch(function(errorObject) {
            console.log('agaveIO.updateMetadata error: ' + errorObject);
            return Promise.reject(errorObject);
        });
};

agaveIO.createAsyncQueryMetadata = function(endpoint, collection, body, query_aggr, count_aggr) {

    var postData = {
        name: 'async_query',
        value: {
            endpoint: endpoint,
            collection: collection,
            lrq_id: null,
            status: 'PENDING',
            message: null,
            notification: null,
            raw_file: null,
            final_file: null,
            download_url: null,
            body: body,
            query_aggr: query_aggr,
            count_aggr: count_aggr
        }
    };

    postData = JSON.stringify(postData);

    return ServiceAccount.getToken()
        .then(function(token) {
            var requestSettings = {
                host:     agaveSettings.hostname,
                method:   'POST',
                path:     '/meta/v2/data',
                rejectUnauthorized: false,
                headers: {
                    'Content-Type':   'application/json',
                    'Content-Length': Buffer.byteLength(postData),
                    'Authorization': 'Bearer ' + ServiceAccount.accessToken()
                }
            };

            return agaveIO.sendRequest(requestSettings, postData);
        })
        .then(function(responseObject) {
            return Promise.resolve(responseObject.result);
        })
        .catch(function(errorObject) {
            return Promise.reject(errorObject);
        });
};

agaveIO.getAsyncQueryMetadata = function(lrq_id) {

    return ServiceAccount.getToken()
        .then(function(token) {
            var requestSettings = {
                host:     agaveSettings.hostname,
                method:   'GET',
                path:     '/meta/v2/data?q='
                    + encodeURIComponent(
                        '{"name":"async_query",'
                            + ' "value.lrq_id":"' + lrq_id + '"}'
                    )
                    + '&limit=1'
                ,
                rejectUnauthorized: false,
                headers: {
                    'Authorization': 'Bearer ' + ServiceAccount.accessToken()
                }
            };

            console.log(requestSettings);

            return agaveIO.sendRequest(requestSettings, null);
        })
        .then(function(responseObject) {
            return Promise.resolve(responseObject.result);
        })
        .catch(function(errorObject) {
            return Promise.reject(errorObject);
        });
};

agaveIO.createPublicFilePostit = function(url, unlimited, maxUses, lifetime) {

    var postData = {
        url: url,
        method: 'GET'
    };
    if (unlimited) {
        postData["unlimited"] = true;
    } else {
        postData["maxUses"] = maxUses;
        postData["lifetime"] = lifetime;
    }
    postData = JSON.stringify(postData);

    return ServiceAccount.getToken()
        .then(function(token) {
            var requestSettings = {
                host:     agaveSettings.hostname,
                method:   'POST',
                path:     '/postits/v2/',
                rejectUnauthorized: false,
                headers: {
                    'Content-Type':   'application/json',
                    'Content-Length': Buffer.byteLength(postData),
                    'Authorization': 'Bearer ' + ServiceAccount.accessToken()
                }
            };

            return agaveIO.sendRequest(requestSettings, postData);
        })
        .then(function(responseObject) {
            return Promise.resolve(responseObject.result);
        })
        .catch(function(errorObject) {
            return Promise.reject(errorObject);
        });
};
