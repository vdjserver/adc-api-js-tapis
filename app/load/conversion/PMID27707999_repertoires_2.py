#
# Conversion script for PMID27707999 (PRJNA283640)
#
# script #2
#
# Incorporate changes to the AIRR schema
#

import airr

rep_file = './PMID27707999.airr.json'
#out_file = './PMID27707999.airr.json'
out_file = './test.airr.json'

data = airr.load_repertoire(rep_file)
reps = data['Repertoire']

for r in reps:
    files = r['data_processing'][0]['final_rearrangement_file'].split(',')
    r['data_processing'][0]['data_processing_files'] = files
    del r['data_processing'][0]['final_rearrangement_file']

    for entry in r['sample']:
        entry['sequencing_files']['read_length'] = 326
        entry['sequencing_files']['paired_read_length'] = 276
        del entry['read_length']

airr.write_repertoire(out_file, reps)
