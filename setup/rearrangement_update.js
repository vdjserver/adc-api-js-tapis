//
// mass update
//

// everything
var cursor = db.rearrangement.find({});

// TCRA test
//var cursor = db.rearrangement.find({repertoire_id:"7727563776583659030-242ac116-0001-012"});
// TCRB test
//var cursor = db.rearrangement.find({repertoire_id:"1993707260355416551-242ac11c-0001-012"});
// BCR test
//var cursor = db.rearrangement.find({repertoire_id:"4181735399629656551-242ac11c-0001-012"});

function getAllSubstrings(str,size) {
  var i, j, result = [];
  size = (size || 4);
  for (i = 0; i < str.length; i++) {
      for (j = str.length; j-i>=size; j--) {
          result.push(str.slice(i, j));
      }
  }
  return result;
}

function parseGene(str) {
    var result = {
        gene: null,
        subgroup: null
    };
    var aidx = str.indexOf('*');
    if (aidx < 0) return null;
    result.gene = str.slice(0,aidx);

    var didx = result.gene.indexOf('-');
    if (didx >= 0) result.subgroup = result.gene.slice(0,didx);
    
    return result;
}

var cnt = 0;
var skip_cnt = 0;
while ( cursor.hasNext() ) {
    var obj = cursor.next();
    //printjson(obj['v_call']);
    //printjson(obj['d_call']);
    //printjson(obj['j_call']);
    //printjson(obj['locus']);
    var updates = {$set:{"sequence_id":obj._id.valueOf()}};

    if ((obj["vdjserver_junction_substrings"]) || (obj['junction_aa'].length < 4)) {
        // already updated
        skip_cnt += 1;
        if ((skip_cnt % 1000000) == 0) {
            printjson('skipped ' + skip_cnt);
        }
        continue;
    }

    // change V gene calls to an array, add gene and subgroup
    if ((typeof obj['v_call']) == 'string') {
        var fields = obj['v_call'].split(',');
        if (fields.length > 1) {
            updates["$set"]["v_call"] = fields;
            var genes = [];
            var subgroups = []
            for (var i = 0; i < fields.length; ++i) {
                var c = fields[i];
                var result = parseGene(c);
                if (!result) {
                    genes.push(null);
                    subgroups.push(null);
                } else {
                    genes.push(result.gene);
                    subgroups.push(result.subgroup);
                }
            }
            updates["$set"]["v_gene"] = genes;
            updates["$set"]["v_subgroup"] = subgroups;
        } else {
            var result = parseGene(obj['v_call']);
            if (result) {
                updates["$set"]["v_gene"] = result.gene;
                if (result.subgroup) updates["$set"]["v_subgroup"] = result.subgroup;
            }
        }
    } else {
        var genes = [];
        var subgroups = []
        for (var i = 0; i < obj['v_call'].length; ++i) {
            var c = obj['v_call'][i];
            var result = parseGene(c);
            if (!result) {
                genes.push(null);
                subgroups.push(null);
            } else {
                genes.push(result.gene);
                subgroups.push(result.subgroup);
            }
        }
        updates["$set"]["v_gene"] = genes;
        updates["$set"]["v_subgroup"] = subgroups;
    }

    // change D gene calls to an array, add gene and subgroup
    if ((typeof obj['d_call']) == 'string') {
        var fields = obj['d_call'].split(',');
        if (fields.length > 1) {
            //printjson(fields);
            updates["$set"]["d_call"] = fields;
            var genes = [];
            var subgroups = []
            for (var i = 0; i < fields.length; ++i) {
                var c = fields[i];
                var result = parseGene(c);
                if (!result) {
                    genes.push(null);
                    subgroups.push(null);
                } else {
                    genes.push(result.gene);
                    subgroups.push(result.subgroup);
                }
            }
            updates["$set"]["d_gene"] = genes;
            updates["$set"]["d_subgroup"] = subgroups;
        } else {
            var result = parseGene(obj['d_call']);
            if (result) {
                updates["$set"]["d_gene"] = result.gene;
                if (result.subgroup) updates["$set"]["d_subgroup"] = result.subgroup;
            }
        }
    } else {
        var genes = [];
        var subgroups = []
        for (var i = 0; i < obj['d_call'].length; ++i) {
            var c = obj['d_call'][i];
            var result = parseGene(c);
            if (!result) {
                genes.push(null);
                subgroups.push(null);
            } else {
                genes.push(result.gene);
                subgroups.push(result.subgroup);
            }
        }
        updates["$set"]["d_gene"] = genes;
        updates["$set"]["d_subgroup"] = subgroups;
    }

    // change J gene calls to an array, add gene and subgroup
    if ((typeof obj['j_call']) == 'string') {
        var fields = obj['j_call'].split(',');
        if (fields.length > 1) {
            //printjson(fields);
            updates["$set"]["j_call"] = fields;
            var genes = [];
            var subgroups = []
            for (var i = 0; i < fields.length; ++i) {
                var c = fields[i];
                var result = parseGene(c);
                if (!result) {
                    genes.push(null);
                    subgroups.push(null);
                } else {
                    genes.push(result.gene);
                    subgroups.push(result.subgroup);
                }
            }
            updates["$set"]["j_gene"] = genes;
            updates["$set"]["j_subgroup"] = subgroups;
        } else {
            var result = parseGene(obj['j_call']);
            if (result) {
                updates["$set"]["j_gene"] = result.gene;
                if (result.subgroup) updates["$set"]["j_subgroup"] = result.subgroup;
            }
        }
    } else {
        var genes = [];
        var subgroups = []
        for (var i = 0; i < obj['j_call'].length; ++i) {
            var c = obj['j_call'][i];
            var result = parseGene(c);
            if (!result) {
                genes.push(null);
                subgroups.push(null);
            } else {
                genes.push(result.gene);
                subgroups.push(result.subgroup);
            }
        }
        updates["$set"]["j_gene"] = genes;
        updates["$set"]["j_subgroup"] = subgroups;
    }

    // junction substrings
    if (obj['junction_aa'].length > 3) {
        var result = getAllSubstrings(obj['junction_aa'], 4);
        updates["$set"]["vdjserver_junction_substrings"] = result;
    }

    // do the update
    db.rearrangement.update({_id: obj._id},updates);
    //printjson(updates);

    cnt += 1;
    if ((cnt % 1000000) == 0) {
        printjson(cnt);
    }
    //if (cnt == 100) break;
}
printjson("Total updated");
printjson(cnt);
