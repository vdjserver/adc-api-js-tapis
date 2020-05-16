#
# Conversion script for emerson-2017-natgen
# Adaptive Biotechnologies dataset
#
# Incorporate changes to the AIRR schema
#

import airr

rep_file = './cmv.airr.json'
#out_file = './cmv.airr.json'
out_file = './test.airr.json'

data = airr.load_repertoire(rep_file)
reps = data['Repertoire']

for r in reps:
    r['sample'][0]['disease_state_sample'] = r['subject']['diagnosis'][0]['disease_diagnosis']
    r['subject']['diagnosis'][0]['disease_diagnosis'] = None

airr.write_repertoire(out_file, reps)
