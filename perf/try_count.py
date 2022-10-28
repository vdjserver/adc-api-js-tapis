#
# Import data into AIRR mongo repository for a public project. This is for
# the repertoire metadata. This assumes you are running in the docker container.
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

# Insert a repertoire by first deleting any repertoire with the same id
# then inserting the new repertoire
def countRepertoire(token, config, rep):
    headers = {
        "Content-Type":"application/json",
        "Accept": "application/json",
        "Authorization": "Bearer " + token['access_token']
    }

    # count for repertoire_id
    #url = 'https://' + config['api_server'] + '/meta/v3/' + config['dbname'] + '/rearrangement_0/_size?filter=' + requests.utils.quote('{"repertoire_id":"' + rep + '"}')
    url = 'https://' + config['api_server'] + '/meta/v3/' + config['dbname'] + '/rearrangement_0/_size?filter=' + requests.utils.quote('{"junction_aa_length": 13, "repertoire_id":"' + rep + '"}')
    #url = 'https://' + config['api_server'] + '/meta/v3/' + config['dbname'] + '/rearrangement_0/_size?filter=' + requests.utils.quote('{"junction_aa_length": 13}')
    print(url)
    resp = requests.get(url, headers=headers)
    print(resp)
    print(resp.json())

# main entry
if (__name__=="__main__"):
    parser = argparse.ArgumentParser(description='Load AIRR repertoire metadata into repository.')
    #parser.add_argument('repertoire_file', type=str, help='Repertoire metadata file name')
    args = parser.parse_args()

    config = getConfig()
    print(config)
    token = getToken(config)
    print(token['access_token'])

    #countRepertoire(token, config, '4250138355187716586-242ac113-0001-012')
    countRepertoire(token, config, '7997882631039226346-242ac113-0001-012')
