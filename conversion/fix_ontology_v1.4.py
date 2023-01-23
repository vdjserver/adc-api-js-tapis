#
# Some fixes to AIRR v1.4 conversion
#
# This script assumes you are running in a docker container, check README.
#

import json
from dotenv import load_dotenv
import os
import airr
import yaml
import requests
import argparse
import urllib.parse
from datetime import datetime
import time

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

# update metadata record
def updateRecord(token, config, object):
    if object.get('uuid') is None:
        print('ERROR: object is missing uuid')
        return
    #print(json.dumps(object, indent=2))

    headers = {
        "Content-Type":"application/json",
        "Accept": "application/json",
        "Authorization": "Bearer " + token['access_token']
    }
    url = 'https://' + config['api_server'] + '/meta/v2/data/' + object['uuid']
    resp = requests.post(url, data=json.dumps(object), headers=headers)
    print(json.dumps(resp.json(), indent=2))
    print('INFO: (', object['name'], ') object uuid', object['uuid'], 'updated.')
    return

# Repertoire
def queryObjects(token, config, name, limit, offset, project_uuid):
    headers = {
        "Content-Type":"application/json",
        "Accept": "application/json",
        "Authorization": "Bearer " + token['access_token']
    }
    if project_uuid is None:
        url = 'https://' + config['api_server'] + '/meta/v2/data?q=' + urllib.parse.quote('{"name":"' + name + '"}')
    else:
        url = 'https://' + config['api_server'] + '/meta/v2/data?q=' + urllib.parse.quote('{"name":"' + name + '","associationIds":"' + project_uuid + '"}')
    url += '&limit=' + str(limit) + '&offset=' + str(offset)
    resp = requests.get(url, headers=headers)
    #print(json.dumps(resp.json(), indent=2))
    result = resp.json()
    if result.get('result') is None:
        print('WARNING: Invalid response:', result)
        return None
    result = resp.json()['result']
    print('INFO: Query returned', len(result), name, 'records.')
    return resp.json()['result']

# Load all of the repertoire metadata records
def getObjects(token, config, name, project_uuid=None):
    offset = 0
    limit = 300
    data = []
    done = False
    while not done:
        query_list = queryObjects(token, config, name, limit, offset, project_uuid)
        if query_list is None:
            print('INFO: Retrieved', len(data), name, 'records so far ...')
            print('INFO: Retrying in 30 mins ...')
            time.sleep(300)
            print('INFO: Get new token ...')
            token = getToken(config)
            continue
        # not elif silly rabbit
        if len(query_list) != limit:
            print('INFO:', 'got', len(query_list), 'but requested', limit, 'records.')
            done = True
        if len(query_list) > 0:
            offset = offset + limit
            data += query_list
            print('INFO: last object', data[-1]);
        else:
            done = True
        # throttle requests
        #time.sleep(20);
    print('INFO:', len(data), 'total', name, 'records.')
    return data

# Check and perform the conversion
def convertStudy(study, verbose, quiet):
    # should always pass so check
    result = { 'check': False, 'object': study }

    if verbose:
        if result['object'] is not None:
            print(json.dumps(study, indent=2))

    # error checks
    if study.get('uuid') is None:
        return result
    if study.get('value') is None:
        return result
    # should always pass?
    #airr.schema.AIRRSchema['Study'].validate_object(study['value'])

    # conversion

    if verbose:
        if result['object'] is not None:
            print(json.dumps(study, indent=2))

    # should pass at this point
    if result['check']:
        airr.schema.AIRRSchema['Study'].validate_object(result['object']['value'])

    return result

# Check and perform the conversion
def convertSubject(subject, verbose, quiet):
    # should always pass so check
    result = { 'check': False, 'object': subject }

    if verbose:
        if result['object'] is not None:
            print(json.dumps(subject, indent=2))

    # error checks
    if subject.get('uuid') is None:
        return result
    if subject.get('value') is None:
        return result
    # should always pass?
    #airr.schema.AIRRSchema['Study'].validate_object(subject['value'])

    # conversion
    if subject['value'].get('age_unit') is not None:
        if subject['value']['age_unit'].get('id') == 'UO_0000036':
            subject['value']['age_unit']['id'] = 'UO:0000036'
            print('INFO: subject uuid', subject['uuid'], 'has incorrect age_unit id, setting to', subject['value']['age_unit']['id'])
            result['check'] = True

    if subject['value'].get('diagnosis') is not None:
        if len(subject['value'].get('diagnosis')) > 0:
            if subject['value']['diagnosis'][0].get('disease_diagnosis') is not None:
                if subject['value']['diagnosis'][0]['disease_diagnosis'].get('id') is not None:
                    if subject['value']['diagnosis'][0]['disease_diagnosis']['id'] == 'DOID:526':
                        subject['value']['diagnosis'][0]['disease_diagnosis']['label'] = 'human immunodeficiency virus infectious disease'
                        print('INFO: subject uuid', subject['uuid'], 'fix DOID:526 label, setting to', subject['value']['diagnosis'][0]['disease_diagnosis']['label'])
                        result['check'] = True

#     txt = json.dumps(subject, indent=2)
#     if 'UO_' in txt:
#         print('INFO: subject uuid', subject['uuid'], 'contains UO_')
#         print(txt)
# 
#     if 'UBERON_' in txt:
#         print('INFO: subject uuid', subject['uuid'], 'contains UBERON_')
#         print(txt)
# 
#     if 'CL_' in txt:
#         print('INFO: subject uuid', subject['uuid'], 'contains CL_')
#         print(txt)
# 
#     if 'DOID:526' in txt:
#         print('INFO: subject uuid', subject['uuid'], 'contains DOID:526')
#         print(txt)
# 
#     if 'CL:0000236' in txt:
#         print('INFO: subject uuid', subject['uuid'], 'contains CL:0000236')
#         print(txt)
# 
#     if 'CL:0000844' in txt:
#         print('INFO: subject uuid', subject['uuid'], 'contains CL:0000844')
#         print(txt)
# 
#     if 'UBERON:0013756' in txt:
#         print('INFO: subject uuid', subject['uuid'], 'contains UBERON:0013756')
#         print(txt)

    if verbose:
        if result['object'] is not None:
            print(json.dumps(subject, indent=2))

    # should pass at this point
    if result['check']:
        airr.schema.AIRRSchema['Subject'].validate_object(result['object']['value'])

    return result

# Check and perform the conversion
def convertSample(sample, verbose, quiet):
    result = { 'check': False, 'object': sample }

    # error checks
    if sample.get('uuid') is None:
        return result
    if sample.get('value') is None:
        return result
    # should always pass, in theory
    #airr.schema.AIRRSchema['SampleProcessing'].validate_object(study['value'])

    # conversion
    if sample['value'].get('tissue') is not None:
        if sample['value']['tissue'].get('label') == 'peripheral blood':
            sample['value']['tissue']['label'] = 'venous blood'
            print('INFO: sample uuid', sample['uuid'], 'fix label for UBERON:0013756, setting to', sample['value']['tissue']['label'])
            result['check'] = True

    if sample['value'].get('tissue') is not None:
        if sample['value']['tissue'].get('id') == 'UBERON_0013756':
            sample['value']['tissue']['id'] = 'UBERON:0013756'
            print('INFO: sample uuid', sample['uuid'], 'fix tissue id, setting to', sample['value']['tissue']['id'])
            result['check'] = True

    if sample['value'].get('cell_subset') is not None:
        if sample['value']['cell_subset'].get('id') is not None:
            if 'CL_' in sample['value']['cell_subset'].get('id'):
                fields = sample['value']['cell_subset']['id'].split('_')
                sample['value']['cell_subset']['id'] = 'CL:' + fields[1]
                print('INFO: sample uuid', sample['uuid'], 'fix cell_subset id, setting to', sample['value']['cell_subset']['id'])
                result['check'] = True

    if sample['value'].get('cell_subset') is not None:
        if sample['value']['cell_subset'].get('label') == 'B Cell':
            sample['value']['cell_subset']['label'] = 'B cell'
            print('INFO: sample uuid', sample['uuid'], 'fix cell_subset label, setting to', sample['value']['cell_subset']['label'])
            result['check'] = True

    if sample['value'].get('cell_subset') is not None:
        if sample['value']['cell_subset'].get('label') == 'germinal center B Cell':
            sample['value']['cell_subset']['label'] = 'germinal center B cell'
            print('INFO: sample uuid', sample['uuid'], 'fix cell_subset label, setting to', sample['value']['cell_subset']['label'])
            result['check'] = True

    txt = json.dumps(sample, indent=2)
    if 'UO_' in txt:
        print('INFO: sample uuid', sample['uuid'], 'contains UO_')
        print(txt)

    if 'UBERON_' in txt:
        print('INFO: sample uuid', sample['uuid'], 'contains UBERON_')
        print(txt)

    if 'CL_' in txt:
        print('INFO: sample uuid', sample['uuid'], 'contains CL_')
        print(txt)

#     if 'DOID:526' in txt:
#         print('INFO: sample uuid', sample['uuid'], 'contains DOID:526')
#         print(txt)
# 
#     if 'CL:0000236' in txt:
#         print('INFO: sample uuid', sample['uuid'], 'contains CL:0000236')
#         print(txt)
# 
#     if 'CL:0000844' in txt:
#         print('INFO: sample uuid', sample['uuid'], 'contains CL:0000844')
#         print(txt)
# 
#     if 'UBERON:0013756' in txt:
#         print('INFO: sample uuid', sample['uuid'], 'contains UBERON:0013756')
#         print(txt)

    # should pass at this point
    if result['check']:
        airr.schema.AIRRSchema['SampleProcessing'].validate_object(result['object']['value'])

    if verbose:
        if result['object'] is not None:
            print(json.dumps(sample, indent=2))

    return result

# main entry
if (__name__=="__main__"):
    parser = argparse.ArgumentParser(description='One-time in-place database conversion from AIRR Schema v1.3 to v1.4.')
    parser.add_argument('-c', '--convert', help='Perform conversion operations', action="store_true", required=False)
    parser.add_argument('-v', '--verbose', help='Increase conversion verbosity', action="store_true", required=False)
    parser.add_argument('-q', '--quiet', help='Decrease conversion verbosity', action="store_true", required=False)
    args = parser.parse_args()

    if args:
        if args.convert:
            print('INFO: Conversion enabled, modifications will be saved.')
        else:
            print('INFO: Conversion not enabled, will only describe modifications.')

        config = getConfig()
        token = getToken(config)

        # AIRR VDJServer V2 projects that have been made public
        studies = getObjects(token, config, "public_project")
        skip_cnt = 0
        cnt = 0
        for study in studies:
            #if study['uuid'] != "5558760323211783700-242ac117-0001-012":
            #    continue
            result = convertStudy(study, args.verbose, args.quiet)
            if result['check']:
                cnt += 1
                if args.convert:
                    print('INFO: Updating record.')
                    updateRecord(token, config, result['object'])
            else:
                skip_cnt += 1
                print('INFO: Unchanged record', study['uuid'])

        print('INFO:', cnt, 'total studies converted.')
        print('INFO:', skip_cnt, 'total studies skipped.')
        json.dump(studies, open('/work/public.studies.json','w'), indent=2)
        public_studies = studies

        # AIRR VDJServer V2 projects that are private
        studies = getObjects(token, config, "private_project")
        skip_cnt = 0
        cnt = 0
        for study in studies:
            #if study['uuid'] != "5558760323211783700-242ac117-0001-012":
            #    continue
            result = convertStudy(study, args.verbose, args.quiet)
            if result['check']:
                cnt += 1
                if args.convert:
                    print('INFO: Updating record.')
                    updateRecord(token, config, result['object'])
            else:
                skip_cnt += 1
                print('INFO: Unchanged record', study['uuid'])

        print('INFO:', cnt, 'total studies converted.')
        print('INFO:', skip_cnt, 'total studies skipped.')
        json.dump(studies, open('/work/private.studies.json','w'), indent=2)
        private_studies = studies

        airr_studies = {}
        for study in public_studies:
            airr_studies[study['uuid']] = study['uuid']
        for study in private_studies:
            airr_studies[study['uuid']] = study['uuid']
        #airr_studies['5558760323211783700-242ac117-0001-012'] = '5558760323211783700-242ac117-0001-012'
        print('INFO:', len(airr_studies), 'AIRR studies.')

        subjects = []
        for study in airr_studies:
            print(study)
            token = getToken(config)
            new_subjects = getObjects(token, config, "subject", study)
            subjects.extend(new_subjects)
        json.dump(subjects, open('/work/subjects.json','w'), indent=2)

        output_subjects = []
        skip_subjects = []
        airr_subjects = []
        airr_cnt = 0
        skip_cnt = 0
        cnt = 0
        for subject in subjects:
            # check if AIRR project
            found = False
            if subject.get('associationIds') is not None:
                for aid in subject['associationIds']:
                    if airr_studies.get(aid) is not None:
                        found = True

            if found:
                result = convertSubject(subject, args.verbose, args.quiet)
                airr_cnt += 1
                if result['check']:
                    cnt += 1
                    output_subjects.append(result['object'])
                    airr_subjects.append(result['object'])
                    print('INFO: subject uuid', subject['uuid'], 'associationIds', subject['associationIds'])
                    if args.convert:
                        print('INFO: Updating record.')
                        updateRecord(token, config, result['object'])
                else:
                    skip_cnt += 1
                    skip_subjects.append(subject)
                    skip_subjects.append(subject)
                    print('INFO: Unchanged record', subject['uuid'])
            else:
                skip_cnt += 1
                skip_subjects.append(subject)
                if not args.quiet:
                    print('INFO: Not in AIRR study list', subject['uuid'])

        json.dump(output_subjects, open('/work/subjects.output.json','w'), indent=2)
        json.dump(skip_subjects, open('/work/subjects.skip.json','w'), indent=2)
        json.dump(airr_subjects, open('/work/subjects.airr.json','w'), indent=2)

        print('INFO:', cnt, 'total subjects converted.')
        print('INFO:', skip_cnt, 'total subjects skipped.')
        print('INFO:', airr_cnt, 'total AIRR subjects.')

        token = getToken(config)
        samples = getObjects(token, config, "sample_processing")
        json.dump(samples, open('/work/sample_processing.json','w'), indent=2)

        output_samples = []
        skip_samples = []
        airr_samples = []
        airr_cnt = 0
        skip_cnt = 0
        cnt = 0
        for sample in samples:
            # check if AIRR project
            found = False
            if sample.get('associationIds') is not None:
                for aid in sample['associationIds']:
                    if airr_studies.get(aid) is not None:
                        found = True

            if found:
                result = convertSample(sample, args.verbose, args.quiet)
                airr_cnt += 1
                if result['check']:
                    cnt += 1
                    output_samples.append(result['object'])
                    airr_samples.append(result['object'])
                    print('INFO: sample uuid', sample['uuid'], 'associationIds', sample['associationIds'])
                    if args.convert:
                        print('INFO: Updating record.')
                        updateRecord(token, config, result['object'])
                else:
                    skip_cnt += 1
                    skip_samples.append(sample)
                    airr_samples.append(sample)
                    print('INFO: Unchanged record', sample['uuid'])
            else:
                skip_cnt += 1
                skip_samples.append(sample)
                if not args.quiet:
                    print('INFO: Not in AIRR study list', sample['uuid'])

        json.dump(output_samples, open('/work/samples.output.json','w'), indent=2)
        json.dump(skip_samples, open('/work/samples.skip.json','w'), indent=2)
        json.dump(airr_samples, open('/work/samples.airr.json','w'), indent=2)

        print('INFO:', cnt, 'total samples converted.')
        print('INFO:', skip_cnt, 'total samples skipped.')
        print('INFO:', airr_cnt, 'total AIRR samples.')
