'use strict';

//
// receptor.js
// Receptor end points
//
// VDJServer Community Data Portal
// ADC API for VDJServer
// https://vdjserver.org
//
// Copyright (C) 2022 The University of Texas Southwestern Medical Center
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

var ReceptorController = {};
module.exports = ReceptorController;

// Server environment config
var config = require('../../config/config');

function getInfoObject() {
    var info = { };
    var schema = global.airr['Info'];
    info['title'] = config.info.description;
    info['description'] = 'VDJServer ADC API response for receptor query'
    info['version'] = schema.version;
    info['contact'] = config.info.contact;
    return info;
}

ReceptorController.getReceptor = function(req, res) {
    var info = getInfoObject();
    res.json({"Info":info,"Receptor":[]});
}

ReceptorController.queryReceptors = function(req, res) {
    var bodyData = req.body;
    var facets = bodyData['facets'];
    var info = getInfoObject();

    if (facets) res.json({"Info":info,"Facet":[]});
    else res.json({"Info":info,"Receptor":[]});
}
