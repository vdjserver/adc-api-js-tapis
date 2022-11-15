#
# Fix data curation errors with the wrong species ontology.
#
# 1. subject species has NCBITaxon instead of NCBITAXON
# 2. subject species has 9096 instead of 9606 for human
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
import urllib.parse

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

def querySubjects(token, config, limit, offset):
    headers = {
        "Content-Type":"application/json",
        "Accept": "application/json",
        "Authorization": "Bearer " + token['access_token']
    }
    url = 'https://' + config['api_server'] + '/meta/v2/data?q=' + urllib.parse.quote('{"name":"subject"}') + '&limit=' + str(limit) + '&offset=' + str(offset)
    resp = requests.get(url, headers=headers)
    #print(json.dumps(resp.json(), indent=2))
    result = resp.json()['result']
    print('INFO: Query returned', len(result), 'subject records.')
    return resp.json()['result']

# Load all of the subject metadata records
def getSubjects(token, config):
    offset = 0
    limit = 100
    query_list = querySubjects(token, config, limit, offset)
    subjects = []
    subjects += query_list
    done = False
    while not done:
        if len(query_list) > 0:
            offset = offset + limit
            query_list = querySubjects(token, config, limit, offset)
            subjects += query_list
        else:
            done = True
    print('INFO:', len(subjects), 'total subject records.')
    return subjects

def updateSubject(token, config, subject):
    headers = {
        "Content-Type":"application/json",
        "Accept": "application/json",
        "Authorization": "Bearer " + token['access_token']
    }
    url = 'https://' + config['api_server'] + '/meta/v2/data/' + subject['uuid']
    resp = requests.post(url, data=subject, headers=headers)
    print(json.dumps(resp.json(), indent=2))
    print('INFO: subject uuid', subject['uuid'], 'updated.')
    return

# Check and perform the conversion
def checkConversion(subject):
    result = { 'check': False, 'object': None }
    # error checks
    if subject.get('uuid') is None:
        return result
    if subject.get('value') is None:
        return result
    if subject['value'].get('species') is None:
        return result
    if type(subject['value']['species']) is not dict:
        return result
    if subject['value']['species'].get('id') is None:
        return result

    # conversion
    if subject['value']['species']['id'] == 'NCBITaxon:9096':
        print('INFO: subject uuid', subject['uuid'], 'converting (', subject['value']['species']['id'], ') to (NCBITAXON:9606)')
        subject['value']['species']['id'] = 'NCBITAXON:9606'
        result['check'] = True
        result['object'] = subject
    if subject['value']['species']['id'] == 'NCBITAXON:9096':
        print('INFO: subject uuid', subject['uuid'], 'converting (', subject['value']['species']['id'], ') to (NCBITAXON:9606)')
        subject['value']['species']['id'] = 'NCBITAXON:9606'
        result['check'] = True
        result['object'] = subject
    if subject['value']['species']['id'] == 'NCBITaxon:9606':
        print('INFO: subject uuid', subject['uuid'], 'converting (', subject['value']['species']['id'], ') to (NCBITAXON:9606)')
        subject['value']['species']['id'] = 'NCBITAXON:9606'
        result['check'] = True
        result['object'] = subject
    if subject['value']['species']['id'] == 'NCBITaxon:10090':
        print('INFO: subject uuid', subject['uuid'], 'converting (', subject['value']['species']['id'], ') to (NCBITAXON:10090)')
        subject['value']['species']['id'] = 'NCBITAXON:10090'
        result['check'] = True
        result['object'] = subject

    return result

# main entry
if (__name__=="__main__"):
    parser = argparse.ArgumentParser(description='Fix subject species ontology.')
    parser.add_argument('-c', '--convert', help='Perform conversion operations', action="store_true", required=False)
    args = parser.parse_args()

    if args:
        if args.convert:
            print('INFO: Conversion enabled, modifications will be saved.')
        else:
            print('INFO: Conversion not enabled, will only describe modifications.')

        config = getConfig()
        token = getToken(config)

        subjects = getSubjects(token, config)
        cnt = 0
        for subject in subjects:
            #print(subject)
            result = checkConversion(subject)
            if result['check']:
                cnt += 1
                if args.convert:
                    print('INFO: Updating subject record.')
                break
        print('INFO:', cnt, 'total subjects converted.')