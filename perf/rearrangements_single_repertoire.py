#
# Iterate and download all rearrangements for a repertoire_id
# 

import json
import airr
import requests

# This study is stored at VDJServer data repository
host_url='https://vdjserver.org/airr/v1'

#repertoires = [ "6738379135550615065-242ac11c-0001-012" ]
repertoires = [ "5168912186246295065-242ac11c-0001-012" ]

#
# Query the rearrangement endpoint
#

# Define a generic query object, and we will replace the repertoire_id
# within the loop.

query = {
    "filters":{
        "op":"=",
        "content": {
            "field":"repertoire_id",
            "value":"XXX"
        }
    },
    "size":1000,
    "from":0
}

# Loop through each repertoire and query rearrangement data for each.

first = True
for rep_id in repertoires:
    print('Retrieving rearrangements for repertoire: ' + rep_id)
    query['filters']['content']['value'] = rep_id
    query['size'] = 1000
    query['from'] = 0

    cnt = 0
    while True:
        # send the request
        resp = requests.post(host_url + '/rearrangement', json = query)
        data = resp.json()
        rearrangements = data['Rearrangement']

        # Open a file for writing the rearrangements. We do this here
        # because we need to know the full set of fields being
        # returned from the data repository, otherwise by default only
        # the required fields will be written to the file.
        if first:
            out_file = airr.create_rearrangement('rearrangements.tsv', fields=rearrangements[0].keys())
            first = False

        # save the rearrangements to a file
        for row in rearrangements:
            out_file.write(row)

        # keep looping until all rearrangements are downloaded.
        cnt += len(rearrangements)
        if len(rearrangements) < 1000:
            break
        print('Retrieved ' + str(cnt) + ' rearrangements for repertoire: ' + rep_id)

        # Need to update the from parameter to get the next chunk
        query['from'] = cnt

    print('Retrieved ' + str(cnt) + ' rearrangements for repertoire: ' + rep_id)
