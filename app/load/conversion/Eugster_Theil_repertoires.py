#
# Conversion script for Eugster Lab (Theil et al 2016)
#
# First run the standard convert_repertoires.py
# Then run this to do specific cleanup
#

import airr

rep_file = './repertoires.airr.json'
out_file = './Eugster_Theil.airr.json'

data = airr.load_repertoire(rep_file)
reps = data['Repertoire']

for r in reps:
    # hand coded stuff
    r['study']['study_id'] = r['study']['vdjserver_uuid']
    r['study']['keywords_study'] = ['contains_tcr']
    r['study']['submitted_by'] = 'Scott Christley <scott.christley@utsouthwestern.edu>'
    r['study']['study_type']['id'] = "C147138"
    r['study']['study_type']['value'] = "Observational Study Model"

    for entry in r['sample']:
        entry['library_generation_method'] = 'RT(specific)+PCR'
        entry['complete_sequences'] = 'partial'
        entry['physical_linkage'] = 'none'
        entry['pcr_target'][0]['pcr_target_locus'] = 'TRA'
        if entry['cell_subset']['value'] == 'CD8':
            entry['cell_subset']['id'] = 'CL_0000625'
            entry['cell_subset']['value'] = 'CD8-positive, alpha-beta T cell'
        if entry['cell_subset']['value'] == 'CD4':
            entry['cell_subset']['id'] = 'CL_0000624'
            entry['cell_subset']['value'] = 'CD4-positive, alpha-beta T cell'
        if entry['cell_subset']['value'] == 'Treg ':
            entry['cell_subset']['id'] = 'CL_0000792'
            entry['cell_subset']['value'] = 'CD4-positive, CD25-positive, alpha-beta regulatory T cell'

    r['subject']['organism']['id'] = "9606"
    a = r['subject']['age'].replace(' yrs','')
    a = a.replace('yrs','')
    r['subject']['age_min'] = int(a)
    r['subject']['age_max'] = int(a)
    r['subject']['age_unit']['id'] = 'UO_0000036'
    r['subject']['age_unit']['value'] = 'year'
    del r['subject']['age']

    if r['subject']['subject_id'] == 'Patient 1':
        r['subject']['diagnosis'][0]['study_group_description'] = 'graft-versus-host disease'
        r['subject']['diagnosis'][0]['disease_diagnosis'] = 'B-cell chronic lymphocytic leukemia'
        r['subject']['diagnosis'][0]['intervention'] = 'adoptive T cell therapy'
    elif r['subject']['subject_id'] == 'Patient 2':
        r['subject']['diagnosis'][0]['study_group_description'] = 'graft-versus-host disease'
        r['subject']['diagnosis'][0]['disease_diagnosis'] = 'acute myeloid leukemia'
        r['subject']['diagnosis'][0]['intervention'] = 'adoptive T cell therapy'
    else:
        r['subject']['diagnosis'][0]['study_group_description'] = 'T cell donor'

    r['data_processing'][0]['data_processing_id'] = '397ff470-1562-4e25-9fac-6000dc97546b-007'
    r['data_processing'][0]['primary_annotation'] = True

    files = []
    fname = ''
    for entry in r['sample']:
        fname = entry['sequencing_files']['filename']
        fname = fname.replace('.gz','')
        fname = fname + '.unique.igblast.airr.tsv'
        files.append(fname)
    r['data_processing'][0]['final_rearrangement_file'] = ','.join(files)

    #airr.schema.RepertoireSchema.validate_object(r)

airr.write_repertoire(out_file, reps)
