#
# Clear repertoire_id and write to new file
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

# main entry
if (__name__=="__main__"):
    parser = argparse.ArgumentParser(description='Clear repertoire identifiers from AIRR repertoire metadata.')
    parser.add_argument('input_file', type=str, help='Repertoire metadata input file name')
    parser.add_argument('output_file', type=str, help='Repertoire metadata output file name')
    args = parser.parse_args()

    if args:
        data = airr.load_repertoire(args.input_file)

        reps = data['Repertoire']

        for r in reps:
            r['repertoire_id'] = None

        # write out the repertoires
        data = airr.write_repertoire(args.output_file, reps)
