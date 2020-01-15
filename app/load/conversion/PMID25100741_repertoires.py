#
# Conversion script for PMID25100741 (PRJNA248475)
#
# First run the standard convert_repertoires.py
# Then run this to do specific cleanup
#

import airr

rep_file = './repertoires.airr.json'
out_file = './PMID25100741.airr.json'

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
    r['subject']['organism']['id'] = "9606"
    r['sample'][0]['cell_subset'] = None

    a = r['subject']['age'].split(' ')
    r['subject']['age_min'] = int(a[0])
    r['subject']['age_max'] = int(a[0])
    r['subject']['age_unit']['id'] = 'UO_0000036'
    r['subject']['age_unit']['value'] = 'year'
    del r['subject']['age']
    r['subject']['diagnosis'] = None

    if r['subject']['sex'] == 'Male':
        r['subject']['sex'] = 'male'
    if r['subject']['sex'] == 'Female':
        r['subject']['sex'] = 'female'
    r['data_processing'][0]['data_processing_id'] = '72775635-b44e-41ac-8acc-a6d92dac052c-007'
    r['data_processing'][0]['primary_annotation'] = True
    fname = r['sample'][0]['sequencing_files']['filename']
    fsplit = fname.split('.')
    fname = fsplit[0] + '_assemble-pass_collapse-unique.igblast.airr.tsv'
    r['data_processing'][0]['final_rearrangement_file'] = fname

    #airr.schema.RepertoireSchema.validate_object(r)

airr.write_repertoire(out_file, reps)
