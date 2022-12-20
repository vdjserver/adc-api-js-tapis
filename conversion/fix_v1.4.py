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
def queryObjects(token, config, name, limit, offset):
    headers = {
        "Content-Type":"application/json",
        "Accept": "application/json",
        "Authorization": "Bearer " + token['access_token']
    }
    url = 'https://' + config['api_server'] + '/meta/v2/data?q=' + urllib.parse.quote('{"name":"' + name + '"}') + '&limit=' + str(limit) + '&offset=' + str(offset)
    resp = requests.get(url, headers=headers)
    #print(json.dumps(resp.json(), indent=2))
    result = resp.json()['result']
    print('INFO: Query returned', len(result), name, 'records.')
    return resp.json()['result']

# Load all of the repertoire metadata records
def getObjects(token, config, name):
    offset = 0
    limit = 100
    query_list = queryObjects(token, config, name, limit, offset)
    data = []
    data += query_list
    done = False
    while not done:
        if len(query_list) > 0:
            offset = offset + limit
            query_list = queryObjects(token, config, name, limit, offset)
            data += query_list
        else:
            done = True
    print('INFO:', len(data), 'total', name, 'records.')
    return data

# Check and perform the conversion
def convertStudy(study, verbose, quiet):
    # should always pass so check
    result = { 'check': True, 'object': study }

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
    if study['value'].get('keywords_study') is not None:
        if 'contains_single_cell' in study['value']['keywords_study']:
            print('INFO: study uuid', study['uuid'], 'moving contains_single_cell from keywords_study to vdjserver_keywords')
            study['value']['keywords_study'].remove('contains_single_cell')
            if study['value'].get('vdjserver_keywords') is None:
                study['value']['vdjserver_keywords'] = []
            study['value']['vdjserver_keywords'].append('contains_single_cell')
            #result['check'] = True
            #result['object'] = study

    if type(study['value'].get('study_type')) == str:
        if study['value']['study_type'] == 'junk':
            print('INFO: study uuid', study['uuid'], 'study_type is not dict, change to null')
            study['value']['study_type'] = None

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
    result = { 'check': True, 'object': subject }

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
    if subject['value'].get('genotype') is not None:
        #print(json.dumps(subject, indent=2))
        if subject['value'].get('genotype').get('receptor_genotype_set') is not None:
            if subject['value'].get('genotype').get('receptor_genotype_set').get('receptor_genotype_set_id') is None:
                print('INFO: subject uuid', subject['uuid'], 'has null genotype, setting to null')
                subject['value']['genotype'] = None

    if subject['value'].get('genotype') is not None:
        if subject['value']['genotype'].get('mhc_genotype_set') is not None:
            if subject['value']['genotype'].get('mhc_genotype_set').get('mhc_genotype_class_list') is not None:
                #print(json.dumps(subject, indent=2))
                print('INFO: subject uuid', subject['uuid'], 'has mhc_genotype_class_list, generate mhc_genotype_list, copy data, delete mhc_genotype_class_list')
                sgg = subject['value']['genotype']['mhc_genotype_set']
                if type(sgg.get('mhc_genotype_class_list')) == list:
                    sgg['mhc_genotype_list'] = []
                    for g in sgg['mhc_genotype_class_list']:
                        if g.get('germline_alleles') is not None:
                            #print(len(g['germline_alleles']))
                            t = airr.schema.Schema('MHCGenotype').template()
                            t['mhc_alleles'].clear()
                            sgg['mhc_genotype_list'].append(t)
                            for ga in g['germline_alleles']:
                                print('INFO: subject uuid', subject['uuid'], 'generating mhc allele')
                                print(ga)
                                ma = airr.schema.Schema('MHCAllele').template()
                                ma['allele_designation'] = ga['gene_symbol']
                                t['mhc_alleles'].append(ma)

                                if 'HLA-A' in ga['gene_symbol']:
                                    t['mhc_class'] = 'MHC-I'
                                    ma['gene']['id'] = 'MRO:0000046'
                                    ma['gene']['label'] = 'HLA-A gene'
                                if 'HLA-B' in ga['gene_symbol'] :
                                    t['mhc_class'] = 'MHC-I'
                                    ma['gene']['id'] = 'MRO:0000047'
                                    ma['gene']['label'] = 'HLA-B gene'
                                if 'HLA-C' in ga['gene_symbol']:
                                    t['mhc_class'] = 'MHC-I'
                                    ma['gene']['id'] = 'MRO:0000049'
                                    ma['gene']['label'] = 'HLA-C gene'
                            for ma in t['mhc_alleles']:
                                print(ma)
                    if len(sgg['mhc_genotype_list']) != len(sgg['mhc_genotype_class_list']):
                        print(len(sgg['mhc_genotype_list']))
                        print(len(sgg['mhc_genotype_class_list']))
                        raise Exception("len(sgg['mhc_genotype_list']) != len(sgg['mhc_genotype_class_list'])")
                del sgg['mhc_genotype_class_list']
                #print(json.dumps(subject, indent=2))

    if subject['value'].get('diagnosis') is None:
        print('INFO: subject uuid', subject['uuid'], 'diagnosis is null, setting to template')
        subject['value']['diagnosis'] = [ airr.schema.AIRRSchema['Diagnosis'].template() ]

    for d in subject['value']['diagnosis']:
        if d.get('disease_diagnosis') is not None:
            if type(d.get('disease_diagnosis')) == str:
                if len(d.get('disease_diagnosis')) == 0:
                    print('INFO: subject uuid', subject['uuid'], 'disease_diagnosis has blank string, setting to null')
                    d['disease_diagnosis'] = None
        if d.get('study_group_description') is not None and d.get('medical_history','missing') == 'missing':
            print('INFO: subject uuid', subject['uuid'], 'fill out diagnosis object from template')
            entry = subject['value']['diagnosis'][0]
            t = airr.schema.AIRRSchema['Diagnosis'].template()
            for entry in t:
                if d.get(entry) is None:
                    d[entry] = t[entry]

    if subject['value'].get('age_event', 'missing') == 'missing':
        print('INFO: age_event is missing')
        print('CHANGE: subject uuid', subject['uuid'], 'set age_event to null')
        subject['value']['age_event'] = None

    if subject['value'].get('ancestry_population', 'missing') == 'missing':
        print('INFO: ancestry_population is missing')
        print('CHANGE: subject uuid', subject['uuid'], 'set ancestry_population to null')
        subject['value']['ancestry_population'] = None

    if subject['value'].get('ethnicity', 'missing') == 'missing':
        print('INFO: ethnicity is missing')
        print('CHANGE: subject uuid', subject['uuid'], 'set ethnicity to null')
        subject['value']['ethnicity'] = None

    if subject['value'].get('race', 'missing') == 'missing':
        print('INFO: race is missing')
        print('CHANGE: subject uuid', subject['uuid'], 'set race to null')
        subject['value']['race'] = None

    if subject['value'].get('strain_name', 'missing') == 'missing':
        print('INFO: strain_name is missing')
        print('CHANGE: subject uuid', subject['uuid'], 'set strain_name to null')
        subject['value']['strain_name'] = None

    if subject['value'].get('linked_subjects', 'missing') == 'missing':
        print('INFO: linked_subjects is missing')
        print('CHANGE: subject uuid', subject['uuid'], 'set linked_subjects to null')
        subject['value']['linked_subjects'] = None

    if subject['value'].get('link_type', 'missing') == 'missing':
        print('INFO: link_type is missing')
        print('CHANGE: subject uuid', subject['uuid'], 'set link_type to null')
        subject['value']['link_type'] = None

    if subject['value'].get('age_min', 'missing') == 'missing':
        print('INFO: age_min is missing')
        print('CHANGE: subject uuid', subject['uuid'], 'set age_min to null')
        subject['value']['age_min'] = None

    if subject['value'].get('age_min') is not None:
        if type(subject['value'].get('age_min')) == str:
            print('INFO: age_min is string')
            print('CHANGE: subject uuid', subject['uuid'], 'cast age_min to number')
            subject['value']['age_min'] = float(subject['value'].get('age_min'))

    if subject['value'].get('age_max', 'missing') == 'missing':
        print('INFO: age_max is missing')
        print('CHANGE: subject uuid', subject['uuid'], 'set age_max to null')
        subject['value']['age_max'] = None

    if subject['value'].get('age_max') is not None:
        if type(subject['value'].get('age_max')) == str:
            print('INFO: age_max is string')
            print('CHANGE: subject uuid', subject['uuid'], 'cast age_max to number')
            subject['value']['age_max'] = float(subject['value'].get('age_max'))

    if subject['value'].get('age_unit', 'missing') == 'missing':
        print('INFO: age_unit is missing')
        print('CHANGE: subject uuid', subject['uuid'], 'set age_unit to null')
        subject['value']['age_unit'] = None

    if verbose:
        if result['object'] is not None:
            print(json.dumps(subject, indent=2))

    # should pass at this point
    if result['check']:
        airr.schema.AIRRSchema['Subject'].validate_object(result['object']['value'])

    return result

# Check and perform the conversion
def convertSample(sample, verbose, quiet):
    result = { 'check': True, 'object': sample }

    # error checks
    if sample.get('uuid') is None:
        return result
    if sample.get('value') is None:
        return result
    # should always pass, in theory
    #airr.schema.AIRRSchema['SampleProcessing'].validate_object(study['value'])

    lgm = sample['value'].get('library_generation_method')
    if lgm is not None:
        #print(lgm, len(lgm), sample['value'].get('template_class'))
        if len(lgm) == 0:
            if sample['value'].get('template_class') == 'DNA':
                print('INFO: library_generation_method is blank string')
                print('CHANGE: sample uuid', sample['uuid'], 'set library_generation_method to PCR as template_class is DNA')
                sample['value']['library_generation_method'] = 'PCR'
                result['check'] = True
                result['object'] = sample
            else:
                print('ERROR: sample uuid:', sample['uuid'], 'unhandled library_generation_method')

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
#        for study in public_studies:
#            airr_studies[study['uuid']] = study['uuid']
        for study in private_studies:
            airr_studies[study['uuid']] = study['uuid']
        #airr_studies['5558760323211783700-242ac117-0001-012'] = '5558760323211783700-242ac117-0001-012'
        print('INFO:', len(airr_studies), 'AIRR studies.')

        subjects = getObjects(token, config, "subject")
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
