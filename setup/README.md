# Setup Tapis V3 metadata database

If starting from a brand new database, there are setup steps

# Collections

Before a collection can be used, a `PUT` operation must be performed to initially
create the collection. This is done directly with the Tapis V3 metadata API.
These are the collections to create:

* repertoire

* rearrangement

Given the docker image is setup with authentication, that is the easiest way
to access the Tapis API.

```
docker run -v $PWD:/work -it vdjserver/api-js-tapis:latest bash
curl -X PUT
```

# Aggregations

We need aggregations to support the `facets` capability of the ADC API.

# Indexes