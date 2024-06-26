#
# Import data into AIRR mongo repository for a public project. This is for
# the repertoire metadata. This assumes you are running in the docker container.
#
# This is a partial hack because currently VDJServer does not produce AIRR TSV
# files with repertoire_id's and data_processing_id's assigned to the rearrangements.
#
# This script assumes that all the rearrangements for a single repertoire are
# in a single file. It also assumes that data_processing_files is
# set in the primary data_processing.
#

import json
from dotenv import load_dotenv
import os
import sys
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

# Delete all rearrangements from a load set for the repertoire_id
def deleteLoadSet(token, config, repertoire_id, load_set):
    headers = {
        "Content-Type":"application/json",
        "Accept": "application/json",
        "Authorization": "Bearer " + token['access_token']
    }

    # delete rearrangements for given repertoire_id
    if load_set == 0:
        url = 'https://' + config['api_server'] + '/meta/v3/' + config['dbname'] + '/rearrangement/*?filter=' + requests.utils.quote('{"repertoire_id":"' + repertoire_id + '"}')
    else:
        url = 'https://' + config['api_server'] + '/meta/v3/' + config['dbname'] + '/rearrangement/*?filter=' + requests.utils.quote('{"repertoire_id":"' + repertoire_id + '","vdjserver_load_set":' + str(load_set) + '}')
    print(url)
    resp = requests.delete(url, headers=headers)
    print(resp.json())

# Insert the rearrangements for a repertoire
def insertRearrangement(token, config, records):
    # get a token each time, in case it expired
    token = getToken(config)

    headers = {
        "Content-Type":"application/json",
        "Accept": "application/json",
        "Authorization": "Bearer " + token['access_token']
    }

    # insert the rearrangement
    url = 'https://' + config['api_server'] + '/meta/v3/' + config['dbname'] + '/rearrangement/'
    #data = [ record ]
    resp = requests.post(url, json=records, headers=headers)
    data = resp.json()
    if data.get('inserted'):
        print("Inserted records: " + str(data['inserted']))
    else:
        print(resp.json())

    # pull out mongo id and make it the rearrangement_id
    #newdoc = resp.json()
    #href = newdoc['_links']['rh:newdoc'][0]['href']
    #rearrangement_id = href.split('/')[-1]
    #print(rearrangement_id)
    #data = {"_id":rearrangement_id,"rearrangement_id":rearrangement_id}
    #url = 'https://' + config['api_server'] + '/meta/v3/' + config['dbname'] + '/rearrangement/' + rearrangement_id
    #print(url)
    #resp = requests.patch(url, json=data, headers=headers)
    #print(resp.status_code)
    #print(resp.text)
    #print(resp.json())
    

def getAllSubstrings(str, size=4):
    result = []
    for i in range(0, len(str)):
        for j in range(len(str), i+size-1, -1):
            result.append(str[i:j])
    return result

def parseGene(str):
    result = { "gene": None, "subgroup": None }
    aidx = str.find('*')
    if aidx < 0:
        return None
    result['gene'] = str[0:aidx]

    didx = result['gene'].find('-')
    if didx >= 0:
        result['subgroup'] = result['gene'][0:didx]
    return result

def changeGeneCall(name, name_gene, name_subgroup, obj):
    fields = obj[name].split(',')
    if len(fields) > 1:
        obj[name] = fields
        genes = []
        subgroups = []
        for i in range(0, len(fields)):
            c = fields[i]
            result = parseGene(c);
            if result == None:
                genes.append(None)
                subgroups.append(None)
            else:
                genes.append(result['gene'])
                subgroups.append(result['subgroup'])
            obj[name_gene] = genes;
            obj[name_subgroup] = subgroups;
    else:
        result = parseGene(obj[name])
        if result:
            obj[name_gene] = result['gene']
            if result['subgroup']:
                obj[name_subgroup] = result['subgroup']

# main entry
if (__name__=="__main__"):
    parser = argparse.ArgumentParser(description='Load AIRR rearrangements into VDJServer data repository.')
    parser.add_argument('load_set_start', type=int, help='Starting load set')
    parser.add_argument('repertoire_file', type=str, help='AIRR repertoire metadata file name')
    parser.add_argument('file_prefix', type=str, help='Directory prefix to find the rearrangements files')
    args = parser.parse_args()

    load_set_size = 1000

    if args:
        data = airr.load_repertoire(args.repertoire_file)
        reps = data['Repertoire']

        load_set_start = args.load_set_start
        for rep in reps:
            config = getConfig()
            token = getToken(config)
            print(token['access_token'])

            print('Loading AIRR rearrangements for repertoire: ' + rep['repertoire_id'])
            print('Starting load set: ' + str(load_set_start))
            deleteLoadSet(token, config, rep['repertoire_id'], load_set_start)
            load_set = 0

            primary_dp = None
            for dp in rep['data_processing']:
                if dp.get('primary_annotation'):
                    primary_dp = dp
            if not primary_dp:
                print('ERROR: Repertoire missing primary data processing: ' + rep['repertoire_id'])
                sys.exit(1)

            files = primary_dp['data_processing_files']
            for f in files:
                if os.path.isfile(args.file_prefix + '/' + f):
                    print('AIRR rearrangement file: ' + args.file_prefix + '/' + f)
                    reader = airr.read_rearrangement(args.file_prefix + '/' + f)
                elif os.path.isfile(args.file_prefix + '/' + primary_dp['data_processing_id'] + '/' + f):
                    print('AIRR rearrangement file: ' + args.file_prefix + '/' + primary_dp['data_processing_id'] + '/' + f)
                    reader = airr.read_rearrangement(args.file_prefix + '/' + primary_dp['data_processing_id'] + '/' + f)
                else:
                    print('ERROR: cannot find file: ' + f)
                    sys.exit(1)

                total = 0
                cnt = 0
                records = []
                for r in reader:
                    if r.get('repertoire_id') is None:
                        r['repertoire_id'] = rep['repertoire_id']
                    if len(r['repertoire_id']) == 0:
                        r['repertoire_id'] = rep['repertoire_id']
                    if r.get('data_processing_id') is None:
                        r['data_processing_id'] = primary_dp['data_processing_id']
                    if len(r['data_processing_id']) == 0:
                        r['data_processing_id'] = primary_dp['data_processing_id']
                    r['vdjserver_load_set'] = load_set
                    
                    r['receptor_id'] = r['sequence_id']
                    del r['sequence_id']

                    changeGeneCall('v_call', 'v_gene', 'v_subgroup', r)
                    changeGeneCall('d_call', 'd_gene', 'd_subgroup', r)
                    changeGeneCall('j_call', 'j_gene', 'j_subgroup', r)

                    if len(r['junction_aa']) > 3:
                        r['vdjserver_junction_substrings'] = getAllSubstrings(r['junction_aa'], 4)

                    records.append(r)
                    cnt += 1
                    total += 1
                    if cnt == load_set_size:
                        if load_set >= load_set_start:
                            print('Inserting load set: ' + str(load_set))
                            insertRearrangement(token, config, records)
                            print('Total records: ' + str(total))
                        else:
                            print('Skipping load set: ' + str(load_set))
                        cnt = 0
                        load_set += 1
                        records = []
                if cnt != 0:
                    if load_set >= load_set_start:
                        print('Inserting load set: ' + str(load_set))
                        insertRearrangement(token, config, records)
                        print('Total records: ' + str(total))
                    else:
                        print('Skipping load set: ' + str(load_set))
                    load_set += 1
                print("Total records inserted: " + str(total))
            load_set_start = 0
