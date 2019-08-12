'use strict';

var AgaveToken = function(attributes) {
    this.token_type    = attributes.token_type || '';
    this.expires_in    = attributes.expires_in || '';
    this.refresh_token = attributes.refresh_token || '';
    this.access_token  = attributes.access_token  || '';
};

module.exports = AgaveToken;
