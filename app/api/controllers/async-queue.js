'use strict';

//
// async-queue.js
// Job queue for processing asynchronous query requests
//
// VDJServer Community Data Portal
// ADC API Asynchronous Extension for VDJServer
// https://vdjserver.org
//
// Copyright (C) 2021 The University of Texas Southwestern Medical Center
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

var AsyncQueue = {};
module.exports = AsyncQueue;

// App
var app = require('../app');

// Server environment config
var config = require('../../config/config');

var Queue = require('bull');

var queryQueue = new Queue('long-running queries', {redis: app.redisConfig});

// Steps for a long-running query
// 1. Process request parameters, construct query
// 2. Submit query to Tapis LRQ API
// 3. Create metadata record with any additional info
// ... wait for notification that query is done
// 4. 

AsyncQueue.processQueryJobs()
{
}
