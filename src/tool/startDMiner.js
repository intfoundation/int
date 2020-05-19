#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const addressClass = require("../core/address");
const process = require("process");
const client_1 = require("../client");
const core_1 = require("../core");
const fork = require('child_process').fork;
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

    if (!options.has("dataDir")) {
        options.set("dataDir", './data/intchain/minerData_' + address);
    }
    options.set("genesis", './data/intchain/genesis');
    options.set("sn", "SN_PEERID_MAIN@mainsn.zeerong.com@8550@8551");
    options.set("networkid", 1888);

    if (options.has("test")) {
        if (!options.has("dataDir")) {
            options.set("dataDir", './data/testintchain/minerData_' + address);
        }
        options.set("genesis", './data/testintchain/genesis');
        options.set("sn", "SN_PEERID_TEST@testsn.zeerong.com@8550@8551");
        options.set("networkid", 1666);
    }

    if (!options.has("loggerConsole")) {
        options.set("loggerConsole", true);
    }
    if (!options.has("blocklimit")) {
        options.set("blocklimit", 20000000);
    }
    if (!options.has("port")) {
        options.set("port", '8553|8554');
    }
    if (!options.has("loggerLevel")) {
        options.set("loggerLevel", "info");
    }
    options.set('peerid', address);
    options.set("net", "bdt");
    options.set("host", "0.0.0.0");
    options.set("bdt_log_level", "info");
    options.set("saveMismatch", true);
    options.set("executor", "interprocess");
    options.set("ignoreBan",true);
    //options.set("broadcast_limit_transaction",3);
    StartMiner(command.options);
}
exports.run = run;
if (require.main === module) {
    run(process.argv);
}

function StartMiner(commandOptions) {
    const startWork = fork('./src/client/host/startMiner.js');
    startWork.on('exit', function (code) {
        console.log(`exit code = ${code}`)
        if (!code) {
            StartMiner(commandOptions);
        }
        else {
            console.log("happen some exception,exit directly ***********");
        }
    });
    startWork.send({ messageFlag: "startMiner", commandOptions: core_1.MapToObject(commandOptions) });
}