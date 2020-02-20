#
# Delete a repertoire. This is for manual cleanup.
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

# delete a repertoire
def deleteRepertoire(token, config, repertoire_id):
    headers = {
        "Content-Type":"application/json",
        "Accept": "application/json",
        "Authorization": "Bearer " + token['access_token']
    }

    # delete that repertoire_id
    url = 'https://' + config['api_server'] + '/meta/v3/' + config['dbname'] + '/repertoire/*?filter=' + requests.utils.quote('{"repertoire_id":"' + repertoire_id + '"}')
    print(url)
    resp = requests.delete(url, headers=headers)
    print(resp)
    print(resp.json())

# main entry
if (__name__=="__main__"):
    parser = argparse.ArgumentParser(description='Delete AIRR repertoire from repository.')
    parser.add_argument('repertoire_id', type=str, help='Repertoire identifier')
    args = parser.parse_args()

    if args:
        config = getConfig()
        print(config)
        token = getToken(config)
        print(token['access_token'])

        deleteRepertoire(token, config, args.repertoire_id)
