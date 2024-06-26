#
# Iterate and download all rearrangements for a set of repertoire_id
# 

import json
import airr
import requests

# This study is stored at VDJServer data repository
host_url='https://vdjserver.org/airr/v1'

#
# Query the rearrangement endpoint
#

query = {
    "filters":{
        "op": "in",
        "content": {
          "field": "repertoire_id",
          "value": [
            "148543677234605590-242ac11a-0001-012",
            "190720256081325590-242ac11a-0001-012",
            "910621646116351510-242ac11a-0001-012",
            "735172232074751510-242ac11a-0001-012",
            "766482543662591510-242ac11a-0001-012"
          ]
        }
    },
    "size":1000,
    "from":0
}

first = True
print('Retrieving rearrangements.')
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
    print('Retrieved ' + str(cnt) + ' rearrangements.')

    # Need to update the from parameter to get the next chunk
    query['from'] = cnt

print('Retrieved ' + str(cnt) + ' rearrangements.')
