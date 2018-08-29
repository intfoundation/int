#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const process = require("process");
const client_1 = require("../client");
client_1.initUnhandledRejection(client_1.initLogger({ loggerOptions: { console: true } }));
function main() {
    let command = client_1.parseCommand(process.argv);
    if (!command || !command.command) {
        console.log(`Usage: node address.js <create | convert> {--secret {secret} | --pubkey {pubkey}}`);
        process.exit();
    }
    if (command.command === 'create') {
        let [key, secret] = client_1.createKeyPair();
        let addr = client_1.addressFromSecretKey(secret);
        console.log(`address:${addr} secret:${secret.toString('hex')}`);
        process.exit();
    }
    else {
        if (command.options.has('secret')) {
            let pub = client_1.publicKeyFromSecretKey(command.options.get('secret'));
            let addr = client_1.addressFromPublicKey(pub);
            console.log(`address:${addr}\npubkey:${pub.toString('hex')}`);
            process.exit();
        }
        else if (command.options.has('pubkey')) {
            let addr = client_1.addressFromPublicKey(command.options.get('pubkey'));
            console.log(`address:${addr}`);
            process.exit();
        }
        else {
            console.log(`Usage: node address.js <create | convert> {--secret {secret} | --pubkey {pubkey}}`);
            process.exit();
        }
    }
}
main();
