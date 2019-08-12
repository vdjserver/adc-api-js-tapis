'use strict';

// Node Libraries
var Q = require('q');

var agaveSettings = require('../../config/tapisSettings');
var AgaveToken = require('./agaveToken');

var GuestAccount = {
    username: agaveSettings.guestAccountKey,
    password: agaveSettings.guestAccountSecret,
    agaveToken: null
};

module.exports = GuestAccount;

// Processing
var agaveIO = require('../vendor/agaveIO');

GuestAccount.getToken = function() {

    var deferred = Q.defer();
    var that = this;

    agaveIO.getToken(this)
    .then(function(responseObject) {
	that.agaveToken = new AgaveToken(responseObject);
	deferred.resolve(that.agaveToken);
    })
    .fail(function(errorObject) {
	console.log('VDJServer ADC API ERROR: Unable to login with guest account. ' + errorObject);
        deferred.reject(errorObject);
    });

    return deferred.promise;
}

GuestAccount.accessToken = function() {
    return this.agaveToken.access_token;
}
