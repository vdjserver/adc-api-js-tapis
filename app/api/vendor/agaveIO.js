'use strict';

// Settings
var agaveSettings = require('../../config/tapisSettings');

// Models
//var ServiceAccount = require('../models/serviceAccount');
//var MetadataPermissions = require('../models/metadataPermissions');
var GuestAccount = require('../models/guestAccount');

// Processing
//var webhookIO = require('../vendor/webhookIO');

// Node Libraries
var Q = require('q');
//var _ = require('underscore');
var jsonApprover = require('json-approver');
//var FormData = require('form-data');

var agaveIO  = {};
module.exports = agaveIO;

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

                    if (output && jsonApprover.isJSON(output)) {
                        responseObject = JSON.parse(output);
                        //console.log(responseObject);
                        deferred.resolve(responseObject);
                    }
                    else {

                        console.error('VDJ-ADC-API ERROR: Agave response is not json: ' + output);

                        deferred.reject(new Error('Agave response is not json: ' + output));
                    }

                });
        });

    request.on('error', function(error) {
        console.error('VDJ-ADC-API ERROR: Agave connection error.' + JSON.stringify(error));

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

agaveIO.performQuery = function(collection, query, projection, page, pagesize) {

    var deferred = Q.defer();

    GuestAccount.getToken()
    .then(function(token) {
            var mark = false;
            var requestSettings = {
                host:     agaveSettings.hostname,
                method:   'GET',
                path:     '/meta/v3/v1airr/' + collection,
                rejectUnauthorized: false,
                headers: {
                    'Accept':   'application/json',
                    'Authorization': 'Bearer ' + GuestAccount.accessToken()
                }
            };
            if (query) {
                if (mark) requestSettings['path'] += '&';
                else requestSettings['path'] += '?';
                mark = true;
                requestSettings['path'] += 'filter=' + encodeURIComponent(query);
            }
            if (projection) {
                if (mark) requestSettings['path'] += '&';
                else requestSettings['path'] += '?';
                mark = true;
                requestSettings['path'] += 'keys=' + encodeURIComponent(JSON.stringify(projection));
            }
            if (page) {
                if (mark) requestSettings['path'] += '&';
                else requestSettings['path'] += '?';
                mark = true;
                requestSettings['path'] += 'page=' + encodeURIComponent(page);
            }
            if (pagesize) {
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

            console.log(requestSettings);

            return agaveIO.sendRequest(requestSettings, null);
        })
    .then(function(responseObject) {
            deferred.resolve(responseObject);
        })
    .fail(function(errorObject) {
        console.log(errorObject);
            deferred.reject(errorObject);
        });

    return deferred.promise;
};

agaveIO.performAggregation = function(collection, aggregation, query, field) {

    var deferred = Q.defer();

    GuestAccount.getToken()
    .then(function(token) {
            var requestSettings = {
                host:     agaveSettings.hostname,
                method:   'GET',
                path:     '/meta/v3/v1airr/' + collection + '/_aggrs/' + aggregation,
                rejectUnauthorized: false,
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'Authorization': 'Bearer ' + GuestAccount.accessToken()
                }
            };

            requestSettings['path'] += '?avars=';
            requestSettings['path'] += encodeURIComponent('{"match":' + query + ',"field":"' + field + '"}');

            console.log(requestSettings);

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
