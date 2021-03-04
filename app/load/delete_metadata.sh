#
# if there was a problem with the rearrangement loads
# then might to delete the metadata and start over
#

PROJ_ID=9219474684128793066-242ac113-0001-012
COLL=_1

# repertoires
limit=50
offset=0
notDone=true
metadataIds=""
while $notDone; do
    #data=$(metadata-list -Q '{"name":"repertoire","associationIds":"'${PROJ_ID}'"}' -l $limit -o $offset)
    data=$(metadata-list -Q '{"name":"rearrangementLoad","value.collection":"'${COLL}'","associationIds":"'${PROJ_ID}'"}' -l $limit -o $offset)
    #echo $data
    if [ -z "$data" ]; then
	notDone=false
    fi
    metadataIds="$metadataIds $data"
    offset=$(( $offset + $limit ))
done
#echo $metadataIds
metadataList=($metadataIds)

for m in ${metadataList[@]}; do
    echo $m
    #metadata-delete $m
done
