#
# Conversion script for Cowel Lab Ovarian study
#
# First run the standard convert_repertoires.py
# Then run this to do specific cleanup
#


# Note: had problems with publishing the initial project so created a
# new clean project to publish. However, we did not copy over all of
# the study metadata, so this initial metadata was generated from the
# old project, then updated with uuids and info from the new project.
#

import airr

rep_file = './repertoires.airr.json'
out_file = './Ovarian.airr.json'

data = airr.load_repertoire(rep_file)
reps = data['Repertoire']

for r in reps:
    # hand coded stuff
    r['study']['vdjserver_uuid'] = '3276777473314001386-242ac116-0001-012'
    r['study']['study_id'] = r['study']['vdjserver_uuid']
    r['study']['keywords_study'] = ['contains_tcr']
    r['study']['study_title'] = 'Biophysicochemical Motifs in T cell Receptor Sequences as a Potential Biomarker for High-Grade Serous Ovarian Carcinoma'
    r['study']['study_description'] = 'We previously showed, in a pilot study with publicly available data, that T cell receptor (TCR) repertoires from tumor infiltrating lymphocytes (TILs) could be distinguished from adjacent healthy tissue repertoires by the presence of TCRs bearing specific, biophysicochemical motifs in their antigen binding regions. We hypothesized that such motifs might allow development of a novel approach to cancer detection. The motifs were cancer specific and achieved high classification accuracy: we found distinct motifs for breast versus colorectal cancer-associated repertoires, and the colorectal cancer motif achieved 93% accuracy, while the breast cancer motif achieved 94% accuracy. In the current study, we sought to determine whether such motifs exist for ovarian cancer, a cancer type for which detection methods are urgently needed. We made two significant advances over the prior work. First, the prior study used patient-matched TILs and healthy repertoires, collecting healthy tissue adjacent to the tumors. The current study collected TILs from patients with high-grade serous ovarian carcinoma (HGSOC) and healthy ovary repertoires from cancer-free women undergoing hysterectomy/salpingo-oophorectomy for benign disease. Thus, the classification task is distinguishing women with cancer from women without cancer. Second, in the prior study, classification accuracy was measured by patient-hold-out cross-validation on the training data. In the current study, classification accuracy was additionally assessed on an independent cohort not used during model development to establish the generalizability of the motif to unseen data. Classification accuracy was 95% by patient-hold-out cross-validation on the training set and 80% when the model was applied to the blinded test set. The results on the blinded test set demonstrate a biophysicochemical TCR motif found overwhelmingly in women with HGSOC but rarely in women with healthy ovaries, strengthening the proposal that cancer detection approaches might benefit from incorporation of TCR motif-based biomarkers. Furthermore, these results call for studies on large cohorts to establish higher classification accuracies, as well as for studies in other cancer types.'
    r['study']['submitted_by'] = 'Scott Christley <scott.christley@utsouthwestern.edu>'
    r['study']['study_type']['id'] = "C15206"
    r['study']['study_type']['value'] = "Clinical Study"

    for entry in r['sample']:
        entry['library_generation_method'] = 'RT(specific)+PCR'
        entry['library_generation_protocol'] = 'Adaptive Biotechnologies'
        entry['library_generation_kit_version'] = 'v2'
        entry['complete_sequences'] = 'partial'
        entry['physical_linkage'] = 'none'
        entry['cell_subset'] = None
        entry['sequencing_files']['file_type'] = 'fasta'
        entry['sequencing_files']['read_direction'] = 'forward'

    r['subject']['organism']['id'] = "9606"
    a = r['subject']['age']
    if a is not None:
        r['subject']['age_min'] = int(a)
        r['subject']['age_max'] = int(a)
        r['subject']['age_unit']['id'] = 'UO_0000036'
        r['subject']['age_unit']['value'] = 'year'
    del r['subject']['age']

    r['data_processing'][0]['data_processing_id'] = '262bfb78-4758-4d0d-819c-49f9661d69ed-007'
    r['data_processing'][0]['primary_annotation'] = True
    r['data_processing'][0]['software_versions'] = 'IgBlast 1.14'

    files = []
    fname = ''
    for entry in r['sample']:
        fname = entry['sequencing_files']['filename']
        fname = fname.replace('.fasta','')
        fname = fname + '.igblast.airr.tsv'
        files.append(fname)
    r['data_processing'][0]['data_processing_files'] = [ ','.join(files) ]

airr.write_repertoire(out_file, reps)
