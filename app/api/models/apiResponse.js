
'use strict';

var ApiResponse = {};

ApiResponse.schema = function() {
    this.message = '';
    this.messageCode = '';
    this.result  = '';
    this.status  = '';
};

ApiResponse.schema.prototype.setSuccess = function() {
    this.message = '';
    this.messageCode = '';
    this.status  = 'success';
};

ApiResponse.schema.prototype.setError = function() {
    this.message = '';
    this.messageCode = '';
    this.status  = 'error';
};

module.exports = ApiResponse.schema;
