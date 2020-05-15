# Setup Tapis V3 metadata database

If starting from a brand new database, there are setup steps

# Collections

Before a collection can be used, a `PUT` operation must be performed to initially
create the collection. This is done directly with the Tapis V3 metadata API.
These are the collections to create:

* repertoire

* rearrangement

Get a token for the admin account with the `vdj_airr` client, which has access to
the Tapis Meta/V3 API. Given the docker image is setup with authentication, here is
a simple way to get a token.

```
docker run -v $PWD:/work -it vdjserver/api-js-tapis:latest python3 /work/get_token.py
```

Then a curl PUT command where `TOKEN` and `DBNAME` are replaced with the appropriate values.

```
curl -X PUT -H 'Content-Type: application/json' -H 'Authorization: Bearer TOKEN' https://vdj-agave-api.tacc.utexas.edu/meta/v3/DBNAME/repertoire
curl -X PUT -H 'Content-Type: application/json' -H 'Authorization: Bearer TOKEN' https://vdj-agave-api.tacc.utexas.edu/meta/v3/DBNAME/rearrangement
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
docker run -v $PWD:/work -it vdjserver/api-js-tapis:latest python3 /work/setup_aggregations.py /work/aggregations.json
```

# Indexes

Indexes are defined specifically for each collection. Indexes need to be deleted before
they can be updated, so each index should be managed separately as we don't want to
recreate all the indexes every time one changes.

Because the rearrangement collection is so large, the
`create_index.py` almost always times out with an error. The database
is still creating the index though, but may take awhile to finish. You
can use the `show_indexes.py` script to verify that the index creation
was started.

```
docker run -v $PWD:/work -it vdjserver/api-js-tapis:latest python3 /work/show_indexes.py rearrangement
```

## Rearrangement Indexes

* repertoire_id

```
docker run -v $PWD:/work -it vdjserver/api-js-tapis:latest python3 /work/create_index.py rearrangement repertoire_id /work/repertoire_id.json
```

* load_set

This index is to support the loading of datasets in chunks (load sets).

```
docker run -v $PWD:/work -it vdjserver/api-js-tapis:latest python3 /work/create_index.py rearrangement load_set /work/repertoire_id_and_load_set.json
```

* rep_v_call

Compound index for V gene searches for given repertoires.

```
docker run -v $PWD:/work -it vdjserver/api-js-tapis:latest python3 /work/create_index.py rearrangement rep_v_call /work/repertoire_id_and_v_call.json
```

* rep_j_call

Compound index for J gene searches for given repertoires.

```
docker run -v $PWD:/work -it vdjserver/api-js-tapis:latest python3 /work/create_index.py rearrangement rep_j_call /work/repertoire_id_and_j_call.json
```

* junction_substrings

VDJServer optimization for doing substring searches on junction_aa. We create a field vdjserver_junction_substrings which contains all substrings
of length 4 or greater and put them in a list. We then convert substring searches (contains op) into exact searches on the list.

```
docker run -v $PWD:/work -it vdjserver/api-js-tapis:latest python3 /work/create_index.py rearrangement junction_substrings /work/junction_substrings.json
```

* productive

```
docker run -v $PWD:/work -it vdjserver/api-js-tapis:latest python3 /work/create_index.py rearrangement productive /work/repertoire_id_and_productive.json
```
