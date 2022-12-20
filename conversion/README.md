# Conversion scripts

These are scripts for doing various conversion tasks. Many might be one-time tasks to
correct data curation errors, but we also anticipate major conversion when upgrading
to a new version of the AIRR schema.

Most of these scripts are designed to within the docker image
with a valid `.env` file. The following bash alias simplifies
the docker command. It expects the `conversion` directory is your current directory.

```
alias vdj-airr='docker run -v $PWD:/work -v $PWD/../../.env:/api-js-tapis/.env -it vdjserver/api-js-tapis:latest'
```

# Miscellaneous scripts

* `fix_species.py`: This script is to fix the species ontology ID in Subject metadata
  which is incorrect either because `NCBITaxon` is not all uppercase, or the ID
  is `9096` instead of `9606` for human.

To evaluate which metadata entries will be modified without doing the modification:

```
vdj-airr python3 /work/fix_species.py
```

To actually perform the modifications:

```
vdj-airr python3 /work/fix_species.py --convert
```

# AIRR Schema V1.3 to V1.4

* `v1.3_to_v1.4.py`: This script is to convert AIRR v1.3 schema to v1.4.

To evaluate which metadata entries will be modified without doing the modification:

```
vdj-airr python3 /work/v1.3_to_v1.4.py
```

To actually perform the modifications:

```
vdj-airr python3 /work/v1.3_to_v1.4.py --convert
```

* `fix_v1.4.py`: After running `v1.3_to_v1.4.py` and reloading the metadata, I realized
  that I missed `Subject`, which had many old non-compliant record, plus there was some MHC
  genotypes in a pre-v1.4 form. This script was easier because they are all AIRR records, so
  I can expect that they pass validate.

```
vdj-airr python3 /work/fix_v1.4.py
```

To actually perform the modifications:

```
vdj-airr python3 /work/vfix_v1.4.py --convert
```

There is still some stuff to do:

# convert mhc for the Adaptive studies, did IPA do it?

# there are VDJServer-related fields that we need to consolidate into a sub-object. What name
  to use: `x-vdjserver`, `vdjserver`, `vdjserver_custom`?  Hmm, should be snakecase, so I 
  think simple `vdjserver` should work.

# have validation routines which for VDJServer schemas based upon AIRR validation
