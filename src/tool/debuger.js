#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const process = require("process");
const path = require("path");
const client_1 = require("../client");
const core_1 = require("../core");
const logger = client_1.initLogger({ loggerOptions: { console: true } });
client_1.initUnhandledRejection(logger);
async function main() {
    let command = client_1.parseCommand(process.argv);
    if (!command || !command.command) {
        console.log(`Usage: node address.js <create | convert> {--secret {secret} | --pubkey {pubkey}}`);
        process.exit();
    }
    const dataDir = command.options.get('dataDir');
    const chainCreator = core_1.initChainCreator({ logger });
    if (command.command === 'independent') {
        let { err, debuger } = await core_1.createValueDebuger(chainCreator, dataDir);
        if (err) {
            process.exit();
        }
        const session = debuger.createIndependSession();
        const height = parseInt(command.options.get('height'));
        const accounts = parseInt(command.options.get('accounts'));
        const coinbase = parseInt(command.options.get('coinbase'));
        const interval = parseInt(command.options.get('interval'));
        const sir = await session.init({ height, accounts, coinbase, interval });
        if (sir.err) {
            process.exit();
        }
        const scriptPath = command.options.get('script');
        await runScript(session, scriptPath);
        process.exit();
    }
    else if (command.command === 'chain') {
        const cvdr = await core_1.createValueDebuger(chainCreator, dataDir);
        if (cvdr.err) {
            process.exit();
        }
        const sessionDir = command.options.get('sessionDir');
        const ccsr = await cvdr.debuger.createChainSession(sessionDir);
        if (ccsr.err) {
            process.exit();
        }
        const scriptPath = command.options.get('script');
        await runScript(ccsr.session, scriptPath);
        process.exit();
    }
}
async function runScript(session, scriptPath) {
    try {
        const run = require(path.join(process.cwd(), scriptPath)).run;
        await run(session);
        return core_1.ErrorCode.RESULT_OK;
    }
    catch (e) {
        logger.error(`${scriptPath} run throws exception `, e);
        return core_1.ErrorCode.RESULT_EXCEPTION;
    }
}
if (require.main === module) {
    main();
}
