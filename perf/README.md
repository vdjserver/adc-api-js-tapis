# Performance tests

The objective is to have a set of queries that correspond to common use
cases by the iReceptor+ gateway.

## Repertoire entry point

Right now, we do not expect the repertoire collection to be big enough
to require any indexes or performance optimization. One exception might
be for `repertoire_id`.

## Rearrangement entry point

To run a single query JSON:

```
curl --data @filename.json https://vdjserver.org/airr/v1/rearrangement
```

To run the python scripts, you might want to use the `airrc/airr-standards` docker image which has the latest AIRR tools and dependencies already installed.

```
docker run -v $PWD:/work -it airrc/airr-standards bash
cd /work
python3 script.py
```

### Normal queries

* `rearrangements_single_repertoire.json` (PASSING): Get rearrangements for a `repertoire_id`. Actually this will only get the first 1000 rearrangements.

* `rearrangements_single_repertoire.py` (FAILING): Get all rearrangements for a `repertoire_id`, need to iterate and query each page until all are downloaded.

* `prod_rearrangements_single_repertoire.py` (FAILING): Get all productive rearrangements for a `repertoire_id`, need to iterate and query each page until all are downloaded.

* `rearrangements_multi_repertoire.json` (PASSING): Get rearrangements for a set of `repertoire_ids`. Actually this will only get the first 100 rearrangements.

* `rearrangements_multi_repertoire.py` (FAILING): Get all rearrangements for a set of `repertoire_id`, need to iterate and query each page until all are downloaded.

* all productive (or non-productive) rearrangements for a set of `repertoire_id`

* junction (CDR3) substring search

### Facet queries

* `by_repertoire_id_single.json`: rearrangement count for a `repertoire_id`

* `by_repertoire_id_multiple.json`: rearrangement count for a set of `repertoire_id`
