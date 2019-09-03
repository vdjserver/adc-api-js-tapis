#
# Import data into AIRR mongo repository for a public project. This is for
# the repertoire metadata. This assumes you are running in the docker container.
#
# This is a partial hack because currently VDJServer does not produce AIRR TSV
# files with repertoire_id's assigned to the rearrangements.
#
# This script assumes that all the rearrangements for a single repertoire are
# in a single file.
#
# TEST: using "rerrangements" instead of "rearrangment" for the collection
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

# Delete all rearrangements for the repertoire_id
def deleteRepertoire(token, config, repertoire_id):
    headers = {
        "Content-Type":"application/json",
        "Accept": "application/json",
        "Authorization": "Bearer " + token['access_token']
    }

    # delete rearrangements for given repertoire_id
    url = 'https://' + config['api_server'] + '/meta/v3/v1public/rearrangements/*?filter=' + requests.utils.quote('{"repertoire_id":"' + repertoire_id + '"}')
    print(url)
    resp = requests.delete(url, headers=headers)
    print(resp.json())

# Insert the rearrangements for a repertoire
def insertRearrangement(token, config, records):
    headers = {
        "Content-Type":"application/json",
        "Accept": "application/json",
        "Authorization": "Bearer " + token['access_token']
    }

    # insert the rearrangement
    url = 'https://' + config['api_server'] + '/meta/v3/v1public/rearrangements/'
    #data = [ record ]
    resp = requests.post(url, json=records, headers=headers)
    data = resp.json()
    if data.get('inserted'):
        print("Inserted records: " + str(data['inserted']))
    #print(resp.json())

    # pull out mongo id and make it the rearrangement_id
    #newdoc = resp.json()
    #href = newdoc['_links']['rh:newdoc'][0]['href']
    #rearrangement_id = href.split('/')[-1]
    #print(rearrangement_id)
    #data = {"_id":rearrangement_id,"rearrangement_id":rearrangement_id}
    #url = 'https://' + config['api_server'] + '/meta/v3/v1public/rearrangements/' + rearrangement_id
    #print(url)
    #resp = requests.patch(url, json=data, headers=headers)
    #print(resp.status_code)
    #print(resp.text)
    #print(resp.json())
    

# main entry
if (__name__=="__main__"):
    parser = argparse.ArgumentParser(description='Load AIRR rearrangements into VDJServer data repository.')
    parser.add_argument('repertoire_id', type=str, help='Repertoire identifier for the rearrangements')
    parser.add_argument('rearrangement_file', type=str, help='Rearrangement AIRR TSV file name')
    args = parser.parse_args()

    if args:
        reader = airr.read_rearrangement(args.rearrangement_file)

        config = getConfig()
        print(config)
        token = getToken(config)
        print(token['access_token'])

        deleteRepertoire(token, config, args.repertoire_id)

        total = 0
        cnt = 0
        records = []
        for r in reader:
            if r.get('repertoire_id') is None:
                r['repertoire_id'] = args.repertoire_id
            if len(r['repertoire_id']) == 0:
                r['repertoire_id'] = args.repertoire_id
            records.append(r)
            cnt += 1
            total += 1
            if cnt == 1000:
                insertRearrangement(token, config, records)
                cnt = 0
                records = []
        if cnt != 0:
            insertRearrangement(token, config, records)
        print("Total records inserted: " + str(total))
