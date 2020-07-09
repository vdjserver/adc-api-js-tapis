//
// change gene calls to an array when it contains
//

var cursor = db.rearrangement.find({repertoire_id:"7727563776583659030-242ac116-0001-012"});

var cnt = 0;
var upcnt = 0;
while ( cursor.hasNext() ) {
    var obj = cursor.next();
    //printjson(obj['_id']);
    //printjson(obj['v_call']);
    //printjson(typeof obj['v_call']);

    if ((typeof obj['v_call']) == 'string') {
	var fields = obj['v_call'].split(',');
	if (fields.length > 1) {
	    //printjson(fields);
	    db.rearrangement.update({_id: obj._id},{$set:{"v_call":fields}});
	    upcnt += 1;
	}
    }

    cnt += 1;
    if ((cnt % 10000) == 0) {
	printjson(cnt);
    }
}
printjson("Total");
printjson(cnt);
printjson("Updated");
printjson(upcnt);
