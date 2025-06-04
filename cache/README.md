# Setup ADC Download Cache

```
curl https://vdjserver.org/airr/v1/admin/adc/registry | jq
```

To manually insert/enable repositories in the cache.

## VDJServer

```
curl --data @cache_vdjserver_repository.json -H 'content-type:application/json' -H "Authorization: Bearer $JWT" https://vdjserver.org/airr/v1/admin/adc/registry
```

## iReceptor Public Archive has the following repositories:

```
curl --data @cache_ipa1_repository.json -H 'content-type:application/json' -H "Authorization: Bearer $JWT" https://vdjserver.org/airr/v1/admin/adc/registry
curl --data @cache_ipa2_repository.json -H 'content-type:application/json' -H "Authorization: Bearer $JWT" https://vdjserver.org/airr/v1/admin/adc/registry
curl --data @cache_ipa3_repository.json -H 'content-type:application/json' -H "Authorization: Bearer $JWT" https://vdjserver.org/airr/v1/admin/adc/registry
curl --data @cache_ipa4_repository.json -H 'content-type:application/json' -H "Authorization: Bearer $JWT" https://vdjserver.org/airr/v1/admin/adc/registry
curl --data @cache_ipa5_repository.json -H 'content-type:application/json' -H "Authorization: Bearer $JWT" https://vdjserver.org/airr/v1/admin/adc/registry
curl --data @cache_ipa6_repository.json -H 'content-type:application/json' -H "Authorization: Bearer $JWT" https://vdjserver.org/airr/v1/admin/adc/registry

curl --data @cache_covid19-1_repository.json -H 'content-type:application/json' -H "Authorization: Bearer $JWT" https://vdjserver.org/airr/v1/admin/adc/registry
curl --data @cache_covid19-2_repository.json -H 'content-type:application/json' -H "Authorization: Bearer $JWT" https://vdjserver.org/airr/v1/admin/adc/registry
curl --data @cache_covid19-3_repository.json -H 'content-type:application/json' -H "Authorization: Bearer $JWT" https://vdjserver.org/airr/v1/admin/adc/registry
curl --data @cache_covid19-4_repository.json -H 'content-type:application/json' -H "Authorization: Bearer $JWT" https://vdjserver.org/airr/v1/admin/adc/registry

curl --data @cache_roche_repository.json -H 'content-type:application/json' -H "Authorization: Bearer $JWT" https://vdjserver.org/airr/v1/admin/adc/registry
curl --data @cache_t1d-1_repository.json -H 'content-type:application/json' -H "Authorization: Bearer $JWT" https://vdjserver.org/airr/v1/admin/adc/registry
curl --data @cache_t1d-2_repository.json -H 'content-type:application/json' -H "Authorization: Bearer $JWT" https://vdjserver.org/airr/v1/admin/adc/registry

curl --data @cache_hpap_repository.json -H 'content-type:application/json' -H "Authorization: Bearer $JWT" https://vdjserver.org/airr/v1/admin/adc/registry
```


## SciReptor

```
curl --data @cache_scireptor_repository.json -H 'content-type:application/json' -H "Authorization: Bearer $JWT" https://vdjserver.org/airr/v1/admin/adc/registry
```


## University of Meunster

```
curl --data @cache_meunster_repository.json -H 'content-type:application/json' -H "Authorization: Bearer $JWT" https://vdjserver.org/airr/v1/admin/adc/registry
```
