"use strict";
function __export(m) {
    for (var p in m) if (!exports.hasOwnProperty(p)) exports[p] = m[p];
}
Object.defineProperty(exports, "__esModule", { value: true });
__export(require("../core"));
__export(require("./client/client"));
__export(require("./lib/simple_command"));
var unhandled_rejection_1 = require("./lib/unhandled_rejection");
exports.initUnhandledRejection = unhandled_rejection_1.init;
var rejectify_1 = require("./lib/rejectify");
exports.rejectifyValue = rejectify_1.rejectifyValue;
exports.rejectifyErrorCode = rejectify_1.rejectifyErrorCode;
__export(require("./host/chain_host"));
const chain_host_1 = require("./host/chain_host");
let host = new chain_host_1.ChainHost();
exports.host = host;
const core_1 = require("../core");
const valueChainDebuger = {
    async createIndependSession(loggerOptions, dataDir) {
        const cdr = await core_1.createValueDebuger(core_1.initChainCreator(loggerOptions), dataDir);
        if (cdr.err) {
            return { err: cdr.err };
        }
        return { err: core_1.ErrorCode.RESULT_OK, session: cdr.debuger.createIndependSession() };
    },
    async createChainSession(loggerOptions, dataDir, debugerDir) {
        const cdr = await core_1.createValueDebuger(core_1.initChainCreator(loggerOptions), dataDir);
        if (cdr.err) {
            return { err: cdr.err };
        }
        return cdr.debuger.createChainSession(debugerDir);
    }
};
exports.valueChainDebuger = valueChainDebuger;
