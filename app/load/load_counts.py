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
def countRearrangements(token, config, collection, rep):
    headers = {
        "Content-Type":"application/json",
        "Accept": "application/json",
        "Authorization": "Bearer " + token['access_token']
    }

    # delete the index
    query = { "repertoire_id": rep['repertoire_id'] }
    field = '$repertoire_id'
    avars = { "match": query, "field": field }
    avars = requests.utils.quote(json.dumps(avars))
    url = 'https://' + config['api_server'] + '/meta/v3/' + config['dbname'] + '/' + collection + '/_aggrs/' + 'facets?avars=' + avars
    #print(url)
    resp = requests.get(url, headers=headers)

    result = resp.json()
    #print(result)
    if len(result) == 0:
        return 0
    else:
        return result[0]['count']

# count number of rearrangements for repertoire
def countRearrangementsInFiles(token, config, rep, file_prefix):
    primary_dp = None
    for dp in rep['data_processing']:
        if dp.get('primary_annotation'):
            primary_dp = dp
        if not primary_dp:
            print('ERROR: Repertoire missing primary data processing: ' + rep['repertoire_id'])
            sys.exit(1)

    total = 0
    files = primary_dp['data_processing_files']
    for f in files:
        f = f.replace('.gz','')
        if os.path.isfile(file_prefix + '/' + f):
            print('AIRR rearrangement file: ' + file_prefix + '/' + f)
            reader = open(file_prefix + '/' + f, 'r')
        elif os.path.isfile(file_prefix + '/' + primary_dp['data_processing_id'] + '/' + f):
            print('AIRR rearrangement file: ' + file_prefix + '/' + primary_dp['data_processing_id'] + '/' + f)
            reader = open(file_prefix + '/' + primary_dp['data_processing_id'] + '/' + f, 'r')
        else:
            print('ERROR: cannot find file: ' + f)
            sys.exit(1)

        # count lines, subtract header
        cnt = 0
        records = []
        for line in reader:
            cnt += 1
        if cnt > 0: cnt -= 1
        total += cnt
        print('File count: ' + str(cnt))
    print('Total count: ' + str(total))
    return total

# main entry
if (__name__=="__main__"):
    parser = argparse.ArgumentParser(description='Count rearrangements for repertoire metadata.')
    parser.add_argument('collection', type=str, help='Rearrangement collection')
    parser.add_argument('repertoire_file', type=str, help='Repertoire metadata file name')
    parser.add_argument('--file_prefix', type=str, help='Directory prefix to find the rearrangements files')
    args = parser.parse_args()

    if args:
        data = airr.load_repertoire(args.repertoire_file)

        config = getConfig()
        token = getToken(config)
        #print(token)

        reps = data['Repertoire']

        total = 0
        for r in reps:
            if r.get('repertoire_id') is None:
                print('Repertoire is missing repertoire_id')
                sys.exit(0)
            if len(r['repertoire_id']) == 0:
                print('Repertoire is missing repertoire_id')
                sys.exit(0)
            result = countRearrangements(token, config, args.collection, r)
            print('Repertoire', r['repertoire_id'], 'has rearrangement count:', result)
            total += result
            if args.file_prefix:
                cnt = countRearrangementsInFiles(token, config, r, args.file_prefix)
                if cnt != result:
                    print('ERROR: database count != file count')
        print("Total rearrangements: " + str(total))
