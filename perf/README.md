# Performance tests

The objective is to have a set of queries that correspond to common use
cases by the iReceptor+ gateway.

## Repertoire

Right now, we do not expect the repertoire collection to be big enough
to require any indexes or performance optimization. One exception might
be for `repertoire_id`.

## Rearrangement

### Normal queries

* all rearrangements for a `repertoire_id`

* all productive (or non-productive) rearrangements for a `repertoire_id`

* all rearrangements for a set of `repertoire_ids`

* all productive (or non-productive) rearrangements for a set of `repertoire_id`

* junction (CDR3) substring search

### Facet queries

* rearrangement count by `repertoire_id`