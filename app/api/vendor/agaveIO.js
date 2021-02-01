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
var Q = require('q');
//var _ = require('underscore');
var jsonApprover = require('json-approver');
//var FormData = require('form-data');

//
// Generic send request
//
agaveIO.sendRequest = function(requestSettings, postData) {

    var deferred = Q.defer();

    var request = require('https').request(requestSettings, function(response) {

        var output = '';

        response.on('data', function(chunk) {
            output += chunk;
        });

        response.on('end', function() {

            var responseObject;
            
            console.log(output);
            output = output.replace(/'/g, '"');
            console.log(jsonApprover.isJSON(output));
            console.log(JSON.parse(output));

            if ((response.statusCode >= 400) && (response.statusCode != 404)) {
                deferred.reject(new Error('Request error: ' + output));
            } else if (output.length == 0) {
                deferred.resolve(null);
            } else if (output && jsonApprover.isJSON(output)) {
                responseObject = JSON.parse(output);
                //console.log(responseObject);
                deferred.resolve(responseObject);
            } else {
                console.error('VDJ-ADC-API ERROR: Agave response is not json: ' + output);
                deferred.reject(new Error('Agave response is not json: ' + output));
            }

        });
    });

    request.on('error', function(error) {
        console.error('VDJ-ADC-API ERROR: Agave connection error, error:' + JSON.stringify(error));
        if (error.code == 'ECONNRESET')
            deferred.reject(new Error('Network timeout.'));
        else
            deferred.reject(new Error('Agave connection error'));
    });

    if (postData) {
        // Request body parameters
        request.write(postData);
    }

    request.end();

    return deferred.promise;
};

//
// This is specific to sending multi-part form post data, i.e. uploading files
//
agaveIO.sendFormRequest = function(requestSettings, formData) {

    var deferred = Q.defer();

    var request = formData.submit(requestSettings, function(error, response) {

            var output = '';

            response.on('data', function(chunk) {
                    output += chunk;
                });

            response.on('end', function() {

                    var responseObject;

                    if (output && jsonApprover.isJSON(output)) {
                        responseObject = JSON.parse(output);
                    }
                    else {

                        console.error('VDJ-ADC-API ERROR: Agave response is not json.');

                        deferred.reject(new Error('Agave response is not json'));
                    }

                    if (responseObject && responseObject.status && responseObject.status.toLowerCase() === 'success') {
                        deferred.resolve(responseObject);
                    }
                    else {

                            console.error('VDJ-ADC-API ERROR: Agave returned an error. it is: ' + JSON.stringify(responseObject));
                            console.error('VDJ-ADC0API ERROR: Agave returned an error. it is: ' + responseObject);

                        deferred.reject(new Error('Agave response returned an error: ' + JSON.stringify(responseObject)));
                    }

                });
        });

    request.on('error', function(error) {
                console.error('VDJ-ADC-API ERROR: Agave connection error.' + JSON.stringify(error));

            deferred.reject(new Error('Agave connection error. ' + JSON.stringify(error)));
        });

    return deferred.promise;
};

agaveIO.sendTokenRequest = function(requestSettings, postData) {

    var deferred = Q.defer();

    var request = require('https').request(requestSettings, function(response) {

            var output = '';

            response.on('data', function(chunk) {
                    output += chunk;
                });

            response.on('end', function() {

                    var responseObject;

                    if (output && jsonApprover.isJSON(output)) {
                        responseObject = JSON.parse(output);
                    }
                    else {

                            console.error('VDJ-ADC-API ERROR: Agave token response is not json.');

                        deferred.reject(new Error('Agave response is not json'));
                    }

                    if (
                        responseObject
                        && responseObject.access_token
                        && responseObject.refresh_token
                        && responseObject.token_type
                        && responseObject.expires_in
                        ) {
                        deferred.resolve(responseObject);
                    }
                    else {

                            console.error('VDJ-ADC-API ERROR: Agave returned a token error. it is: ' + JSON.stringify(responseObject));
                            console.error('VDJ-ADC-API ERROR: Agave returned a token error. it is: ' + responseObject);

                        deferred.reject(new Error('Agave response returned an error: ' + JSON.stringify(responseObject)));
                    }

                });
        });

    request.on('error', function(error) {
                console.error('VDJ-ADC-API ERROR: Agave connection error.' + JSON.stringify(error));

            deferred.reject(new Error('Agave connection error. ' + JSON.stringify(error)));
        });

    if (postData) {
        // Request body parameters
        request.write(postData);
    }

    request.end();

    return deferred.promise;
};

// Fetches a user token based on the supplied auth object
// and returns the auth object with token data on success
agaveIO.getToken = function(auth) {

    var deferred = Q.defer();

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

    agaveIO.sendTokenRequest(requestSettings, postData)
    .then(function(responseObject) {
            deferred.resolve(responseObject);
        })
    .fail(function(errorObject) {
            deferred.reject(errorObject);
        });

    return deferred.promise;
};

agaveIO.performLargeQuery = function(collection, query, projection, page, pagesize) {

    var deferred = Q.defer();

    var postData = query;
    if (! postData) deferred.reject(new Error('Empty query passed to agaveIO.performLargeQuery'));

    GuestAccount.getToken()
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
            deferred.resolve(responseObject);
        })
        .fail(function(errorObject) {
            console.error('performQuery: ' + errorObject);
            deferred.reject(errorObject);
        });

    return deferred.promise;
};

agaveIO.performQuery = function(collection, query, projection, page, pagesize, count) {

    var deferred = Q.defer();

    GuestAccount.getToken()
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
        })
        .then(function(responseObject) {
            deferred.resolve(responseObject);
        })
        .fail(function(errorObject) {
            console.error('performQuery: ' + errorObject);
            deferred.reject(errorObject);
        });

    return deferred.promise;
};

agaveIO.performAsyncQuery = function(collection, query, projection, page, pagesize, count) {

    var deferred = Q.defer();

    var postData = {
        name: "myQuery",
        queryType: "SIMPLE",
        query: [ query ],
        notification: "https://vdj-staging.tacc.utexas.edu/bogus"
    };
    postData = JSON.stringify(postData);

    ServiceAccount.getToken()
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
            deferred.resolve(responseObject);
        })
        .fail(function(errorObject) {
            console.error('performAsyncQuery: ' + errorObject);
            deferred.reject(errorObject);
        });

    return deferred.promise;
};

agaveIO.performLargeAggregation = function(collection, aggregation, query, field, page, pagesize) {

    var deferred = Q.defer();

    var postData = '{"match":' + query + ',"field":"' + field + '"}';
    //console.log(postData);

    GuestAccount.getToken()
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
            deferred.resolve(responseObject);
        })
        .fail(function(errorObject) {
            deferred.reject(errorObject);
        });

    return deferred.promise;
};

agaveIO.performAggregation = function(collection, aggregation, query, field, page, pagesize) {

    var deferred = Q.defer();

    GuestAccount.getToken()
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
            deferred.resolve(responseObject);
        })
    .fail(function(errorObject) {
            deferred.reject(errorObject);
        });

    return deferred.promise;
};

agaveIO.recordQuery = function(query) {

    var deferred = Q.defer();

    ServiceAccount.getToken()
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
            deferred.resolve(responseObject);
        })
        .fail(function(errorObject) {
            console.error(errorObject);
            deferred.reject(errorObject);
        });

    return deferred.promise;
};
