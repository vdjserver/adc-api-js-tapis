'use strict';

//
// config.js
// Application configuration settings
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

var path = require('path');
var fs = require('fs');
var yaml = require('js-yaml');

var config = {};

module.exports = config;

// General
config.port = process.env.API_PORT;

// API customization
config.custom_file = process.env.CUSTOM_FILE;

// Error/debug reporting
config.debug = process.env.DEBUG_CONSOLE;
if (config.debug == 'true') config.debug = true;
else if (config.debug == 1) config.debug = true;
else config.debug = false;

// post error messages to a slack channel
config.slackURL = process.env.SLACK_WEBHOOK_URL;

// get service info
var infoFile = path.resolve(__dirname, '../package.json');
var infoString = fs.readFileSync(infoFile, 'utf8');
var info = JSON.parse(infoString);
config.info = {};
config.info.title = info.name;
config.info.description = info.description;
config.info.version = info.version;
config.info.contact = {
    name: "VDJServer",
    url: "http://vdjserver.org/",
    email: "vdjserver@utsouthwestern.edu"
};
config.info.license = {};
config.info.license.name = info.license;

// get api info
var apiFile = fs.readFileSync(path.resolve(__dirname, '../api/swagger/adc-api.yaml'), 'utf8');
var apiSpec = yaml.safeLoad(apiFile);
config.info.api = apiSpec['info'];

// get schema info
var schemaFile = fs.readFileSync(path.resolve(__dirname, './airr-schema.yaml'), 'utf8');
var schemaSpec = yaml.safeLoad(schemaFile);
config.info.schema = schemaSpec['Info'];

// constraints
config.max_size = 1000;
config.info.max_size = 1000;
// TODO: limited at the moment
config.max_query_size = 1024;
config.info.max_query_size = 1024;
//config.max_query_size = 2 * 1024 * 1024;
