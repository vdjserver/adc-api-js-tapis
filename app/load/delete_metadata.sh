#
# if there was a problem assigning new repertoire ids
# then might to delete the metadata and start over
#

PROJ_ID=531076969703215591-242ac11c-0001-012

# repertoires
limit=50
offset=0
notDone=true
metadataIds=""
while $notDone; do
    data=$(metadata-list -Q '{"name":"repertoire","associationIds":"'${PROJ_ID}'"}' -l $limit -o $offset)
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
    metadata-delete $m
done
