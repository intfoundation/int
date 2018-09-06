"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require("assert");
const error_code_1 = require("../error_code");
const address_1 = require("../address");
const value_chain_1 = require("../value_chain");
const block_1 = require("./block");
const chain_1 = require("./chain");
const consensus = require("./consensus");
class DposMiner extends value_chain_1.ValueMiner {
    get chain() {
        return this.m_chain;
    }
    get address() {
        return this.m_address;
    }
    _chainInstance() {
        return new chain_1.DposChain({ logger: this.m_logger });
    }
    parseInstanceOptions(node, instanceOptions) {
        let { err, value } = super.parseInstanceOptions(node, instanceOptions);
        if (err) {
            return { err };
        }
        if (!instanceOptions.get('minerSecret')) {
            this.m_logger.error(`invalid instance options not minerSecret`);
            return { err: error_code_1.ErrorCode.RESULT_INVALID_PARAM };
        }
        value.secret = Buffer.from(instanceOptions.get('minerSecret'), 'hex');
        return { err: error_code_1.ErrorCode.RESULT_OK, value };
    }
    async initialize(options) {
        this.m_secret = options.secret;
        this.m_address = address_1.addressFromSecretKey(this.m_secret);
        if (!this.m_address) {
            this.m_logger.error(`dpos miner init failed for invalid secret`);
            return error_code_1.ErrorCode.RESULT_INVALID_PARAM;
        }
        if (!options.coinbase) {
            this.coinbase = this.m_address;
        }
        assert(this.coinbase, `secret key failed`);
        if (!this.m_address) {
            return error_code_1.ErrorCode.RESULT_INVALID_PARAM;
        }
        let err = await super.initialize(options);
        if (err) {
            return err;
        }
        this.m_logger.info(`begin Mine...`);
        this._resetTimer();
        return error_code_1.ErrorCode.RESULT_OK;
    }
    async _resetTimer() {
        let tr = await this._nextBlockTimeout();
        if (tr.err) {
            return tr.err;
        }
        if (this.m_timer) {
            clearTimeout(this.m_timer);
            delete this.m_timer;
        }
        this.m_timer = setTimeout(async () => {
            delete this.m_timer;
            let now = Date.now() / 1000;
            let tip = this.m_chain.tipBlockHeader;
            let blockHeader = new block_1.DposBlockHeader();
            blockHeader.setPreBlock(tip);
            blockHeader.timestamp = now;
            let dmr = await blockHeader.getDueMiner(this.m_chain);
            if (dmr.err) {
                return;
            }
            this.m_logger.info(`calcuted block ${blockHeader.number} creator: ${dmr.miner}`);
            if (!dmr.miner) {
                assert(false, 'calcuted undefined block creator!!');
                process.exit(1);
            }
            if (this.m_address === dmr.miner) {
                await this._createBlock(blockHeader);
            }
            this._resetTimer();
        }, tr.timeout);
        return error_code_1.ErrorCode.RESULT_OK;
    }
    async _mineBlock(block) {
        // 只需要给block签名
        this.m_logger.info(`${this.peerid} create block, sign ${this.m_address}`);
        block.header.signBlock(this.m_secret);
        block.header.updateHash();
        return error_code_1.ErrorCode.RESULT_OK;
    }
    async _nextBlockTimeout() {
        let hr = await this.m_chain.getHeader(0);
        if (hr.err) {
            return { err: hr.err };
        }
        let now = Date.now() / 1000;
        let blockInterval = this.m_chain.globalOptions.blockInterval;
        let nextTime = (Math.floor((now - hr.header.timestamp) / blockInterval) + 1) * blockInterval;
        return { err: error_code_1.ErrorCode.RESULT_OK, timeout: (nextTime + hr.header.timestamp - now) * 1000 };
    }
    async _createGenesisBlock(block, storage, globalOptions, genesisOptions) {
        let err = await super._createGenesisBlock(block, storage, globalOptions, genesisOptions);
        if (err) {
            return err;
        }
        let gkvr = await storage.getKeyValue(value_chain_1.Chain.dbSystem, value_chain_1.Chain.kvConfig);
        if (gkvr.err) {
            return gkvr.err;
        }
        let rpr = await gkvr.kv.set('consensus', 'dpos');
        if (rpr.err) {
            return rpr.err;
        }
        let dbr = await storage.getReadWritableDatabase(value_chain_1.Chain.dbSystem);
        if (dbr.err) {
            return dbr.err;
        }
        // storage的键值对要在初始化的时候就建立好
        let kvr = await dbr.value.createKeyValue(consensus.ViewContext.kvDPOS);
        if (kvr.err) {
            return kvr.err;
        }
        let denv = new consensus.Context(dbr.value, globalOptions, this.m_logger);
        let ir = await denv.init(genesisOptions.candidates, genesisOptions.miners);
        if (ir.err) {
            return ir.err;
        }
        return error_code_1.ErrorCode.RESULT_OK;
    }
}
exports.DposMiner = DposMiner;
