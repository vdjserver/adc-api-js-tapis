#
# Count rearrangements for list of repertoires.
# Performs count against the specified collection.
# This assumes you are running in the docker container.
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

# count number of rearrangements for repertoire
def testAggregation(token, config, collection):
    headers = {
        "Content-Type":"application/json",
        "Accept": "application/json",
        "Authorization": "Bearer " + token['access_token']
    }

    # aggregation
    #query = { }
    #query = {"repertoire_id": { "$in":["9135128879355662826-242ac113-0001-012","9152222849193742826-242ac113-0001-012"]}}
#    query = { "$and":[{"vdjserver_junction_suffixes": {"$regex": "^QYTQFPLTF"}},
#        {"repertoire_id": { "$in":["9135128879355662826-242ac113-0001-012","9152222849193742826-242ac113-0001-012"]}}]}
    query = { "$and":[{"v_call": "TRBV5-1*01"},
        {"repertoire_id": { "$in":["1569712823953387030-242ac113-0001-012","1649665812109398506-242ac113-0001-012","2228063148026434026-242ac113-0001-012","2184360989479464470-242ac113-0001-012","2469933364990504470-242ac113-0001-012","2903220179850751510-242ac113-0001-012","3053506246790681066-242ac113-0001-012","3423745003395158506-242ac113-0001-012","3566285896953696746-242ac113-0001-012","4559838138941444586-242ac113-0001-012"]}}]}
    field = '$repertoire_id'
    avars = { "match": query, "field": field }
    avars = requests.utils.quote(json.dumps(avars))
    url = 'https://' + config['api_server'] + '/meta/v3/' + config['dbname'] + '/' + collection + '/_aggrs/' + 'facets?avars=' + avars
    print(url)
    resp = requests.get(url, headers=headers)

    result = resp.json()
    print(result)

# main entry
if (__name__=="__main__"):
    parser = argparse.ArgumentParser(description='Count rearrangements for repertoire metadata.')
    parser.add_argument('collection', type=str, help='Rearrangement collection')
    args = parser.parse_args()

    if args:
        config = getConfig()
        token = getToken(config)
        #print(token)

        testAggregation(token, config, args.collection)
