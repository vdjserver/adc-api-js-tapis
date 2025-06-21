
#while [ 1 ]; do
#    curl -s -H 'content-type:application/json' --data @facets_single_repertoire.json http://localhost:8020/airr/v1/rearrangement | \
#        python3 -c "import sys, json; print(json.load(sys.stdin)['Facet']);"
#done

#server=http://localhost:8020
server=https://vdj-staging.tacc.utexas.edu

# get repertoires
repertoires=($(curl -s -X POST -d '{"fields":["repertoire_id"]}' -H 'content-type:application/json' ${server}/airr/v1/repertoire | \
         python3 -c "import sys, json; data = json.load(sys.stdin)['Repertoire']; rep_list = [ print(r['repertoire_id']) for r in data ];"))

# loop through repertoires and do request
count=0
while [ "x${repertoires[count]}" != "x" ]
do
    rep_id=${repertoires[count]}
    #rep_id=818551498053194221-242ac118-0001-012
    echo $rep_id
    curl -s -H 'content-type:application/json' --data '{"filters":{"op":"=","content": {"field": "repertoire_id","value": "'$rep_id'"}},"facets":"repertoire_id"}' ${server}/airr/v1/rearrangement | \
        python3 -c "import sys, json; print(json.load(sys.stdin)['Facet']);"

    #exit
    count=$(( $count + 1 ))
done

