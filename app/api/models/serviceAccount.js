'use strict';

//
// serviceAccount.js
// service account for admin tasks
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

// Node Libraries
var Q = require('q');

var agaveSettings = require('../../config/tapisSettings');
var AgaveToken = require('./agaveToken');

var ServiceAccount = {
    username: agaveSettings.serviceAccountKey,
    password: agaveSettings.serviceAccountSecret,
    agaveToken: null
};

module.exports = ServiceAccount;

// Processing
var agaveIO = require('../vendor/agaveIO');

ServiceAccount.getToken = function() {

    var deferred = Q.defer();
    var that = this;

    agaveIO.getToken(this)
    .then(function(responseObject) {
	that.agaveToken = new AgaveToken(responseObject);
	deferred.resolve(that.agaveToken);
    })
    .fail(function(errorObject) {
	console.log('VDJServer ADC API ERROR: Unable to login with service account. ' + errorObject);
        deferred.reject(errorObject);
    });

    return deferred.promise;
}

ServiceAccount.accessToken = function() {
    return this.agaveToken.access_token;
}
