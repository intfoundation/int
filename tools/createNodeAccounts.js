const KeyRing = require('../chainlib/Account/keyring');
const fs = require('fs-extra');

function create(num, file) {
    let allAccounts = {};
    for (let index = 0; index < num; index++) {
        let account = KeyRing.generate();
        allAccounts[account.getAddress()] = account.toSecret();
    }

    fs.writeJsonSync(file, allAccounts);
}

let num = process.argv[2] || 256;
let file = process.argv[3] || './NodeAccounts.txt';

console.log(`will generate ${num} accounts to ${file}`);
create(num, file);
console.log(`generate complete.`);