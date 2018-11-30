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
    if (options.has("main")) {
        options.set("dataDir", './data/dbft/minerData_' + address);
        options.set("sn", "SN_PEER_TESTDBFT@103.71.237.106@9999@9998");
        options.set("networkid", 1777);
        // options.set("sn", "SN_PEER_TEST@127.0.0.1@12999@12998");
    }
    if (options.has("test")) {
        options.set("dataDir", './data/dbft/minerData_test_' + address);
        options.set("sn", "SN_PEER_TESTDBFT@103.71.237.106@9999@9998");
        options.set("networkid", 1888);
        // options.set("sn", "SN_PEER_TEST@127.0.0.1@12999@12998");
    }
    if (!options.has("test") && !options.has("main")) {
        console.log("Please select network to connect: --test or --main");
        process.exit();
    }
    options.set('peerid', address + '_' + options.get("networkid"));
    options.set("genesis", './data/dbft/genesis');
    if (!options.has("loggerConsole")) {
        options.set("loggerConsole", true);
    }
    if (!options.has("blocklimit")) {
        options.set("blocklimit", 50000000);
    }
    if (!options.has("port")) {
        options.set("port", '9000|9001');
    }
    options.set("loggerLevel", "info");
    options.set("net", "bdt");
    options.set("host", "0.0.0.0");
    options.set("bdt_log_level", "info");
    options.set("saveMismatch", true);
    options.set("executor", "interprocess");
    options.set("ignoreBan", true);
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
