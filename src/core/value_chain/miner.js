"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const error_code_1 = require("../error_code");
const chain_1 = require("../chain");
const bignumber_js_1 = require("bignumber.js");
const chain_2 = require("./chain");
const address_1 = require("../address");
const assert = require('assert');
class ValueMiner extends chain_1.Miner {
    constructor(options) {
        super(options);
    }
    set coinbase(address) {
        this.m_coinbase = address;
    }
    get coinbase() {
        return this.m_coinbase;
    }
    _chainInstance() {
        return new chain_2.ValueChain({ logger: this.m_logger });
    }
    get chain() {
        return this.m_chain;
    }
    parseInstanceOptions(node, instanceOptions) {
        let { err, value } = super.parseInstanceOptions(node, instanceOptions);
        if (err) {
            return { err };
        }
        value.coinbase = instanceOptions.get('coinbase');
        return { err: error_code_1.ErrorCode.RESULT_OK, value };
    }
    async initialize(options) {
        if (options.coinbase) {
            this.m_coinbase = options.coinbase;
        }
        return super.initialize(options);
    }
    async _decorateBlock(block) {
        block.header.coinbase = this.m_coinbase;
        return error_code_1.ErrorCode.RESULT_OK;
    }
    async _createGenesisBlock(block, storage, globalOptions, genesisOptions) {
        let err = await super._createGenesisBlock(block, storage, globalOptions, genesisOptions);
        if (err) {
            return err;
        }
        let dbr = await storage.getReadWritableDatabase(chain_1.Chain.dbSystem);
        if (dbr.err) {
            assert(false, `value chain create genesis failed for no system database`);
            return dbr.err;
        }
        const dbSystem = dbr.value;
        let gkvr = await dbSystem.getReadWritableKeyValue(chain_1.Chain.kvConfig);
        if (gkvr.err) {
            return gkvr.err;
        }
        let rpr = await gkvr.kv.rpush('features', 'value');
        if (rpr.err) {
            return rpr.err;
        }
        if (!genesisOptions || !address_1.isValidAddress(genesisOptions.coinbase)) {
            this.m_logger.error(`create genesis failed for genesisOptioins should has valid coinbase`);
            return error_code_1.ErrorCode.RESULT_INVALID_PARAM;
        }
        block.header.coinbase = genesisOptions.coinbase;
        let kvr = await dbSystem.createKeyValue(chain_2.ValueChain.kvBalance);
        // 在这里给用户加钱
        if (genesisOptions && genesisOptions.preBalances) {
            // 这里要给几个账户放钱
            let kvBalance = kvr.kv;
            for (let index = 0; index < genesisOptions.preBalances.length; index++) {
                // 按照address和amount预先初始化钱数
                await kvBalance.set(genesisOptions.preBalances[index].address, new bignumber_js_1.BigNumber(genesisOptions.preBalances[index].amount));
            }
        }
        return kvr.err;
    }
}
exports.ValueMiner = ValueMiner;
