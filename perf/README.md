# Performance tests

The objective is to have a set of queries that correspond to common use
cases by the iReceptor Gateway.

## Repertoire end point

Right now, we do not expect the repertoire collection to be big enough
to require any indexes or performance optimization. One exception might
be for `repertoire_id`.

## Rearrangement end point

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

* `rearrangements_single_repertoire.py` (PASSING): Get all rearrangements for a `repertoire_id`, need to iterate and query each page until all are downloaded.

* `prod_rearrangements_single_repertoire.py` (PASSING): Get all productive rearrangements for a `repertoire_id`, need to iterate and query each page until all are downloaded.

* `rearrangements_multi_repertoire.json` (PASSING): Get rearrangements for a set of `repertoire_ids`. Actually this will only get the first 1000 rearrangements.

* `rearrangements_multi_repertoire.py` (PASSING): Get all rearrangements for a set of `repertoire_id`, need to iterate and query each page until all are downloaded.

* `junction_aa_1.json`, `junction_aa_2.json`, `junction_aa_3.json`, `junction_aa_4.json` (FAILING): junction (CDR3) substring search

### Facet queries

* `by_repertoire_id_single.json`: rearrangement count for a `repertoire_id`

* `by_repertoire_id_multiple.json`: rearrangement count for a set of `repertoire_id`

## Asynchronous queries

### VDJServer ADC Asynchronous API

### Raw requests to the Tapis LRQ end point

The long-running query (LRQ) end point for Tapis provides the ability to
run queries to completion without worrying about the timeout on the
normal query end points. The raw output of the query is sent to a file
in folder `/irplus/data/lrqdata`. VDJServer encapsulates LRQ with the
ADC Asynchronous API, processes the raw output into a final formatted
file, and creates a postit for no-auth download. It does not publicize the
original LRQ identifier but instead encapsulates with a Tapis metadata record
where additional information is also stored.

If its needed to test Tapis LRQ directly, there are a few examples. A
token is required which can be obtained with the `get_token.py` script
in the `setup` directory. In the following curl commands, adjust the
collection if necessary.

SIMPLE query of a repertoire_id, can be run against the repertoire or rearrangement collection.

```
curl -H 'content-type: application/json' -H 'Authorization: Bearer TOKEN' --data @raw_lrq.json https://vdj-agave-api.tacc.utexas.edu/meta/v3/v1airr/repertoire_0/_lrq

curl -H 'content-type: application/json' -H 'Authorization: Bearer TOKEN' --data @raw_lrq.json https://vdj-agave-api.tacc.utexas.edu/meta/v3/v1airr/rearrangement_0/_lrq
```

The SIMPLE query type does not support `from` or `size` to limit results, it
always puts the full result set in the output file. The AGGREGATION query type
allows any aggregation pipeline to be provided. This can do more than counting
for the `facets` parameter of ADC API. It provides complete control over any
type of query. There are some example queries.

AGGREGATION query of a repertoire_id, can be run against the repertoire or rearrangement collection.

```
curl -H 'content-type: application/json' -H 'Authorization: Bearer TOKEN' --data @raw_lrq_aggr.json https://vdj-agave-api.tacc.utexas.edu/meta/v3/v1airr/repertoire_0/_lrq

curl -H 'content-type: application/json' -H 'Authorization: Bearer TOKEN' --data @raw_lrq_aggr.json https://vdj-agave-api.tacc.utexas.edu/meta/v3/v1airr/rearrangement_0/_lrq

curl -H 'content-type: application/json' -H 'Authorization: Bearer TOKEN' --data @raw_lrq_aggr_count.json https://vdj-agave-api.tacc.utexas.edu/meta/v3/v1airr/rearrangement_0/_lrq
```

Successfully submitted queries return an`lrq_id` which can be used to check the status.

```
curl -H 'content-type: application/json' -H 'Authorization: Bearer TOKEN' https://vdj-agave-api.tacc.utexas.edu/meta/v3/LRQ/vdjserver.org/lrq_id | jq
```

LRQs can be provided with a notification url which is called when the
query is finished. VDJServer receives these notifications which triggers
the processing of the raw query output in its final (AIRR-compliant)
formatted version. There is an example notification in `raw_lrq_notify.json`
which can be used to simulate a notification coming from Tapis. The file
will need to be modified with the appropriate `lrq_id`, and the notification
sent to the end point with the corresponding `query_id`.

```
curl -v -k -H 'content-type: application/json' --data @raw_lrq_notify.json https://vdj-staging.tacc.utexas.edu/airr/async/v1/notify/query_id | jq
```
