#
# This script installs the set of aggregations for the API.
# RestHeart requires that aggregations, like the kind used
# to implement facets, need to be pre-defined. This installs
# aggregations on the repertoire and rearrangement collections.
#
# This script assumes you are running a docker container.
#
# The aggregations to be loaded are in the file aggregations.json
#

import json
from dotenv import load_dotenv
import os
import airr
import yaml
import requests
import argparse

# Setup
def getConfig():
    if load_dotenv(dotenv_path='/api-js-tapis/.env'):
        cfg = {}
        cfg['api_server'] = os.getenv('WSO2_HOST')
        cfg['api_key'] = os.getenv('WSO2_CLIENT_KEY')
        cfg['api_secret'] = os.getenv('WSO2_CLIENT_SECRET')
        cfg['username'] = os.getenv('VDJ_SERVICE_ACCOUNT')
        cfg['password'] = os.getenv('VDJ_SERVICE_ACCOUNT_SECRET')
        cfg['dbname'] = os.getenv('MONGODB_DB')
        return cfg
    else:
        print('ERROR: loading config')
        return None

# Fetches a user token based on the supplied auth object
# and returns the auth object with token data on success
def getToken(config):
    data = {
        "grant_type":"password",
        "scope":"PRODUCTION",
        "username":config['username'],
        "password":config['password']
    }
    headers = {
        "Content-Type":"application/x-www-form-urlencoded"
    }

    url = 'https://' + config['api_server'] + '/token'

    resp = requests.post(url, data=data, headers=headers, auth=(config['api_key'], config['api_secret']))
    token = resp.json()
    return token

# Does a PUT of a JSON aggregation to the collection
# This overwrites all existing aggregations
def insertAggregation(token, config, collection, aggregations):
    headers = {
        "Content-Type":"application/json",
        "Accept": "application/json",
        "Authorization": "Bearer " + token['access_token']
    }

    # put the aggregation
    url = 'https://' + config['api_server'] + '/meta/v3/' + config['dbname'] + '/' + collection
    resp = requests.put(url, json=aggregations, headers=headers)
    if resp.status_code != 200:
        print('Got unexpected status code: ' + str(resp.status_code))
    else:
        print('Successful PUT of aggregation for ' + collection)

def showCollections(token, config):
    headers = {
        "Content-Type":"application/json",
        "Accept": "application/json",
        "Authorization": "Bearer " + token['access_token']
    }

    # show collection info
    url = 'https://' + config['api_server'] + '/meta/v3/' + config['dbname'] + '/'
    resp = requests.get(url, headers=headers)
    print(json.dumps(resp.json(), indent=2))

# main entry
if (__name__=="__main__"):
    parser = argparse.ArgumentParser(description='Load aggregations.')
    parser.add_argument('aggr_script', type=str, help='script')
    args = parser.parse_args()

    if args:
        config = getConfig()
        token = getToken(config)

        aggs = json.load(open(args.aggr_script,'r'))
        insertAggregation(token, config, 'repertoire', aggs)
        insertAggregation(token, config, 'rearrangement', aggs)
        insertAggregation(token, config, 'rearrangement_1', aggs)
        showCollections(token, config)
