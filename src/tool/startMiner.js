#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const process = require("process");
const client_1 = require("../client");
const addressClass = require("../core/address");
Error.stackTraceLimit = 1000;
async function run(argv) {
    let command = client_1.parseCommandNew(argv);
    if (!command) {
        console.error(`parse command error, exit.`);
        process.exit();
        return;
    }
    client_1.initUnhandledRejection(client_1.initLogger({
        loggerOptions: { console: true, file: { root: process.cwd(), filename: 'exception.log' } }
    }));
    let options = command.options;
    //针对用户输入的私钥和coinbase进行检查
    if (!options.has("minerSecret")) {
        console.error("error: minerSecret is required for starting a miner.");
        process.exit();
    }
    if (!options.has("coinbase")) {
        console.error("error: coinbase is required for starting a miner ");
        process.exit();
    }
    if (!addressClass.isValidSecretKey(options.get("minerSecret"))) {
        console.error("error: invilid minerSecret is provided");
        process.exit();
    }
    if (!addressClass.isValidAddress(options.get("coinbase"))) {
        console.error("error: invilid coinbase is provided");
        process.exit();
    }
    let address = addressClass.addressFromSecretKey(options.get("minerSecret"));
    options.set('peerid', address);
    options.set("genesis", './data/intchain/genesis');
    if (!options.has("loggerConsole")) {
        options.set("loggerConsole", true);
    }
    if (!options.has("blocklimit")) {
        options.set("blocklimit", 50000000);
    }
    if (!options.has("port")) {
        options.set("port", '8553|8554');
    }
    options.set("loggerLevel", "info");
    options.set("net", "bdt");
    options.set("host", "0.0.0.0");
    options.set("bdt_log_level", "info");
    options.set("saveMismatch", true);
    options.set("dataDir", './data/intchain/minerData');
    options.set("sn", "SN_PEER_TEST1@testsn.intchain.io@8550@8551");
    let exit = false;
    exit = !(await client_1.host.initMiner(command.options)).ret;
    if (exit) {
        process.exit();
    }
}
exports.run = run;
if (require.main === module) {
    run(process.argv);
}
