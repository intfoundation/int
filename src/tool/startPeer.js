#! /usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const process = require("process");
const path = require("path");
const client_1 = require("../client");
const addressClass = require("../core/address");
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
    let dirPath = __dirname;
    console.log(dirPath);
    let joinPath = path.join("../../", dirPath, '/data/intchain/peerData');
    console.log(joinPath);
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
    if (!options.has("dataDir")) {
        options.set("dataDir", './data/intchain/peerData');
    }
    if (options.has("test")) {
        options.set("sn", "SN_PEER_TEST@testsn.intchain.io@8550@8551");
        // options.set("sn", "SN_PEER_TEST@127.0.0.1@12999@12998");
        options.set("dataDir", './data/testintchain/peerData');
    }
    if (options.has("main")) {
        options.set("sn", "SN_PEER_MAIN@mainsn.intchain.io@8550@8551");
        options.set("dataDir", './data/intchain/peerData');
    }
    if (!options.has("test") && !options.has("main")) {
        console.log("Usage: --test or --main");
        process.exit();
    }
    let privateKey = addressClass.createKeyPair()[1];
    let address = addressClass.addressFromSecretKey(privateKey.toString('hex'));
    options.set('peerid', address);
    options.set("genesis", './data/intchain/genesis');
    options.set("net", "bdt");
    options.set("host", "0.0.0.0");
    options.set("bdt_log_level", "info");
    options.set("port", '8563|8564');
    options.set("saveMismatch", true);
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
    console.log(["The INT Chain Command Line Interface. Version:" + pkg.version,
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
}
function version() {
    console.log("Version:" + pkg.version + "\n");
}
