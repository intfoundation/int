let wageDB = require("./wagedb");

const SuperNodeClient = require('../client/Peer/superNodeClient');

const SUPER_NODE_RPC_PORT = 11000;

async function payoff() {
    await wageDB.init();
    let wageProof = await wageDB.getWage();

    let wages = [];

    let client = new SuperNodeClient('127.0.0.1', require('./config').SUPER_NODE_RPC_PORT);
    for (let pid in wageProof) {
        if (wageProof.hasOwnProperty(pid) && wageProof[pid] > 0) {
            wages.push({address: pid, amount: 1});
        }
    }
    if (wages.length > 0) {
        await client.createCoinbase(wages);
    }
}

payoff();
