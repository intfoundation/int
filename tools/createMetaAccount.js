var KeyRing = require("../chainlib/Account/keyring")
const fs = require('fs-extra');

let fromSecret = 'KxzxXbHPf2oiMURvMk94NyKn8ncSXPvGERDNaXvf8vLqweXabJJt';
let systemAccount = KeyRing.fromSecret();

function create(num, file) {
    let allAccounts = {};
    for (let index = 0; index < num; index++) {
        let metaAccount = KeyRing.generate();
        let metaPubKey = metaAccount.getPublicKey();
        let sig = systemAccount.signHash(metaPubKey);

        allAccounts[ metaAccount.toSecret()] = sig.toString('hex');
    }

    fs.writeJsonSync(file, allAccounts);
}

let num = process.argv[2] || 256;
let file = process.argv[3] || './MetaAccounts.txt';

console.log(`will generate ${num} accounts to ${file}`);
create(num, file);
console.log(`generate complete.`);