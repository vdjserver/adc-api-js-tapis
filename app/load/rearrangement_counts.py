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
def countRearrangements(token, config, rep):
    headers = {
        "Content-Type":"application/json",
        "Accept": "application/json"
    }
    query = {
        "filters": {
            "op":"=",
            "content": {
                "field":"repertoire_id",
                "value":rep['repertoire_id']
            }
        },
        "facets":"repertoire_id"
    }

    # delete that repertoire_id
    url = 'https://vdjserver.org/airr/v1/rearrangement'
    data = query
    resp = requests.post(url, json=data, headers=headers)
    result = resp.json()
    print(result['Facet'])
    return result

# main entry
if (__name__=="__main__"):
    parser = argparse.ArgumentParser(description='Count rearrangements for repertoire metadata.')
    parser.add_argument('repertoire_file', type=str, help='Repertoire metadata file name')
    args = parser.parse_args()

    if args:
        data = airr.load_repertoire(args.repertoire_file)

        config = getConfig()
        token = getToken(config)

        reps = data['Repertoire']

        total = 0
        for r in reps:
            if r.get('repertoire_id') is None:
                print('Repertoire is missing repertoire_id')
                sys.exit(0)
            if len(r['repertoire_id']) == 0:
                print('Repertoire is missing repertoire_id')
                sys.exit(0)
            result = countRearrangements(token, config, r)
            total += int(result['Facet'][0]['count'])
        print("Total rearrangements: " + str(total))
