const RPCClient = require("../client/RPC/RPCClient");
const fs = require('fs-extra');

process.on('unhandledRejection', error => {
    console.error('unhandledRejection', error);
    process.exit(1)
});

if (process.argv.length < 4) {
    console.log('Usage: node coinbase.js <beginHeight> <ip> <port> <outfile>');
}

let client = new RPCClient(process.argv[3], parseInt(process.argv[4]));
client.Call("getProof", { bH: process.argv[2] }, (resp, status) => {
    fs.writeJsonSync(process.argv[5], resp);
});