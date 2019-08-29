'use strict';

var path = require('path');
var fs = require('fs');

var config = {};

module.exports = config;

// General
config.port = process.env.API_PORT;

// API customization
config.custom_file = process.env.CUSTOM_FILE;

// Error/debug reporting
config.debug = process.env.DEBUG_CONSOLE;
config.slackURL = process.env.SLACK_WEBHOOK_URL;

// get info
var infoFile = path.resolve(__dirname, '../package.json');
var infoString = fs.readFileSync(infoFile, 'utf8');
config.info = JSON.parse(infoString);

// constraints
config.max_size = 1000;
config.max_query_size = 2 * 1024 * 1024;

// contact info
config.title = 'VDJServer Community Data Portal';
config.contact = {
    name: "VDJServer",
    url: "http://vdjserver.org/",
    email: "vdjserver@utsouthwestern.edu"
};
