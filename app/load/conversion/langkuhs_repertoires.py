#
# Conversion script for langkuhs-2018-plosone
# Adaptive Biotechnologies dataset
#
# Incorporate changes to the AIRR schema
#

import airr

rep_file = './langkuhs.airr.json'
#out_file = './langkuhs.airr.json'
out_file = './test.airr.json'

data = airr.load_repertoire(rep_file)
reps = data['Repertoire']

for r in reps:
    files = r['data_processing'][0]['final_rearrangement_file'].split(',')
    r['data_processing'][0]['data_processing_files'] = files
    del r['data_processing'][0]['final_rearrangement_file']

    for entry in r['sample']:
        del entry['read_length']

airr.write_repertoire(out_file, reps)
