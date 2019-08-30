'use strict';

var agaveSettings = require('../../config/tapisSettings');

var moment = require('moment-timezone');
var request = require('request');

var webhookIO = {};
module.exports = webhookIO;

webhookIO.postToSlack = function(eventMessage) {

    if (!process.env.SLACK_WEBHOOK_URL) return;

    request({
        url: process.env.SLACK_WEBHOOK_URL,
        json: {
            text: 'Event: ' + eventMessage + '\n'
                  + 'Environment: VDJServer ADC API\n'
                  + 'Timestamp: ' + moment().tz('America/Chicago').format()
                  ,
            username: 'VDJ Telemetry Bot',
        },
        method: 'POST',
    },
    function(requestError, response, body) {
        console.log('Posted slack webhook for message: "' + eventMessage + '"');
    })
    ;
};
