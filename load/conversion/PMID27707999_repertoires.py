#
# Conversion script for PMID27707999 (PRJNA283640)
#
# First run the standard convert_repertoires.py
# Then run this to do specific cleanup
#

import airr

rep_file = './repertoires.airr.json'
out_file = './PMID27707999.airr.json'

data = airr.load_repertoire(rep_file)
reps = data['Repertoire']

for r in reps:
    # hand coded stuff
    r['study']['keywords_study'] = ['contains_ig']
    r['study']['submitted_by'] = 'Scott Christley <scott.christley@utsouthwestern.edu>'

    r['study']['study_type']['id'] = "C147138"
    r['study']['study_type']['value'] = "Observational Study Model"
    r['sample'][0]['library_generation_method'] = 'RT(specific+UMI)+PCR'
    r['sample'][0]['complete_sequences'] = 'partial'
    r['sample'][0]['physical_linkage'] = 'none'
    r['sample'][0]['pcr_target'][0]['pcr_target_locus'] = 'IGH'
    r['subject']['organism']['id'] = "10090"

    if 'live' in r['sample'][0]['cell_phenotype']:
        r['sample'][0]['cell_subset']['id'] = 'CL_0000844'
        r['sample'][0]['cell_subset']['value'] = 'germinal center B Cell'

    if 'lambda' in r['sample'][0]['cell_phenotype']:
        r['sample'][0]['cell_subset']['id'] = 'CL_0000236'
        r['sample'][0]['cell_subset']['value'] = 'B Cell'

    del r['subject']['age']
    r['subject']['age_min'] = 6
    r['subject']['age_max'] = 10
    r['subject']['age_unit']['id'] = 'UO_0000034'
    r['subject']['age_unit']['value'] = 'week'
    r['subject']['diagnosis'] = None

    r['data_processing'][0]['data_processing_id'] = 'f606f648-87fa-40f1-8bc8-3d7f3648873c-007'
    r['data_processing'][0]['primary_annotation'] = True
    fname = r['sample'][0]['sequencing_files']['filename']
    fsplit = fname.split('.')
    fname = fsplit[0] + '_assemble-pass_collapse-unique.igblast.airr.tsv'
    r['data_processing'][0]['final_rearrangement_file'] = fname

    #airr.schema.RepertoireSchema.validate_object(r)

airr.write_repertoire(out_file, reps)
