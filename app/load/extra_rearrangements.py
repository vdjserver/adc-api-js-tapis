#
# Check rearrangement load sets for a repertoire.
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

def getRepertoires(token, config, collection):
    headers = {
        "Content-Type":"application/json",
        "Accept": "application/json"
    }
    query = { "fields": ["repertoire_id"] }
    url = 'https://vdjserver.org/airr/v1/repertoire'
    data = query
    #print(data)
    resp = requests.post(url, json=data, headers=headers)
    result = resp.json()
    print(result)
    return result

# count number of rearrangements for repertoire
def extraRearrangements(token, config, repertoires):
    headers = {
        "Content-Type":"application/json",
        "Accept": "application/json"
    }
    query = {
        "filters": {
            "op":"exclude",
            "content": {
                "field":"repertoire_id",
                "value": [repertoires]
                }
            }
        }

    # perform facets query
    url = 'https://vdjserver.org/airr/v1/rearrangement'
    data = query
    #print(data)
    resp = requests.post(url, json=data, headers=headers)
    result = resp.json()
    print(result)
    return result

# main entry
if (__name__=="__main__"):
    parser = argparse.ArgumentParser(description='Extra rearrangements.')
    parser.add_argument('collection', type=str, help='Collection suffix')
    args = parser.parse_args()

    if args:
        config = getConfig()
        token = getToken(config)

        result = getRepertoires(token, config, args.collection)
        print(len(result['Repertoire']))
        reps = [ v['repertoire_id'] for v in result['Repertoire'] ]
        print(reps)
        print(len(reps))
        result = extraRearrangements(token, config, reps)
