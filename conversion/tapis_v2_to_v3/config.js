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

function parseBoolean(value)
{
    if (value == 'true') return true;
    else if (value == 1) return true;
    else return false;
}

// General
config.name = 'tapis-v2-to-v3-conversion';

// Error/debug reporting
config.debug = parseBoolean(process.env.DEBUG_CONSOLE);

// standard info/error reporting
config.log = {};
config.log.info = function(context, msg, ignore_debug = false) {
    var date = new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' });
    if (ignore_debug)
        console.log(date, '-', config.name, 'INFO (' + context + '):', msg);
    else
        if (config.debug) console.log(date, '-', config.name, 'INFO (' + context + '):', msg);
}

config.log.error = function(context, msg) {
    var date = new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' });
    var full_msg = date + ' - ' + config.name + ' ERROR (' + context + '): ' + msg
    console.error(full_msg);
    console.trace(context);
    return full_msg;
}
config.log.info('config', 'Debug console messages enabled.', true);

