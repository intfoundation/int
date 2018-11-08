#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const process = require("process");
const path = require("path");
const client_1 = require("../client");
Error.stackTraceLimit = 1000;
async function run(argv) {
    let command = client_1.parseCommand(argv);
    if (!command) {
        console.error(`parse command error, exit.`);
        process.exit();
        return;
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
    else if (command.command === 'restore') {
        if (!command.options.has('height')) {
            console.log('Usage: --dataDir [dataDir] --height [blockHeight]');
            process.exit(1);
        }
        let options = new Map();
        options.set('net', 'standalone');
        options.set('dataDir', command.options.get('dataDir'));
        options.set('loggerConsole', true);
        let ret = await client_1.host.initPeer(options);
        if (ret.chain) {
            let height = parseInt(command.options.get('height'));
            let headerRet = await ret.chain.headerStorage.getHeader(height);
            if (headerRet.err) {
                console.log(`get header error ${headerRet.err}, exit.`);
            }
            else {
                console.log(`recovering storage for Block ${headerRet.header.hash}...`);
                await ret.chain.storageManager.createStorage('temp', headerRet.header.hash);
                console.log(`restore complete.`);
            }
        }
        process.exit(0);
    }
    else {
        console.error(`invalid action command ${command.command}`);
        exit = true;
    }
    if (exit) {
        process.exit();
    }
}
exports.run = run;
if (require.main === module) {
    run(process.argv);
}
