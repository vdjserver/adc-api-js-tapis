'use strict';

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
    // respond with service info
    res.json(config.info);
}
