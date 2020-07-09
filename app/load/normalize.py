#
# Take an AIRR repertoire metadata file
# and normalize the records
#

import json
from dotenv import load_dotenv
import os
import airr
import yaml
import requests
import argparse

project_uuid = "5100565037084512746-242ac113-0001-012"

def output_json(subjects, samples):
    #print(subjects)
    for obj in subjects:
        out = {}
        out['associationIds'] = [ project_uuid ]
        out['name'] = 'subject'
        out['value'] = subjects[obj]
        with open('subject_' + out['value']['subject_id'] + '.json', 'w') as f:
            json.dump(out,f,indent=2)
    #print(samples)
    for obj in samples:
        out = {}
        out['associationIds'] = [ project_uuid ]
        out['name'] = 'sample'
        out['value'] = samples[obj]
        with open('sample_' + out['value']['sample_id'] + '.json', 'w') as f:
            json.dump(out,f,indent=2)

def output_reps(reps):
    cnt = 1
    for r in reps:
        subject_fn = 'tmp/subject_' + r['subject']['subject_id'] + '.json'
        sample_fn = 'tmp/sample_' + r['sample'][0]['sample_id'] + '.json'

        subject = json.load(open(subject_fn,'r'))
        sample = json.load(open(sample_fn,'r'))

        r['study'] = { "vdjserver_uuid": project_uuid }
        r['subject'] = { "vdjserver_uuid": subject['uuid'] }
        r['sample'] = [ { "vdjserver_uuid": sample['uuid'] } ]
        del r['repertoire_id']
        del r['data_processing']

        obj = {}
        obj['associationIds'] = [ project_uuid ]
        obj['name'] = 'repertoire'
        obj['value'] = r
        with open('rep_' + str(cnt) + '.json', 'w') as f:
            json.dump(obj,f,indent=2)
            cnt += 1

# main entry
if (__name__=="__main__"):
    parser = argparse.ArgumentParser(description='Normalize AIRR repertoire metadata.')
    parser.add_argument('repertoire_file', type=str, help='Repertoire metadata file name')
    args = parser.parse_args()

    if args:
        data = airr.load_repertoire(args.repertoire_file)

        subjects = {}
        samples = {}
        reps = data['Repertoire']

        for r in reps:
            obj = r['subject']
            if subjects.get(obj['subject_id']) is None:
                subjects[obj['subject_id']] = obj

            for obj in r['sample']:
                if samples.get(obj['sample_id']) is None:
                    samples[obj['sample_id']] = obj

        #output_json(subjects, samples)
        output_reps(reps)
