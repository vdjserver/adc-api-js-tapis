#
# Show some info about the database and collections.
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

# show collections
def showCollections(token, config):
    headers = {
        "Content-Type":"application/json",
        "Accept": "application/json",
        "Authorization": "Bearer " + token['access_token']
    }

    url = 'https://' + config['api_server'] + '/meta/v3/v1airr/'
    resp = requests.get(url, headers=headers)
    print(json.dumps(resp.json(), indent=2))

# show indexes
def showIndexes(token, config, collection):
    headers = {
        "Content-Type":"application/json",
        "Accept": "application/json",
        "Authorization": "Bearer " + token['access_token']
    }

    url = 'https://' + config['api_server'] + '/meta/v3/v1airr/' + collection + '/_indexes'
    resp = requests.get(url, headers=headers)
    print(json.dumps(resp.json(), indent=2))

# main entry
if (__name__=="__main__"):
    parser = argparse.ArgumentParser(description='Show database info.')
    args = parser.parse_args()

    if args:
        config = getConfig()
        token = getToken(config)

        print('')
        print('**** Collections')
        print('')
        showCollections(token, config)

        print('')
        print('**** Rearrangement Indexes')
        print('')
        showIndexes(token, config, 'rearrangement')
