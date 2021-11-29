#
# Conversion script for PRJNA406949 (Bryan Briney's GRP)
#
# Manually put together a simple yaml file but it looks
# like there needs to be 180 repertoires
#
# Meant to be run in docker with /work-data mapping
#
# docker run -v $PWD:/work -v ~/Projects/data:/work-data -it vdjserver/api-js-tapis:latest bash
#

import airr
import csv
import json
import sys

data_dir = '/work-data/immune/BryanBriney'

rep_file = data_dir + '/metadata/PRJNA406949.yaml'
out_file = data_dir + '/metadata/PRJNA406949.airr.json'

sra_file = data_dir + '/metadata/SraRunInfo.csv'

data = airr.load_repertoire(rep_file)
reps = data['Repertoire']

new_reps = []

sra_reader = csv.DictReader(open(sra_file,'r'))
sra_records = []
for r in sra_reader:
    sra_records.append(r)

for r in sra_records:
    print(r['SampleName'])
    if r['SampleName'] == '326797':
        f = r['LibraryName'].split('_')
        if f[2] == '2':
            continue

    found_rep = None
    for rep in reps:
        if rep['subject']['subject_id'] == r['SampleName']:
            found_rep = rep
            break
    if found_rep is None:
        print('not found')
        sys.exit(1)

    nrep = airr.repertoire_template()
    nrep['study'] = found_rep['study']
    nrep['subject'] = found_rep['subject']
    
    nrep['sample'][0]['sample_id'] = r['LibraryName']
    nrep['sample'][0]['sample_type'] = 'leukapheresis'
    nrep['sample'][0]['tissue']['id'] = 'UBERON:0013756'
    nrep['sample'][0]['tissue']['label'] = 'venous blood'
    nrep['sample'][0]['biomaterial_provider'] = 'HemaCare Inc'
    nrep['sample'][0]['tissue_processing'] = 'purified by gradient centrifugation and cryo-preserved'
    nrep['sample'][0]['cell_storage'] = True
    nrep['sample'][0]['template_class'] = "RNA"
    nrep['sample'][0]['library_generation_method'] = "RT(specific)+TS(UMI)+PCR"
    nrep['sample'][0]['pcr_target'][0]['pcr_target_locus'] = "IGH"
    nrep['sample'][0]['complete_sequences'] = "partial"
    nrep['sample'][0]['physical_linkage'] = "none"
    nrep['sample'][0]['sequencing_run_id'] = r['Run']
    nrep['sample'][0]['sequencing_platform'] = r['Model']
    nrep['sample'][0]['sequencing_facility'] = r['CenterName']
    nrep['sample'][0]['file_type'] = 'fastq'
    nrep['sample'][0]['filename'] = r['Run'] + '_R1.fastq.gz'
    nrep['sample'][0]['read_length'] = 251
    nrep['sample'][0]['paired_filename'] = r['Run'] + '_R2.fastq.gz'
    nrep['sample'][0]['paired_read_length'] = 251

    # need to handle 326797 specially
    if r['SampleName'] == '326797':
        f = r['LibraryName'].split('_')
        f[2] = '2'
        ln_2 = '_'.join(f)
        print(ln_2)
        for r_2 in sra_records:
            if r_2['LibraryName'] == ln_2:
                print('add second', ln_2)
                nrep2 = airr.repertoire_template()
                nrep2['sample'][0]['sample_id'] = r_2['LibraryName']
                nrep2['sample'][0]['sample_type'] = 'leukapheresis'
                nrep2['sample'][0]['tissue']['id'] = 'UBERON:0013756'
                nrep2['sample'][0]['tissue']['label'] = 'venous blood'
                nrep2['sample'][0]['biomaterial_provider'] = 'HemaCare Inc'
                nrep2['sample'][0]['tissue_processing'] = 'purified by gradient centrifugation and cryo-preserved'
                nrep2['sample'][0]['cell_storage'] = True
                nrep2['sample'][0]['template_class'] = "RNA"
                nrep2['sample'][0]['library_generation_method'] = "RT(specific)+TS(UMI)+PCR"
                nrep2['sample'][0]['pcr_target'][0]['pcr_target_locus'] = "IGH"
                nrep2['sample'][0]['complete_sequences'] = "partial"
                nrep2['sample'][0]['physical_linkage'] = "none"
                nrep2['sample'][0]['sequencing_run_id'] = r_2['Run']
                nrep2['sample'][0]['sequencing_platform'] = r_2['Model']
                nrep2['sample'][0]['sequencing_facility'] = r_2['CenterName']
                nrep2['sample'][0]['file_type'] = 'fastq'
                nrep2['sample'][0]['filename'] = r_2['Run'] + '_R1.fastq.gz'
                nrep2['sample'][0]['read_length'] = 251
                nrep2['sample'][0]['paired_filename'] = r_2['Run'] + '_R2.fastq.gz'
                nrep2['sample'][0]['paired_read_length'] = 251
                nrep['sample'].append(nrep2['sample'][0])
                break

    f = r['LibraryName'].split('_')
    f = f[1].split('-')
    sn = int(f[0])
    sr = int(f[1])
    num = sn + 6*(sr-1)
    print(r['LibraryName'], sn, sr, num)
    
    nrep['data_processing'][0]['data_processing_files'] = [ nrep['subject']['subject_id'] + '_' + str(num) + '_consensus.airr.tsv.gz' ]
    nrep['data_processing'][0]['data_processing_id'] = '38a5925e-69c7-4ab1-b307-4f930781295e-007'
    nrep['data_processing'][0]['primary_annotation'] = True
    nrep['data_processing'][0]['software_versions'] = 'abstar'
    nrep['data_processing'][0]['data_processing_protocols'] = 'https://github.com/briney/grp_paper'
    nrep['data_processing'][0]['germline_database'] = 'IMGT'

    new_reps.append(nrep)



airr.write_repertoire(out_file, new_reps)
