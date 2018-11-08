"use strict";
function __export(m) {
    for (var p in m) if (!exports.hasOwnProperty(p)) exports[p] = m[p];
}
Object.defineProperty(exports, "__esModule", { value: true });
var bignumber_js_1 = require("bignumber.js");
exports.BigNumber = bignumber_js_1.BigNumber;
__export(require("./serializable"));
__export(require("./error_code"));
__export(require("./address"));
__export(require("./lib/logger_util"));
__export(require("./lib/decimal_transfer"));
__export(require("./chain"));
__export(require("./value_chain"));
__export(require("./pow_chain"));
__export(require("./dpos_chain"));
__export(require("./net"));
__export(require("./dbft_chain"));
var node_1 = require("./net_tcp/node");
exports.TcpNode = node_1.TcpNode;
var node_2 = require("./net_bdt/node");
exports.BdtNode = node_2.BdtNode;
var node_3 = require("./net_standalone/node");
exports.StandaloneNode = node_3.StandaloneNode;
var chain_creator_1 = require("./chain_creator");
exports.ChainCreator = chain_creator_1.ChainCreator;
__export(require("./lib/digest"));
__export(require("./lib/encoding"));
const chain_creator_2 = require("./chain_creator");
const value_chain_1 = require("./value_chain");
const pow_chain_1 = require("./pow_chain");
const dpos_chain_1 = require("./dpos_chain");
const dbft_chain_1 = require("./dbft_chain");
function initChainCreator(options) {
    let _creator = new chain_creator_2.ChainCreator(options);
    _creator.registerChainType('pow', {
        newHandler(creator, typeOptions) {
            return new value_chain_1.ValueHandler();
        },
        newChain(creator, dataDir, config) {
            return new pow_chain_1.PowChain({ logger: creator.logger, handler: config.handler, dataDir, globalOptions: config.globalOptions });
        },
        newMiner(creator, dataDir, config) {
            return new pow_chain_1.PowMiner({ logger: creator.logger, handler: config.handler, dataDir, globalOptions: config.globalOptions });
        }
    });
    _creator.registerChainType('dpos', {
        newHandler(creator, typeOptions) {
            return new value_chain_1.ValueHandler();
        },
        newChain(creator, dataDir, config) {
            return new dpos_chain_1.DposChain({ logger: creator.logger, handler: config.handler, dataDir, globalOptions: config.globalOptions });
        },
        newMiner(creator, dataDir, config) {
            return new dpos_chain_1.DposMiner({ logger: creator.logger, handler: config.handler, dataDir, globalOptions: config.globalOptions });
        }
    });
    _creator.registerChainType('dbft', {
        newHandler(creator, typeOptions) {
            return new value_chain_1.ValueHandler();
        },
        newChain(creator, dataDir, config) {
            return new dbft_chain_1.DbftChain({ logger: creator.logger, handler: config.handler, dataDir, globalOptions: config.globalOptions });
        },
        newMiner(creator, dataDir, config) {
            return new dbft_chain_1.DbftMiner({ logger: creator.logger, handler: config.handler, dataDir, globalOptions: config.globalOptions });
        }
    });
    return _creator;
}
exports.initChainCreator = initChainCreator;
__export(require("./chain_debuger"));
