const fs = require('fs-extra');
const shuffle = require('shuffle-array');
const Subtract = require('array-subtract');

const { GroupInfo } = require('../chainlib/Infos/Info');
const TX = require('../chainlib/Transcation/tx');
const KeyRing = require('../chainlib/Account/keyring');
const RPCClient = require("../client/RPC/RPCClient");

let systemAccount = null;

function sendGroupTx(members) {
    let info = new GroupInfo(members);
    let dataTX = TX.createDataTX(info.toRaw(), systemAccount);
    let txRaw = dataTX.toRaw();
    let sig = systemAccount.signHash(txRaw);

    let client = new RPCClient(process.argv[5], process.argv[6]);
    client.Call("addGroupTx", { tx: txRaw, sig: sig }, (resp, status) => {
        console.log(resp.toString());
    });
}

function addGroup(file, count) {
    let accounts = fs.readJSONSync(file);
    accounts = Array.from(Object.keys(accounts));
    let subtract = new Subtract((a, b) => {
        return a === b;
    });

    while (accounts.length > 0) {
        let members = shuffle.pick(accounts, { 'picks': count });
        sendGroupTx(members);
        accounts = subtract.sub(accounts, members);
    }
}

if (process.argv.length < 6) {
    console.log('Usage: node addGroup.js <systemCount> <file> <group_mebers> <ip> <port>');
    process.exit(1);
}

systemAccount = KeyRing.fromSecret(process.argv[2]);

let file = process.argv[3] || './Accounts.txt';
let groupNum = parseInt(process.argv[4]) || 128;
addGroup(file, groupNum);