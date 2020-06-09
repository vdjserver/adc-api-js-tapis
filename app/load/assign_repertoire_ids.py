#
# For old studies, or manually annotated studies which
# do not have repertoire identifiers. Insert each
# repertoire into VDJServer metadata, and get the uuid
# to serve as the repertoire_id
#
# This assumes you are running in the api-js-tapis docker.
#

import json
from dotenv import load_dotenv
import os
import airr
import yaml
import requests
import argparse

# Setup
# This is to access the Meta/V2 API
def getConfig():
    if load_dotenv(dotenv_path='/api-js-tapis/.env'):
        cfg = {}
        cfg['api_server'] = os.getenv('WSO2_VDJ_HOST')
        cfg['api_key'] = os.getenv('WSO2_VDJ_CLIENT_KEY')
        cfg['api_secret'] = os.getenv('WSO2_VDJ_CLIENT_SECRET')
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

# Insert a repertoire, assign its repertoire_id, then update it
def insertRepertoire(token, config, rep):
    headers = {
        "Content-Type":"application/json",
        "Accept": "application/json",
        "Authorization": "Bearer " + token['access_token']
    }

    # insert the repertoire
    url = 'https://' + config['api_server'] + '/meta/v2/data'
    data = { 'name': 'repertoire', 'value': rep, 'associationIds': [ rep['study']['vdjserver_uuid'] ] }
    resp = requests.post(url, json=data, headers=headers)
    #print(resp.status_code)
    if resp.status_code != 201:
        print('ERROR: Expected 201 status code, got ' + resp.status_code)
        print(resp.text)
    #print(resp.text)
    #print(resp.json())
    ret = resp.json()
    print('New metadata inserted with uuid: ' + ret['result']['uuid'])

    rep['repertoire_id'] = ret['result']['uuid']

# Update a repertoire
def updateRepertoire(token, config, rep):
    headers = {
        "Content-Type":"application/json",
        "Accept": "application/json",
        "Authorization": "Bearer " + token['access_token']
    }

    # update the repertoire
    print('Updating metadata with uuid: ' + rep['repertoire_id'])
    url = 'https://' + config['api_server'] + '/meta/v2/data/' + rep['repertoire_id']
    data = { 'name': 'repertoire', 'value': rep, 'associationIds': [ rep['study']['vdjserver_uuid'] ] }
    resp = requests.post(url, json=data, headers=headers)
    #print(resp.status_code)
    if resp.status_code != 200:
        print('ERROR: Expected 200 status code, got ' + resp.status_code)
        print(resp.text)

# main entry
if (__name__=="__main__"):
    parser = argparse.ArgumentParser(description='Assign repertoire identifiers for AIRR repertoire metadata.')
    parser.add_argument('repertoire_file', type=str, help='Repertoire metadata file name')
    args = parser.parse_args()

    if args:
        data = airr.load_repertoire(args.repertoire_file)

        config = getConfig()
        token = getToken(config)
        print(token['access_token'])

        reps = data['Repertoire']

        for r in reps:
            if r.get('repertoire_id') is None or len(r.get('repertoire_id')) == 0:
                if r['study'].get('vdjserver_uuid') is None:
                    print('Repertoire is missing study.vdjserver_uuid field to link to project')
                    print('Skipping...')
                    continue
                print('Repertoire is missing repertoire_id, inserting into metadata')
                insertRepertoire(token, config, r)
                updateRepertoire(token, config, r)
            else:
                print('Repertoire has repertoire_id, updating metadata')
                updateRepertoire(token, config, r)

        # write out the repertoires with their ids
        fname = args.repertoire_file.replace('.yaml', '.json')
        data = airr.write_repertoire(fname, reps)
