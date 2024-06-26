# Setup Tapis V3 metadata database

If starting from a brand new database, there are setup steps. We rely upon the docker image
and a valid `.env` file for running many commands. The following bash alias simplifies
the docker command. It expects the `setup` directory is your current directory.

```
alias vdj-airr='docker run -v $PWD:/work -v $PWD/../../.env:/api-js-tapis/.env -it vdjserver/api-js-tapis:latest'
```

# Collections

Before a collection can be used, a `PUT` operation must be performed to initially
create the collection. This is done directly with the Tapis V3 metadata API.
These are the collections to create:

* repertoire

* rearrangement

* query

* statistics

Get a token for the admin account with the `vdj_airr` client, which has access to
the Tapis Meta/V3 API. Given a docker image, here is a simple way to get a token.
It relies upon the .env file for authentication.

```
vdj-airr python3 /work/get_token.py
```

Then a curl PUT command where `TOKEN` and `DBNAME` are replaced with
the appropriate values. We create two sets of collections, one for
loading and the other for query.

```
curl -X PUT -H 'Content-Type: application/json' -H 'Authorization: Bearer TOKEN' https://vdj-agave-api.tacc.utexas.edu/meta/v3/DBNAME/repertoire_0
curl -X PUT -H 'Content-Type: application/json' -H 'Authorization: Bearer TOKEN' https://vdj-agave-api.tacc.utexas.edu/meta/v3/DBNAME/rearrangement_0
curl -X PUT -H 'Content-Type: application/json' -H 'Authorization: Bearer TOKEN' https://vdj-agave-api.tacc.utexas.edu/meta/v3/DBNAME/repertoire_1
curl -X PUT -H 'Content-Type: application/json' -H 'Authorization: Bearer TOKEN' https://vdj-agave-api.tacc.utexas.edu/meta/v3/DBNAME/rearrangement_1
curl -X PUT -H 'Content-Type: application/json' -H 'Authorization: Bearer TOKEN' https://vdj-agave-api.tacc.utexas.edu/meta/v3/DBNAME/query
curl -X PUT -H 'Content-Type: application/json' -H 'Authorization: Bearer TOKEN' https://vdj-agave-api.tacc.utexas.edu/meta/v3/DBNAME/statistics_0
curl -X PUT -H 'Content-Type: application/json' -H 'Authorization: Bearer TOKEN' https://vdj-agave-api.tacc.utexas.edu/meta/v3/DBNAME/statistics_1
```

A curl GET command will verify all the collections in the database.

```
curl -X GET -H 'Content-Type: application/json' -H 'Authorization: Bearer TOKEN' https://vdj-agave-api.tacc.utexas.edu/meta/v3/DBNAME
```

# Aggregations

We need aggregations to support the `facets` capability of the ADC API. All aggregations
for a collection are loaded at once, so if an aggregation is changed, all of them needed
to be reloaded.

RestHeart does not support dynamic aggregations. Instead, each must be pre-defined and
made available at a specific entry point. The aggregation for `facets` uses an URI of
the same name. The `aggregations.json` contains all of the aggregations. Currently they
are the same for all collections. The `setup_aggregations.py` script can be used to
load (or update) the aggregations

```
vdj-airr python3 /work/setup_aggregations.py /work/aggregations.json
```

# Indexes

Indexes are defined specifically for each collection. Indexes need to be deleted before
they can be updated, so each index should be managed separately as we don't want to
recreate all the indexes every time one changes.

As part of the double-buffering scheme, there are two sets of collections, one for production
queries and one for data loading. In the following commands, `rearrangement_change` should be
modified to `rearrangement_0` or `rearrangement_1` depending upon the appropriate collection set.
The data loading collection should have its `junction_suffixes` index deleted for optimization, but
it seems that the other indexes do not effect data loading performance to any noticeable degree.
The command to delete the `junction_suffixes` index.

```
vdj-airr python3 /work/delete_index.py.py rearrangement_change junction_suffixes
```

Because the rearrangement collection is so large, the
`create_index.py` almost always times out with an error. The database
is still creating the index though, but may take awhile to finish. You
can use the `show_indexes.py` script to verify that the index creation
was started.

```
vdj-airr python3 /work/show_indexes.py rearrangement_change
```

## Rearrangement Indexes

* repertoire_id

```
vdj-airr python3 /work/create_index.py rearrangement_change repertoire_id /work/repertoire_id.json
```

* load_set

This index is to support the loading of datasets in chunks (load sets).

```
vdj-airr python3 /work/create_index.py rearrangement_change load_set /work/repertoire_id_and_load_set.json
```

* rep_v_call

Compound index for V allele call searches for given repertoires.

```
vdj-airr python3 /work/create_index.py rearrangement_change rep_v_call /work/repertoire_id_and_v_call.json
```

* v_call

V allele call search.

```
vdj-airr python3 /work/create_index.py rearrangement_change v_call /work/v_call.json
```

* rep_d_call

Compound index for D allele call searches for given repertoires.

```
vdj-airr python3 /work/create_index.py rearrangement_change rep_d_call /work/repertoire_id_and_d_call.json
```

* d_call

D allele call search.

```
vdj-airr python3 /work/create_index.py rearrangement_change d_call /work/d_call.json
```

* rep_j_call

Compound index for J allele call searches for given repertoires.

```
vdj-airr python3 /work/create_index.py rearrangement_change rep_j_call /work/repertoire_id_and_j_call.json
```

* j_call

J allele call search.

```
vdj-airr python3 /work/create_index.py rearrangement_change j_call /work/j_call.json
```

* rep_locus

Compound index for locus search for given repertoires.

```
vdj-airr python3 /work/create_index.py rearrangement_change rep_locus /work/repertoire_id_and_locus.json
```

* locus

Locus search.

```
vdj-airr python3 /work/create_index.py rearrangement_change locus /work/locus.json
```

* junction_aa_length, rep_juction_aa_length

```
vdj-airr python3 /work/create_index.py rearrangement_change junction_aa_length /work/junction_aa_length.json
vdj-airr python3 /work/create_index.py rearrangement_change rep_junction_aa_length /work/repertoire_id_and_junction_aa_length.json
```

* productive

```
vdj-airr python3 /work/create_index.py rearrangement_change productive /work/repertoire_id_and_productive.json
```

* rep_v_gene, rep_v_subgroup, rep_d_gene, rep_d_subgroup, rep_j_gene, rep_j_subgroup

Compound indexes for the custom gene annotation fields.

```
vdj-airr python3 /work/create_index.py rearrangement_change rep_v_gene /work/repertoire_id_and_v_gene.json
vdj-airr python3 /work/create_index.py rearrangement_change rep_v_subgroup /work/repertoire_id_and_v_subgroup.json
vdj-airr python3 /work/create_index.py rearrangement_change rep_d_gene /work/repertoire_id_and_d_gene.json
vdj-airr python3 /work/create_index.py rearrangement_change rep_d_subgroup /work/repertoire_id_and_d_subgroup.json
vdj-airr python3 /work/create_index.py rearrangement_change rep_j_gene /work/repertoire_id_and_j_gene.json
vdj-airr python3 /work/create_index.py rearrangement_change rep_j_subgroup /work/repertoire_id_and_j_subgroup.json
```

* v_gene, v_subgroup, d_gene, d_subgroup, j_gene, j_subgroup

These fields are not yet defined by AIRR but are useful for querying gene annotations without doing an inaccurate and expensive substring search. These indexes
might not be needed by the iReceptor gateway, so maybe optional.

```
vdj-airr python3 /work/create_index.py rearrangement_change v_gene /work/v_gene.json
vdj-airr python3 /work/create_index.py rearrangement_change v_subgroup /work/v_subgroup.json
vdj-airr python3 /work/create_index.py rearrangement_change d_gene /work/d_gene.json
vdj-airr python3 /work/create_index.py rearrangement_change d_subgroup /work/d_subgroup.json
vdj-airr python3 /work/create_index.py rearrangement_change j_gene /work/j_gene.json
vdj-airr python3 /work/create_index.py rearrangement_change j_subgroup /work/j_subgroup.json
```

* junction_suffixes

VDJServer optimization for doing substring searches on junction_aa. We create a field vdjserver_junction_substrings which contains all substrings
of length 4 or greater and put them in a list. We then convert substring searches (contains op) into exact searches on the list.

```
vdj-airr python3 /work/create_index.py rearrangement_change junction_suffixes /work/junction_suffixes.json
```

* junction_substrings (DEPRECATED)

VDJServer optimization for doing substring searches on junction_aa. We create a field vdjserver_junction_substrings which contains all substrings
of length 4 or greater and put them in a list. We then convert substring searches (contains op) into exact searches on the list.

```
vdj-airr python3 /work/create_index.py rearrangement_change junction_substrings /work/junction_substrings.json
```

