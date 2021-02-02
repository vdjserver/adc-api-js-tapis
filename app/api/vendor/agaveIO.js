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

                // hack for LRQ
                //output = output.replace(/'/g, '"');

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

agaveIO.performAsyncQuery = function(collection, query, projection, page, pagesize, count) {

    var postData = {
        name: "myQuery",
        queryType: "SIMPLE",
        query: [ query ],
        notification: "https://vdj-staging.tacc.utexas.edu/bogus"
    };
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
