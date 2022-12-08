#
# Convert AIRR v1.3 schema to AIRR v1.4
#
# This script assumes you are running in a docker container.
#
# This script was coded using error-based programming. That is, conditionals were added
# with iterative coding starting with the first error/warning in the output and repeating until
# all errors/warnings were cleared from the output, thus the coding structure.
#
# The specific schema changes.

# Repertoire: NOTE: currently disabled
#   change name from sample to sample_processing

# Study:
#   change contains_tcr to contains_tr in keywords_study

# Sample:
#   change name from sample to sample_processing, if it is an AIRR sample record
#   convert collection_time_point_relative to separate quantity/unit fields
#   convert template_amount to separate quantity/unit fields
#   

# NOTE: Some schemas changes are doing when loading into the ADC repository

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
def convertRepertoire(rep, verbose):
    result = { 'check': False, 'object': None }
    # error checks
    if rep.get('uuid') is None:
        return result
    if rep.get('value') is None:
        return result

    # conversion
    if rep['value'].get('sample') is not None:
        print('INFO: repertoire uuid', rep['uuid'], 'changing sample to sample_processing')
        rep['value']['sample_processing'] = rep['value']['sample']
        del rep['value']['sample']
        result['check'] = True
        result['object'] = rep

    if verbose:
        if result['object'] is not None:
            print(json.dumps(rep, indent=2))

    return result

# Check and perform the conversion
def convertStudy(study, verbose):
    result = { 'check': False, 'object': None }
    # error checks
    if study.get('uuid') is None:
        return result
    if study.get('value') is None:
        return result

    # conversion
    if study['value'].get('keywords_study') is not None:
        if 'contains_tcr' in study['value']['keywords_study']:
            print('INFO: study uuid', study['uuid'], 'changing contains_tcr to contains_tr in keywords_study')
            study['value']['keywords_study'].remove('contains_tcr')
            study['value']['keywords_study'].append('contains_tr')
            result['check'] = True
            result['object'] = study

#    if result['object'] is not None:
#        airr.schema.AIRRSchema['Study'].validate_object(result['object']['value'])

    if verbose:
        if result['object'] is not None:
            print(json.dumps(study, indent=2))

    return result

# Check and perform the conversion
def convertSample(sample, verbose):
    result = { 'check': False, 'object': None }
    is_v2 = False

    # error checks
    if sample.get('uuid') is None:
        return result
    if sample.get('value') is None:
        return result
#    if sample['value'].get('collection_time_point_relative_unit') is not None:
#        return result

    # try to determine AIRR samples from old VDJServer samples
    if (sample['value'].get('tissue') is not None) and (type(sample['value']['tissue']) == str):
        print('INFO: sample uuid', sample['uuid'], 'is old VDJServer sample because tissue is string:', sample['value']['tissue'])
        #print(json.dumps(sample, indent=2))
        return result

    ctp = sample['value'].get('collection_time_point_relative')

    # Fix for Anne's study
    if ctp == 'Treg infusion':
        print('CHANGE: swap collection_time_point_relative:', ctp, 'and collection_time_point_reference:', sample['value']['collection_time_point_reference'])
        swap_hold = sample['value']['collection_time_point_relative']
        sample['value']['collection_time_point_relative'] = sample['value']['collection_time_point_reference']
        sample['value']['collection_time_point_reference'] = swap_hold
        if sample['value']['collection_time_point_relative'] == '24h post':
            sample['value']['collection_time_point_relative'] = '24 h'
            print('CHANGE: sample uuid', sample['uuid'], 'collection_time_point_relative from: 24h post to: ', sample['value']['collection_time_point_relative'])
        if sample['value']['collection_time_point_relative'] == 'Pre':
            sample['value']['collection_time_point_relative'] = '-1 h'
            print('CHANGE: sample uuid', sample['uuid'], 'collection_time_point_relative from: Pre to: ', sample['value']['collection_time_point_relative'])
        result['check'] = True
        result['object'] = sample
        # re-assign because we changed
        ctp = sample['value'].get('collection_time_point_relative')

    # conversion for collection_time_point_relative
    if ctp is not None:
        if type(ctp) == str:
            if len(ctp) == 0:
                print('CHANGE: sample uuid', sample['uuid'], 'change collection_time_point_relative from blank string to null')
                sample['value']['collection_time_point_relative'] = None
                result['check'] = True
                result['object'] = sample
            else:
                fields = ctp.split(' ')
                date_fields = ctp.split('-')
                if len(fields) == 2:
                    if (fields[1] == 'days') or (fields[1] == 'd') or (fields[1] == 'day'):
                        sample['value']['collection_time_point_relative'] = float(fields[0])
                        sample['value']['collection_time_point_relative_unit'] = { 'id': 'UO:0000033', 'label': 'day' }
                        print('CHANGE: sample uuid', sample['uuid'], 'split', ctp, 'into', sample['value']['collection_time_point_relative'], 'and', json.dumps(sample['value']['collection_time_point_relative_unit']))
                        result['check'] = True
                        result['object'] = sample
                    elif (fields[1] == 'hours') or (fields[1] == 'h') or (fields[1] == 'hour'):
                        sample['value']['collection_time_point_relative'] = float(fields[0])
                        sample['value']['collection_time_point_relative_unit'] = { 'id': 'UO:0000032', 'label': 'hour' }
                        print('CHANGE: sample uuid', sample['uuid'], 'split', ctp, 'into', sample['value']['collection_time_point_relative'], 'and', json.dumps(sample['value']['collection_time_point_relative_unit']))
                        result['check'] = True
                        result['object'] = sample
                    elif (fields[1] == 'weeks') or (fields[1] == 'w') or (fields[1] == 'week'):
                        sample['value']['collection_time_point_relative'] = float(fields[0])
                        sample['value']['collection_time_point_relative_unit'] = { 'id': 'UO:0000034', 'label': 'week' }
                        print('CHANGE: sample uuid', sample['uuid'], 'split', ctp, 'into', sample['value']['collection_time_point_relative'], 'and', json.dumps(sample['value']['collection_time_point_relative_unit']))
                        result['check'] = True
                        result['object'] = sample
                    elif (fields[0] == 'Day'):
                        sample['value']['collection_time_point_relative'] = float(fields[1])
                        sample['value']['collection_time_point_relative_unit'] = { 'id': 'UO:0000033', 'label': 'day' }
                        print('CHANGE: sample uuid', sample['uuid'], 'split', ctp, 'into', sample['value']['collection_time_point_relative'], 'and', json.dumps(sample['value']['collection_time_point_relative_unit']))
                        result['check'] = True
                        result['object'] = sample
                    elif (ctp == 'Time 0'):
                        sample['value']['collection_time_point_relative'] = 0
                        sample['value']['collection_time_point_relative_unit'] = { 'id': 'UO:0000033', 'label': 'day' }
                        print('CHANGE: sample uuid', sample['uuid'], 'split', ctp, 'into', sample['value']['collection_time_point_relative'], 'and', json.dumps(sample['value']['collection_time_point_relative_unit']))
                        result['check'] = True
                        result['object'] = sample
                    else:
                        print('ERROR: sample uuid:', sample['uuid'], 'unhandled unit in collection_time_point_relative:', ctp)
                elif len(date_fields) == 3:
                    print('CHANGE: sample uuid', sample['uuid'], 'move', ctp, 'from collection_time_point_relative to collection_time_point_reference')
                    sample['value']['collection_time_point_reference'] = sample['value']['collection_time_point_relative']
                    sample['value']['collection_time_point_relative'] = None
                    result['check'] = True
                    result['object'] = sample
                elif ctp  == '14d':
                    sample['value']['collection_time_point_relative'] = 14.0
                    sample['value']['collection_time_point_relative_unit'] = { 'id': 'UO:0000033', 'label': 'day' }
                    print('CHANGE: sample uuid', sample['uuid'], 'split', ctp, 'into', sample['value']['collection_time_point_relative'], 'and', json.dumps(sample['value']['collection_time_point_relative_unit']))
                    result['check'] = True
                    result['object'] = sample
                else:
                    print('ERROR: sample uuid:', sample['uuid'], 'cannot parse collection_time_point_relative:', ctp)
        elif type(ctp) == int:
            print('INFO: looks like V2 AIRR already')
            if sample['value'].get('physical_linkage', 'missing') != 'missing':
                is_v2 = True
        else:
            print('ERROR: sample uuid:', sample['uuid'], 'unhandled collection_time_point_relative type', type(ctp))
    else:
        print('INFO: null or non-existent collection_time_point_relative')
        # is this an old VDJServer sample, well physical_linkage is a required non-nullable field
        # but we also might have invalid V2 AIRR samples
        if sample['value'].get('physical_linkage', 'missing') != 'missing':
            print('INFO: looks like V2 AIRR already')
            is_v2 = True
            if sample['value'].get('physical_linkage') is None:
                print('INFO: physical_linkage is null')
                print('CHANGE: sample uuid', sample['uuid'], 'change null physical_linkage to none')
                sample['value']['physical_linkage'] = 'none'
                result['check'] = True
                result['object'] = sample

            if sample['value'].get('collection_time_point_relative_unit') is not None:
                print('ERROR: has a non null collection_time_point_relative_unit')
        else:
            dt = datetime.fromisoformat(sample['created'])
            ic = dt.isocalendar()
            if ic[0] < 2020:
                print('INFO: old V1, created year:', ic[0])
            elif sample['value'].get('subject_uuid') is not None:
                print('INFO: old V1, has subject_uuid:', sample['value'].get('subject_uuid'))
            elif len(sample['value'].keys()) < 4:
                print('INFO: old V1, only has <4 key(s):', sample['value'].keys())
            elif sample['value'].get('SampleID') is not None:
                print('INFO: old V1, has SampleID')
            else:
                print('ERROR: maybe V1, created year:', ic[0])

    # conversion for template_amount
    ta = sample['value'].get('template_amount')
    if ta is not None:
        if type(ta) == str:
            if len(ta) == 0:
                print('CHANGE: sample uuid', sample['uuid'], 'change template_amount from blank string to null')
                sample['value']['template_amount'] = None
                result['check'] = True
                result['object'] = sample
            else:
                fields = ta.split(' ')
                if len(fields) == 2:
                    if fields[1] == 'μl':
                        sample['value']['template_amount'] = float(fields[0])
                        sample['value']['template_amount_unit'] = { 'id': 'UO:0000101', 'label': 'microliter' }
                        print('CHANGE: sample uuid', sample['uuid'], 'split', ta, 'into', sample['value']['template_amount'], 'and', json.dumps(sample['value']['template_amount_unit']))
                        result['check'] = True
                        result['object'] = sample
                    elif fields[1] == 'ng':
                        sample['value']['template_amount'] = float(fields[0])
                        sample['value']['template_amount_unit'] = { 'id': 'UO:0000024', 'label': 'nanogram' }
                        print('CHANGE: sample uuid', sample['uuid'], 'split', ta, 'into', sample['value']['template_amount'], 'and', json.dumps(sample['value']['template_amount_unit']))
                        result['check'] = True
                        result['object'] = sample
                    else:
                        print('ERROR: sample uuid:', sample['uuid'], 'cannot parse template_amount:', ta)
                elif ta  == '2ug':
                    sample['value']['template_amount'] = 2.0
                    sample['value']['template_amount_unit'] = { 'id': 'UO:0000023', 'label': 'microgram' }
                    print('CHANGE: sample uuid', sample['uuid'], 'split', ta, 'into', sample['value']['template_amount'], 'and', json.dumps(sample['value']['template_amount_unit']))
                    result['check'] = True
                    result['object'] = sample
                elif ta  == '1ug':
                    sample['value']['template_amount'] = 1.0
                    sample['value']['template_amount_unit'] = { 'id': 'UO:0000023', 'label': 'microgram' }
                    print('CHANGE: sample uuid', sample['uuid'], 'split', ta, 'into', sample['value']['template_amount'], 'and', json.dumps(sample['value']['template_amount_unit']))
                    result['check'] = True
                    result['object'] = sample
                else:
                    print('ERROR: sample uuid:', sample['uuid'], 'cannot parse template_amount:', ta)
        else:
            print('ERROR: sample uuid:', sample['uuid'], 'unhandled template_amount type', type(ta))
    else:
        print('INFO: sample uuid:', sample['uuid'], 'null template_amount')

    # Any additional cleanup
    if (result['object'] is not None) or is_v2:
        if sample['value'].get('collection_time_point_relative_unit', 'missing') == 'missing':
            print('INFO: collection_time_point_relative_unit is missing')
            print('CHANGE: sample uuid', sample['uuid'], 'set collection_time_point_relative_unit to null')
            sample['value']['collection_time_point_relative_unit'] = None
            result['check'] = True
            result['object'] = sample
        if sample['value'].get('collection_time_point_relative', 'missing') == 'missing':
            print('INFO: collection_time_point_relative is missing')
            print('CHANGE: sample uuid', sample['uuid'], 'set collection_time_point_relative to null')
            sample['value']['collection_time_point_relative'] = None
            result['check'] = True
            result['object'] = sample
        if sample['value'].get('template_amount_unit', 'missing') == 'missing':
            print('INFO: template_amount_unit is missing')
            print('CHANGE: sample uuid', sample['uuid'], 'set template_amount_unit to null')
            sample['value']['template_amount_unit'] = None
            result['check'] = True
            result['object'] = sample
        if sample['value'].get('library_generation_method') is None:
            if sample['value'].get('template_class') == 'DNA':
                print('INFO: library_generation_method is null')
                print('CHANGE: sample uuid', sample['uuid'], 'set library_generation_method to PCR as template_class is DNA')
                sample['value']['library_generation_method'] = 'PCR'
                result['check'] = True
                result['object'] = sample
            if sample['value'].get('template_class') == 'RNA':
                if sample['value'].get('sequencing_run_id') == 'library_1':
                    print('INFO: library_generation_method is null')
                    print('CHANGE: sample uuid', sample['uuid'], 'set library_generation_method to RT(specific)+TS+PCR as sequencing_run_id is library_1')
                    sample['value']['library_generation_method'] = 'RT(specific)+TS+PCR'
                    result['check'] = True
                    result['object'] = sample
                if sample['value'].get('sequencing_run_id') == 'library_4':
                    print('INFO: library_generation_method is null')
                    print('CHANGE: sample uuid', sample['uuid'], 'set library_generation_method to RT(specific)+TS+PCR as sequencing_run_id is library_4')
                    sample['value']['library_generation_method'] = 'RT(specific)+TS+PCR'
                    result['check'] = True
                    result['object'] = sample
                if sample['value'].get('sequencing_run_id') == 'library_6':
                    print('INFO: library_generation_method is null')
                    print('CHANGE: sample uuid', sample['uuid'], 'set library_generation_method to RT(specific)+TS+PCR as sequencing_run_id is library_6')
                    sample['value']['library_generation_method'] = 'RT(specific)+TS+PCR'
                    result['check'] = True
                    result['object'] = sample
                if sample['value'].get('sequencing_run_id') == 'library_9':
                    print('INFO: library_generation_method is null')
                    print('CHANGE: sample uuid', sample['uuid'], 'set library_generation_method to RT(specific)+TS+PCR as sequencing_run_id is library_9')
                    sample['value']['library_generation_method'] = 'RT(specific)+TS+PCR'
                    result['check'] = True
                    result['object'] = sample
            if sample['value'].get('complete_sequences') is None:
                print('INFO: complete_sequences is null')
                print('CHANGE: sample uuid', sample['uuid'], 'set complete_sequences to partial')
                sample['value']['complete_sequences'] = 'partial'
                result['check'] = True
                result['object'] = sample
            if sample['value'].get('physical_linkage') is None:
                print('INFO: physical_linkage is null')
                print('CHANGE: sample uuid', sample['uuid'], 'set physical_linkage to none')
                sample['value']['physical_linkage'] = 'partial'
                result['check'] = True
                result['object'] = sample
        if sample['value']['sequencing_files'].get('sequencing_data_id', 'missing') == 'missing':
            print('INFO: sequencing_data_id is missing')
            print('CHANGE: sample uuid', sample['uuid'], 'set sequencing_data_id to null')
            sample['value']['sequencing_files']['sequencing_data_id'] = None
            result['check'] = True
            result['object'] = sample
        if sample['value']['sequencing_files'].get('read_length', 'missing') == 'missing':
            print('INFO: read_length is missing')
            print('CHANGE: sample uuid', sample['uuid'], 'set read_length to null')
            sample['value']['sequencing_files']['read_length'] = None
            result['check'] = True
            result['object'] = sample
        if sample['value']['sequencing_files'].get('paired_read_length', 'missing') == 'missing':
            print('INFO: paired_read_length is missing')
            print('CHANGE: sample uuid', sample['uuid'], 'set paired_read_length to null')
            sample['value']['sequencing_files']['paired_read_length'] = None
            result['check'] = True
            result['object'] = sample
        if sample['value']['sequencing_files'].get('paired_filename', 'missing') == 'missing':
            print('INFO: paired_filename is missing')
            print('CHANGE: sample uuid', sample['uuid'], 'set paired_filename to null')
            sample['value']['sequencing_files']['paired_filename'] = None
            result['check'] = True
            result['object'] = sample
        if sample['value']['sequencing_files'].get('paired_read_direction', 'missing') == 'missing':
            print('INFO: paired_read_direction is missing')
            print('CHANGE: sample uuid', sample['uuid'], 'set paired_read_direction to null')
            sample['value']['sequencing_files']['paired_read_direction'] = None
            result['check'] = True
            result['object'] = sample
        if sample['value'].get('cell_species', 'missing') == 'missing':
            print('INFO: cell_species is missing')
            print('CHANGE: sample uuid', sample['uuid'], 'set cell_species to null')
            sample['value']['cell_species'] = None
            result['check'] = True
            result['object'] = sample
        if sample['value'].get('anatomic_site', 'missing') == 'missing':
            print('INFO: anatomic_site is missing')
            print('CHANGE: sample uuid', sample['uuid'], 'set anatomic_site to null')
            sample['value']['anatomic_site'] = None
            result['check'] = True
            result['object'] = sample
        if sample['value'].get('disease_state_sample', 'missing') == 'missing':
            print('INFO: disease_state_sample is missing')
            print('CHANGE: sample uuid', sample['uuid'], 'set disease_state_sample to null')
            sample['value']['disease_state_sample'] = None
            result['check'] = True
            result['object'] = sample
        if sample['value'].get('collection_time_point_reference', 'missing') == 'missing':
            print('INFO: collection_time_point_reference is missing')
            print('CHANGE: sample uuid', sample['uuid'], 'set collection_time_point_reference to null')
            sample['value']['collection_time_point_reference'] = None
            result['check'] = True
            result['object'] = sample
        if sample['value'].get('biomaterial_provider', 'missing') == 'missing':
            print('INFO: biomaterial_provider is missing')
            print('CHANGE: sample uuid', sample['uuid'], 'set biomaterial_provider to null')
            sample['value']['biomaterial_provider'] = None
            result['check'] = True
            result['object'] = sample
        if sample['value'].get('tissue_processing', 'missing') == 'missing':
            print('INFO: tissue_processing is missing')
            print('CHANGE: sample uuid', sample['uuid'], 'set tissue_processing to null')
            sample['value']['tissue_processing'] = None
            result['check'] = True
            result['object'] = sample
        if sample['value'].get('cell_subset', 'missing') == 'missing':
            print('INFO: cell_subset is missing')
            print('CHANGE: sample uuid', sample['uuid'], 'set cell_subset to null')
            sample['value']['cell_subset'] = None
            result['check'] = True
            result['object'] = sample
        if sample['value'].get('cell_phenotype', 'missing') == 'missing':
            print('INFO: cell_phenotype is missing')
            print('CHANGE: sample uuid', sample['uuid'], 'set cell_phenotype to null')
            sample['value']['cell_phenotype'] = None
            result['check'] = True
            result['object'] = sample
        if sample['value'].get('cell_number', 'missing') == 'missing':
            print('INFO: cell_number is missing')
            print('CHANGE: sample uuid', sample['uuid'], 'set cell_number to null')
            sample['value']['cell_number'] = None
            result['check'] = True
            result['object'] = sample
        if sample['value'].get('cells_per_reaction', 'missing') == 'missing':
            print('INFO: cells_per_reaction is missing')
            print('CHANGE: sample uuid', sample['uuid'], 'set cells_per_reaction to null')
            sample['value']['cells_per_reaction'] = None
            result['check'] = True
            result['object'] = sample
        if sample['value'].get('cell_quality', 'missing') == 'missing':
            print('INFO: cell_quality is missing')
            print('CHANGE: sample uuid', sample['uuid'], 'set cell_quality to null')
            sample['value']['cell_quality'] = None
            result['check'] = True
            result['object'] = sample
        if sample['value'].get('cell_isolation', 'missing') == 'missing':
            print('INFO: cell_isolation is missing')
            print('CHANGE: sample uuid', sample['uuid'], 'set cell_isolation to null')
            sample['value']['cell_isolation'] = None
            result['check'] = True
            result['object'] = sample
        if sample['value'].get('cell_processing_protocol', 'missing') == 'missing':
            print('INFO: cell_processing_protocol is missing')
            print('CHANGE: sample uuid', sample['uuid'], 'set cell_processing_protocol to null')
            sample['value']['cell_processing_protocol'] = None
            result['check'] = True
            result['object'] = sample
        if sample['value'].get('template_quality', 'missing') == 'missing':
            print('INFO: template_quality is missing')
            print('CHANGE: sample uuid', sample['uuid'], 'set template_quality to null')
            sample['value']['template_quality'] = None
            result['check'] = True
            result['object'] = sample
        if sample['value'].get('template_amount', 'missing') == 'missing':
            print('INFO: template_amount is missing')
            print('CHANGE: sample uuid', sample['uuid'], 'set template_amount to null')
            sample['value']['template_amount'] = None
            result['check'] = True
            result['object'] = sample
        if sample['value'].get('template_class') is None:
            print('INFO: template_class is null')
            print('CHANGE: sample uuid', sample['uuid'], 'set template_class to DNA')
            sample['value']['template_class'] = 'DNA'
            result['check'] = True
            result['object'] = sample
        if sample['value'].get('library_generation_method') is None:
            print('INFO: library_generation_method is null')
            print('CHANGE: sample uuid', sample['uuid'], 'set library_generation_method to PCR')
            sample['value']['library_generation_method'] = 'PCR'
            result['check'] = True
            result['object'] = sample
        if sample['value'].get('pcr_target') is not None:
            for entry in sample['value']['pcr_target']:
                if entry.get('forward_pcr_primer_target_location', 'missing') == 'missing':
                    print('INFO: forward_pcr_primer_target_location is missing')
                    print('CHANGE: sample uuid', sample['uuid'], 'set forward_pcr_primer_target_location to null')
                    entry['forward_pcr_primer_target_location'] = None
                    result['check'] = True
                    result['object'] = sample
                if entry.get('reverse_pcr_primer_target_location', 'missing') == 'missing':
                    print('INFO: reverse_pcr_primer_target_location is missing')
                    print('CHANGE: sample uuid', sample['uuid'], 'set reverse_pcr_primer_target_location to null')
                    entry['reverse_pcr_primer_target_location'] = None
                    result['check'] = True
                    result['object'] = sample
        if sample['value'].get('sequencing_run_id', 'missing') == 'missing':
            print('INFO: sequencing_run_id is missing')
            print('CHANGE: sample uuid', sample['uuid'], 'set sequencing_run_id to null')
            sample['value']['sequencing_run_id'] = None
            result['check'] = True
            result['object'] = sample
        if sample['value'].get('total_reads_passing_qc_filter', 'missing') == 'missing':
            print('INFO: total_reads_passing_qc_filter is missing')
            print('CHANGE: sample uuid', sample['uuid'], 'set total_reads_passing_qc_filter to null')
            sample['value']['total_reads_passing_qc_filter'] = None
            result['check'] = True
            result['object'] = sample
        if sample['value'].get('sequencing_platform', 'missing') == 'missing':
            print('INFO: sequencing_platform is missing')
            print('CHANGE: sample uuid', sample['uuid'], 'set sequencing_platform to null')
            sample['value']['sequencing_platform'] = None
            result['check'] = True
            result['object'] = sample
        if sample['value'].get('sequencing_facility', 'missing') == 'missing':
            print('INFO: sequencing_facility is missing')
            print('CHANGE: sample uuid', sample['uuid'], 'set sequencing_facility to null')
            sample['value']['sequencing_facility'] = None
            result['check'] = True
            result['object'] = sample
        if sample['value'].get('sequencing_run_date', 'missing') == 'missing':
            print('INFO: sequencing_run_date is missing')
            print('CHANGE: sample uuid', sample['uuid'], 'set sequencing_run_date to null')
            sample['value']['sequencing_run_date'] = None
            result['check'] = True
            result['object'] = sample
        if sample['value'].get('sequencing_kit', 'missing') == 'missing':
            print('INFO: sequencing_kit is missing')
            print('CHANGE: sample uuid', sample['uuid'], 'set sequencing_kit to null')
            sample['value']['sequencing_kit'] = None
            result['check'] = True
            result['object'] = sample
        if sample['value'].get('sample_processing_id', 'missing') == 'missing':
            print('INFO: sample_processing_id is missing')
            print('CHANGE: sample uuid', sample['uuid'], 'set sample_processing_id to null')
            sample['value']['sample_processing_id'] = None
            result['check'] = True
            result['object'] = sample
        if sample['value'].get('sample_type', 'missing') == 'missing':
            print('INFO: sample_type is missing')
            print('CHANGE: sample uuid', sample['uuid'], 'set sample_type to null')
            sample['value']['sample_type'] = None
            result['check'] = True
            result['object'] = sample
        if sample['value'].get('library_generation_protocol', 'missing') == 'missing':
            print('INFO: library_generation_protocol is missing')
            print('CHANGE: sample uuid', sample['uuid'], 'set library_generation_protocol to null')
            sample['value']['library_generation_protocol'] = None
            result['check'] = True
            result['object'] = sample
        if sample['value'].get('library_generation_kit_version', 'missing') == 'missing':
            print('INFO: library_generation_kit_version is missing')
            print('CHANGE: sample uuid', sample['uuid'], 'set library_generation_kit_version to null')
            sample['value']['library_generation_kit_version'] = None
            result['check'] = True
            result['object'] = sample
        if sample['value'].get('tissue') is not None:
            if sample['value']['tissue'].get('value') is not None:
                print('INFO: tissue has value instead of label')
                print('CHANGE: sample uuid', sample['uuid'], 'move tissue.value to tissue.label')
                sample['value']['tissue']['label'] = sample['value']['tissue']['value']
                del sample['value']['tissue']['value']
                result['check'] = True
                result['object'] = sample
        if sample['value'].get('vdjserver_uuid') is not None:
            print('INFO: has vdjserver_uuid')
            print('CHANGE: sample uuid', sample['uuid'], 'delete vdjserver_uuid')
            del sample['value']['vdjserver_uuid']
            result['check'] = True
            result['object'] = sample
        if (sample['value'].get('total_reads_passing_qc_filter') is not None) and (type(sample['value'].get('total_reads_passing_qc_filter')) == str):
            if len(sample['value'].get('total_reads_passing_qc_filter')) == 0:
                print('INFO: total_reads_passing_qc_filter is blank string')
                print('CHANGE: sample uuid', sample['uuid'], 'set total_reads_passing_qc_filter to null')
                sample['value']['total_reads_passing_qc_filter'] = None
                result['check'] = True
                result['object'] = sample
        if sample['value'].get('read_length', 'missing') != 'missing':
            print('INFO: extra read_length field')
            print('CHANGE: sample uuid', sample['uuid'], 'delete read_length')
            del sample['value']['read_length']
            result['check'] = True
            result['object'] = sample

        # lastly change the name to sample_processing
        sample['name'] = 'sample_processing'
        print('CHANGE: sample uuid', sample['uuid'], 'change name to sample_processing')

        # should pass at this point
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
    args = parser.parse_args()

    if args:
        if args.convert:
            print('INFO: Conversion enabled, modifications will be saved.')
        else:
            print('INFO: Conversion not enabled, will only describe modifications.')

        config = getConfig()
        token = getToken(config)

# the repertoire records are not in AIRR format. They are in the VDJServer normalized
# format, but I kept the same key names as with AIRR.

#        reps = getObjects(token, config, "repertoire")
#        skip_cnt = 0
#        cnt = 0
#        for rep in reps:
#            result = convertRepertoire(rep, args.verbose)
#            if result['check']:
#                cnt += 1
#                if args.convert:
#                    print('INFO: Updating record.')
#            else:
#                skip_cnt += 1
#                print('INFO: Unchanged record', rep['uuid'])

#        print('INFO:', cnt, 'total repertoires converted.')
#        print('INFO:', skip_cnt, 'total repertoires skipped.')

        # AIRR VDJServer V2 projects that have been made public
        studies = getObjects(token, config, "public_project")
        skip_cnt = 0
        cnt = 0
        for study in studies:
            #if study['uuid'] != "5558760323211783700-242ac117-0001-012":
            #    continue
            result = convertStudy(study, args.verbose)
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

        # AIRR VDJServer V2 projects that have been made public
        # NOTE: some of these have been made public, need to fix that
        studies = getObjects(token, config, "private_project")
        skip_cnt = 0
        cnt = 0
        for study in studies:
            #if study['uuid'] != "5558760323211783700-242ac117-0001-012":
            #    continue
            result = convertStudy(study, args.verbose)
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

        # made a mistake in the start of the V2 implementation in that I kept the same
        # name of 'sample' for the AIRR sample_processing which makes it harder now to distinguish
        # them from old V1 samples as some look AIRR-like. Fortunately, I'm assuming only V2 projects
        # need to be converted so that restricts the set.
        # will rename to 'sample_processing' with this conversion
        samples = getObjects(token, config, "sample")
        json.dump(samples, open('/work/samples.json','w'), indent=2)

        # limit these to the list of studies and
        # assume they all should be AIRR? I think so...
        # count should be greater than the ADC because public and private
        # in theory, the public should match the ADC exactly but some projects are still private
        airr_studies = {}
        for study in public_studies:
            airr_studies[study['uuid']] = study['uuid']
        for study in private_studies:
            airr_studies[study['uuid']] = study['uuid']

        # hack for testing
        #airr_studies = { "5558760323211783700-242ac117-0001-012": "5558760323211783700-242ac117-0001-012" }
        print('INFO:', len(airr_studies), 'AIRR studies.')

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
                result = convertSample(sample, args.verbose)
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
                print('INFO: Not AIRR study', sample['uuid'])

        json.dump(output_samples, open('/work/samples.output.json','w'), indent=2)
        json.dump(skip_samples, open('/work/samples.skip.json','w'), indent=2)
        json.dump(airr_samples, open('/work/samples.airr.json','w'), indent=2)

        print('INFO:', cnt, 'total samples converted.')
        print('INFO:', skip_cnt, 'total samples skipped.')
        print('INFO:', airr_cnt, 'total AIRR samples.')
