#
# Create an index for a collection.
#
# This script assumes you are running in a docker container.
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

# Does a PUT of an index definition to the collection
# An index must be deleted before it can be updated
def insertIndex(token, config, collection, name, index):
    headers = {
        "Content-Type":"application/json",
        "Accept": "application/json",
        "Authorization": "Bearer " + token['access_token']
    }

    # delete the index
    url = 'https://' + config['api_server'] + '/meta/v3/v1airr/' + collection + '/_indexes/' + name
    resp = requests.delete(url, headers=headers)
    print(resp.status_code)
    print(resp.text)

    # put the index
    url = 'https://' + config['api_server'] + '/meta/v3/v1airr/' + collection + '/_indexes/' + name
    resp = requests.put(url, json=index, headers=headers)
    if resp.status_code != 200:
        print('Got unexpected status code: ' + str(resp.status_code))
    else:
        print('Successful PUT of idnex for ' + collection)

def showIndexes(token, config, collection):
    headers = {
        "Content-Type":"application/json",
        "Accept": "application/json",
        "Authorization": "Bearer " + token['access_token']
    }

    # show collection info
    url = 'https://' + config['api_server'] + '/meta/v3/v1airr/' + collection + '/_indexes'
    resp = requests.get(url, headers=headers)
    print(json.dumps(resp.json(), indent=2))

# main entry
if (__name__=="__main__"):
    parser = argparse.ArgumentParser(description='Load index for collection.')
    parser.add_argument('collection', type=str, help='collection')
    parser.add_argument('index_name', type=str, help='index name')
    parser.add_argument('index_script', type=str, help='index definition')
    args = parser.parse_args()

    if args:
        config = getConfig()
        token = getToken(config)

        index = json.load(open(args.index_script,'r'))
        insertIndex(token, config, args.collection, args.index_name, index)

        showIndexes(token, config, args.collection)
