#
# Conversion script for PRJNA248475
#
# First run the standard convert_repertoires.py
# Then run this to do specific cleanup
#

import airr

rep_file = './PRJNA248475.airr.json'

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
    r['sample'][0]['cell_subset'] = null

    a = r['subject']['age'].split(' ')
    r['subject']['age_min'] = int(a[0])
    r['subject']['age_max'] = int(a[0])
    r['subject']['age_unit']['id'] = 'UO_0000036'
    r['subject']['age_unit']['value'] = 'year'
    #airr.schema.RepertoireSchema.validate_object(r)

airr.write_repertoire(rep_file, reps)
