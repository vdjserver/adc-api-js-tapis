'use strict';

var app = require('express')();
var path = require('path');
var fs = require('fs');
var yaml = require('js-yaml');
var Runner = require('swagger-node-runner');

// Server environment config
var config = require('./config/config');
var airr = require('./api/helpers/airr-schema');

module.exports = app; // for testing

// Swagger middleware config
var swaggerConfig = {
  appRoot: __dirname, // required config
  configDir: 'config'
};

// Verify we can login with guest account
var GuestAccount = require('./api/models/guestAccount');
GuestAccount.getToken()
    .then(function(guestToken) {
	console.log('VDJServer ADC API INFO: Successfully acquired guest token.');

	// Load swagger API
	//console.log(config.appRoot);
	var swaggerFile = path.resolve(swaggerConfig.appRoot, 'api/swagger/adc-api.yaml');
	console.log('Using ADC API file: ' + swaggerFile);
	swaggerConfig.swagger = yaml.safeLoad(fs.readFileSync(swaggerFile, 'utf8'));
	//swaggerConfig.swagger['basePath'] = '/airr' + swaggerConfig.swagger['basePath']
	//swaggerConfig.swagger['host'] = 'vdjserver.org'

	// Load AIRR Schema
	return airr.schema();
    })
    .then(function(schema) {
	// store the schema as a global so all code can see it
	console.log('Loaded AIRR Schema.');
	global.airr = schema;

	Runner.create(swaggerConfig, function(err, runner) {
	    if (err) { throw err; }

	    // install middleware
	    var swaggerExpress = runner.expressMiddleware();
	    swaggerExpress.register(app);

	    var port = config.port || 8080;
	    app.listen(port);

	    console.log('VDJServer ADC API listening on port:' + port);
	});
    })
    .fail(function(error) {
	console.error('VDJServer ADC API ERROR: Service could not be start.\n.' + error);
	//webhookIO.postToSlack('VDJServer ADC API ERROR: Unable to login with guest account.\nSystem may need to be restarted.\n' + error);
	//process.exit(1);
    });
