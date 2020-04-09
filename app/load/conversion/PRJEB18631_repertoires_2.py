#
# Conversion script for PRJEB18631
#
# script #2
#

import airr

rep_file = './PRJEB18631.airr.json'
#out_file = './PRJEB18631.airr.json'
out_file = './test.airr.json'

data = airr.load_repertoire(rep_file)
reps = data['Repertoire']

for r in reps:
    # hand coded stuff
    r['study']['study_type']['id'] = "C93130"
    r['study']['study_type']['value'] = "Animal Study"

    if r['subject']['strain_name'] == 'pet shop mouse':
        r['subject']['age_min'] = None
        r['subject']['age_max'] = None
        r['subject']['age_unit'] = None

    if r['sample'][0].get('read_length') is not None:
        del r['sample'][0]['read_length']
    r['sample'][0]['sequencing_files']['read_length'] = 301
    r['sample'][0]['sequencing_files']['paired_read_length'] = 301

    n = int(r['sample'][0]['sequencing_run_id'][-3:])
    if n >= 628 and n <= 639:
        r['data_processing'][0]['data_processing_id'] = 'b4fe918f-3c9c-44a9-ab97-5018a22c74cf-007'
    elif n >= 640 and n <= 649:
        r['data_processing'][0]['data_processing_id'] = 'ef134a34-b407-42bb-a614-ab27b9dc15f6-007'
    elif n >= 650 and n <= 659:
        r['data_processing'][0]['data_processing_id'] = '68498761-a491-4f46-8527-5f0a1fbac7d6-007'
    elif n >= 660 and n <= 669:
        r['data_processing'][0]['data_processing_id'] = 'e1a98ff7-1e9a-4a85-8578-12457c4cc947-007'
    elif n >= 670 and n <= 674:
        r['data_processing'][0]['data_processing_id'] = '1ba40a99-eeaa-491f-89c1-16bc814f142b-007'
    elif n >= 675 and n <= 679:
        r['data_processing'][0]['data_processing_id'] = '7bcfc619-448f-45e2-9481-4b4095e3cbd9-007'
    elif n >= 680 and n <= 689:
        r['data_processing'][0]['data_processing_id'] = '100f1e00-2aa0-4be2-978a-002a074a2ef7-007'
    elif n >= 690 and n <= 698:
        r['data_processing'][0]['data_processing_id'] = 'f3cbf7f9-e19f-4635-a58c-003aa861d20d-007'
    if n == 631:
        r['data_processing'][0]['data_processing_id'] = '29a8f809-e83c-4205-906f-6a87426b69b6-007'
    if n == 632:
        r['data_processing'][0]['data_processing_id'] = '29a8f809-e83c-4205-906f-6a87426b69b6-007'
    if n == 657:
        r['data_processing'][0]['data_processing_id'] = '29a8f809-e83c-4205-906f-6a87426b69b6-007'
    if n == 658:
        r['data_processing'][0]['data_processing_id'] = '29a8f809-e83c-4205-906f-6a87426b69b6-007'

    r['data_processing'][0]['primary_annotation'] = True
    r['data_processing'][0]['software_versions'] = 'IgBlast 1.14'

    fname = r['sample'][0]['sequencing_files']['filename']
    fname = fname.replace('.gz','')
    fname = fname + '.merged.unique.igblast.airr.tsv'

    r['data_processing'][0]['data_processing_files'] = [ fname ]
    
airr.write_repertoire(out_file, reps)
