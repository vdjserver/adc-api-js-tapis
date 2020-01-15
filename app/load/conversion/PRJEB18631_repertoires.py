#
# clean up repertoire metadata after conversion
#

import airr

rep_file = './repertoires.airr.json'
out_file = './PRJEB18631.airr.json'

data = airr.load_repertoire(rep_file)
reps = data['Repertoire']

for r in reps:
    # hand coded stuff
    r['study']['keywords_study'] = ['contains_ig']
    r['study']['submitted_by'] = 'Scott Christley <scott.christley@utsouthwestern.edu>'

    r['study']['study_type']['id'] = "C147138"
    r['study']['study_type']['value'] = "Observational Study Model"
    r['sample'][0]['library_generation_method'] = 'RT(specific)+PCR'
    r['sample'][0]['complete_sequences'] = 'partial'
    r['sample'][0]['physical_linkage'] = 'none'
    r['sample'][0]['pcr_target'][0]['pcr_target_locus'] = 'IGH'
    r['subject']['organism']['id'] = "10090"
    del r['subject']['age']
    r['subject']['age_min'] = 8
    r['subject']['age_max'] = 10
    r['subject']['age_unit']['id'] = 'UO_0000034'
    r['subject']['age_unit']['value'] = 'week'
    r['subject']['diagnosis'] = None
    if r['sample'][0]['cell_subset']['value'] == 'pre-B cell':
        r['sample'][0]['cell_subset']['id'] = 'CL_0000817'
        r['sample'][0]['cell_subset']['value'] = 'precursor B cell'
    if r['sample'][0]['cell_subset']['value'] == 'naive B cell':
        r['sample'][0]['cell_subset']['id'] = 'CL_0000788'
    if r['sample'][0]['cell_subset']['value'] == 'long lived plasma cell':
        r['sample'][0]['cell_subset']['id'] = 'CL_0000974'

    r['data_processing'][0]['data_processing_id'] = 'e1a98ff7-1e9a-4a85-8578-12457c4cc947-007'

    #airr.schema.RepertoireSchema.validate_object(r)

airr.write_repertoire(out_file, reps)
