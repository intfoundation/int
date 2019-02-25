#! /usr/bin/env node

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const process = require("process");
const path = require("path");
const client_1 = require("../client");
const pkg = require('../../package.json');
Error.stackTraceLimit = 1000;
async function run(argv) {
    let command = client_1.parseCommandPeer(argv);
    if (!command) {
        console.error(`parse command error, exit.`);
        process.exit();
        return;
    }
    let options = command.options;
    if (options.has('dataDir')) {
        client_1.initUnhandledRejection(client_1.initLogger({
            loggerOptions: { console: true, file: { root: path.join(process.cwd(), command.options.get('dataDir')), filename: 'exception.log' } }
        }));
    }
    let exit = false;
    if (options.has("help")) {
        help();
        process.exit();
    }
    if (options.has("version")) {
        version();
        process.exit();
    }
    if (!options.has("loggerConsole")) {
        options.set("loggerConsole", true);
    }
    if (!options.has("rpchost")) {
        options.set("rpchost", 'localhost');
    }
    if (!options.has("rpcport")) {
        options.set("rpcport", '8555');
    }
    if (!options.has("loggerLevel")) {
        options.set("loggerLevel", "info");
    }

    if (!options.has("port")) {
        options.set("port", "8553|8554");
    }

    options.set("sn", "SN_PEERID_MAIN@mainsn.zeerong.com@8550@8551");
    options.set("genesis", './data/intchain/genesis');
    if (!options.has("dataDir")) {
        options.set("dataDir", './data/intchain/peerData');
    }
    options.set("networkid", 1888);

    if (options.has("test")) {
        options.set("sn", "SN_PEERID_TEST@testsn.zeerong.com@8550@8551");
        options.set("genesis", './data/testintchain/genesis');
        if (!options.has("dataDir")) {
            options.set("dataDir", './data/testintchain/peerData');
        }
        options.set("networkid", 1666);
    }

    options.set("net", "bdt");
    options.set("host", "0.0.0.0");
    options.set("bdt_log_level", "info");
    // options.set("port", '8553|8554');
    options.set("saveMismatch", true);
    options.set("ignoreBan", true);
    //options.set("broadcast_limit_transaction",3);
    exit = !(await client_1.host.initPeer(command.options)).ret;
    if (exit) {
        process.exit();
    }
}
exports.run = run;
if (require.main === module) {
    run(process.argv);
}

function help() {
    console.log(["The INT Chain Command Line Interface. Version:" + pkg.version + ".",
        "",
        "Copyright intfoundation <intfoundation@intchain.io>",
        "",
        "Usage: INT-CLI [options]",
        "",
        "Options:",
        "",
        "--loggerLevel",
        "        [all, trace, debug, info, warn, error, off].",
        "",
        "--test",
        "        Connect the test net.",
        "",
        "--main",
        "        Connect the main net.",
        "",
        "--rpchost",
        "        RPC server listening interface (default: localhost).",
        "",
        "--rpcport",
        "        RPC server listening port (default: 8555).",
        "",
        "--help  ",
        "        Show help.",
        "",
        "--version",
        "        Print versions that match the INT Chain."
    ].join("\n"));
    console.log("\n");
}

function version() {
    console.log("Version:" + pkg.version + "\n");
}