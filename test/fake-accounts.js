const KeyRing = require('../chainlib/Account/keyring');
const fs = require('fs-extra');
/*
const num = 256;
const allAccounts = {};
for (let index = 0; index < num; index++) {
    let account = KeyRing.generate();
    allAccounts[account.getAddress()] = account.toSecret();
}

fs.writeJsonSync('./Accounts.txt', allAccounts);
*/
let accounts = fs.readJSONSync('./Accounts.txt');
for (const address in accounts) {
    console.log(`${address}: ${accounts[address]}`);
}
//console.log(accounts);