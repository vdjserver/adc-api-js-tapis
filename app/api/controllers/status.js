'use strict';

//
// status.js
// Status and info end points
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

var util = require('util');

// Server environment config
var config = require('../../config/config');

/*
 Once you 'require' a module you can reference the things that it exports.  These are defined in module.exports.

 For a controller in a127 (which this is) you should export the functions referenced in your Swagger document by name.

 Either:
  - The HTTP Verb of the corresponding operation (get, put, post, delete, etc)
  - Or the operationId associated with the operation in your Swagger document
 */
module.exports = {
    getStatus: getStatus,
    getInfo: getInfo
};

function getStatus(req, res) {
    // Verify we can login with guest account
    var GuestAccount = require('../models/guestAccount');
    GuestAccount.getToken()
	.then(function(guestToken) {
	    res.json({"result":"success"});
	})
	.fail(function(error) {
	    var msg = 'VDJServer ADC API ERROR (getStatus): Could not acquire guest token.\n.' + error;
	    res.status(500).json({"message":"Internal service error."});
	    console.error(msg);
	    webhookIO.postToSlack(msg);
	});
}

function getInfo(req, res) {
    // Respond with service info
    res.json(config.info);
}
