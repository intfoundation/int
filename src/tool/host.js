#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const process = require("process");
const path = require("path");
const client_1 = require("../client");
Error.stackTraceLimit = 1000;
async function main() {
    let ret = await run(process.argv);
    if (ret !== 0) {
        process.exit(ret);
    }
}
async function run(argv) {
    let command = client_1.parseCommand(argv);
    if (!command) {
        console.error(`parse command error, exit.`);
        // process.exit(-1);
        return -1;
    }
    if (command.options.has('dataDir')) {
        client_1.initUnhandledRejection(client_1.initLogger({
            loggerOptions: { console: true, file: { root: path.join(process.cwd(), command.options.get('dataDir')), filename: 'exception.log' } }
        }));
    }
    let exit = false;
    if (command.command === 'peer') {
        exit = !(await client_1.host.initPeer(command.options)).ret;
    }
    else if (command.command === 'miner') {
        exit = !(await client_1.host.initMiner(command.options)).ret;
    }
    else if (command.command === 'create') {
        await client_1.host.createGenesis(command.options);
        exit = true;
    }
    else {
        console.error(`invalid action command ${command.command}`);
        exit = true;
    }
    if (!exit) {
        // process.exit();
        return 0;
    }
    else {
        return -3;
    }
}
exports.run = run;
if (require.main === module) {
    main();
}
