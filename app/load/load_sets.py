#
# Check rearrangement load sets for a repertoire.
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
def countRearrangements(token, config, collection, repertoire_id, load_set):
    headers = {
        "Content-Type":"application/json",
        "Accept": "application/json",
        "Authorization": "Bearer " + token['access_token']
    }

    # delete the index
    query = { "repertoire_id": repertoire_id, "vdjserver_load_set": load_set }
    field = '$repertoire_id'
    avars = { "match": query, "field": field }
    avars = requests.utils.quote(json.dumps(avars))
    url = 'https://' + config['api_server'] + '/meta/v3/' + config['dbname'] + '/' + collection + '/_aggrs/' + 'facets?avars=' + avars
    print(url)
    resp = requests.get(url, headers=headers)

    result = resp.json()
    #print(result)
    if len(result) == 0:
        return 0
    else:
        return result[0]['count']

# main entry
if (__name__=="__main__"):
    parser = argparse.ArgumentParser(description='Count rearrangements for load set for repertoire metadata.')
    parser.add_argument('collection', type=str, help='Rearrangement collection')
    parser.add_argument('repertoire_id', type=str, help='Repertoire identifier')
    parser.add_argument('load_set_start', type=int, help='Load set start')
    parser.add_argument('load_set_end', type=int, help='Load set end')
    args = parser.parse_args()

    if args:
        config = getConfig()
        token = getToken(config)

        for load_set in range(args.load_set_start,args.load_set_end):
            total = 0
            result = countRearrangements(token, config, args.collection, args.repertoire_id, load_set)
            print('Repertoire:', args.repertoire_id, 'load set:', load_set, 'has count:', result)
            if result > 0:
                total += result
