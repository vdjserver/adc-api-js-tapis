#
# Conversion script for Cowel Lab Cervical study
#
# First run the standard convert_repertoires.py
# Then run this to do specific cleanup
#

import airr

rep_file = './repertoires.airr.json'
out_file = './Cervical.airr.json'

data = airr.load_repertoire(rep_file)
reps = data['Repertoire']

for r in reps:
    # hand coded stuff

    for entry in r['sample']:
        entry['library_generation_method'] = 'PCR'
        entry['library_generation_protocol'] = 'Adaptive Biotechnologies'
        entry['cell_subset'] = None
        entry['tissue'] = { 'id': 'UBERON:0004801', 'label': 'cervix epithelium' }
        entry['sequencing_files']['file_type'] = 'fasta'
        entry['sequencing_files']['read_direction'] = 'forward'

    r['subject']['species']['id'] = "NCBITAXON:9606"
    r['subject']['species']['label'] = "Homo sapiens"
    a = r['subject']['age']
    if a is not None:
        r['subject']['age_min'] = float(a)
        r['subject']['age_max'] = float(a)
        r['subject']['age_unit']['id'] = 'UO:0000036'
        r['subject']['age_unit']['label'] = 'year'
    del r['subject']['age']

    r['data_processing'][0]['data_processing_id'] = 'bf0617e7-b4a4-480f-99e3-b53eef9ca6d4-007'
    r['data_processing'][0]['primary_annotation'] = True
    r['data_processing'][0]['software_versions'] = 'igblast-ls5-1.14u2'
    r['data_processing'][0]['germline_database'] = 'VDJServer IMGT 2019.01.23'

    files = []
    fname = ''
    for entry in r['sample']:
        fname = entry['sequencing_files']['filename']
        fname = fname.replace('.fasta','')
        fname = fname + '.igblast.airr.tsv.gz'
        files.append(fname)
    r['data_processing'][0]['data_processing_files'] = [ ','.join(files) ]

airr.write_repertoire(out_file, reps)
