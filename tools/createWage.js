const KeyRing = require('../chainlib/Account/keyring');
let systemAccount = null;

systemAccount = KeyRing.fromSecret(process.argv[2]);

function createWage() {
    //Setp1: read wage info from metaNode
    //Setp2: create wage from info
    //Setp3: write a tx to prevent read from old wageinfo?
}