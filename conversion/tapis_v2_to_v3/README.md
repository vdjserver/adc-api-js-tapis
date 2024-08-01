# VDJServer ADC Repository migration from Tapis V2 to V3

As part of the migration, the ADC project load/unload/reload and the
ADC download cache have been moved from the web-api into this service.
Need to migrate the meta records for both of those tasks. The object
names have been changed to be more consistent with other V3 objects and
also to have a distinct break from V2. All of these objects have schema
defined so we should use the vdj-tapis-js functions so that they are
validated in the migration.

We assume that V2 API is not available and that the data to be migrated
resides in a JSON file.

## Docker

We build a specialized docker image that brings in vdj-tapis-js and vdjserver-schema.
Because docker does not allow reference to files outside of the build context, you
need to issue the command at the `adc-api-js-tapis` directory.

```
docker build -f conversion/tapis_v2_to_v3/Dockerfile -t tapis-conversion .
```

Setup an alias to simplify running the container.

```
alias tapis-conversion='docker run -v $HOME/Projects:/work --env-file ../.env -it tapis-conversion bash'
```

## Singleton object (ADC registry)

- adc_system_repositories

This functionality will be migrated to use the ADC registry API
when it is finalized and implemented.

As this is only a single object, not exactly need to be migrated.
The ADC registry singleton object can be initially created and then
the API can be used to update it.

## Project load/unload/reload

- projectLoad --> adc_project_load
- rearrangementLoad --> adc_rearrangement_load


## Download cache

- adc_cache
- adc_cache_study
- adc_cache_repertoire

## Migration tasks and programs

