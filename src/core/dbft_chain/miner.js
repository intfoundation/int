"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require('assert');
const error_code_1 = require("../error_code");
const address_1 = require("../address");
const value_chain_1 = require("../value_chain");
const chain_1 = require("./chain");
const consensus_node_1 = require("./consensus_node");
class DbftMinerChain extends chain_1.DbftChain {
    _defaultNetworkOptions() {
        return {
            netType: 'validators',
            initialValidator: this.globalOptions.superAdmin,
            minConnectionRate: this.globalOptions.agreeRateNumerator / this.globalOptions.agreeRateDenominator,
        };
    }
    get headerStorage() {
        return this.m_headerStorage;
    }
    async _calcuteReqLimit(fromHeader, limit) {
        let hr = await this.getHeader(fromHeader);
        let reSelectionBlocks = this.globalOptions.reSelectionBlocks;
        return reSelectionBlocks - (hr.header.number % reSelectionBlocks);
    }
}
class DbftMiner extends value_chain_1.ValueMiner {
    constructor(options) {
        super(options);
        this.m_miningBlocks = new Map();
    }
    get chain() {
        return this.m_chain;
    }
    get address() {
        return this.m_address;
    }
    _chainInstance() {
        return new DbftMinerChain(this.m_constructOptions);
    }
    parseInstanceOptions(options) {
        let { err, value } = super.parseInstanceOptions(options);
        if (err) {
            return { err };
        }
        if (!options.origin.get('minerSecret')) {
            this.m_logger.error(`invalid instance options not minerSecret`);
            return { err: error_code_1.ErrorCode.RESULT_INVALID_PARAM };
        }
        value.minerSecret = Buffer.from(options.origin.get('minerSecret'), 'hex');
        return { err: error_code_1.ErrorCode.RESULT_OK, value };
    }
    async _createBlock(header) {
        const block = this.chain.newBlock(header);
        await this._collectTransactions(block);
        await this._decorateBlock(block);
        const cer = await this._createExecuteRoutine(block);
        if (cer.err) {
            return { err: cer.err };
        }
        // first broadcast，then execute
        const err = await this.m_consensusNode.newProposal(cer.routine.block);
        if (err) {
            this._setIdle(cer.routine.name);
            return { err };
        }
        return cer.next();
    }
    async initialize(options) {
        this.m_secret = options.minerSecret;
        this.m_address = address_1.addressFromSecretKey(this.m_secret);
        if (!options.coinbase) {
            this.coinbase = this.m_address;
        }
        let err = await super.initialize(options);
        if (err) {
            this.m_logger.error(`dbft miner super initialize failed, errcode ${err}`);
            return err;
        }
        this.m_consensusNode = new consensus_node_1.DbftConsensusNode({
            network: this.m_chain.node.getNetwork(),
            globalOptions: this.m_chain.globalOptions,
            secret: this.m_secret
        });
        err = await this.m_consensusNode.init();
        if (err) {
            this.m_logger.error(`dbft miner consensus node init failed, errcode ${err}`);
            return err;
        }
        let tip = this.chain.tipBlockHeader;
        err = await this._updateTip(tip);
        if (err) {
            this.m_logger.error(`dbft miner initialize failed, errcode ${err}`);
            return err;
        }
        this.m_consensusNode.on('createBlock', async (header) => {
            if (header.preBlockHash !== this.chain.tipBlockHeader.hash) {
                this.m_logger.warn(`mine block skipped`);
                return;
            }
            this.m_logger.info(`begin create block ${header.hash} ${header.number} ${header.view}`);
            let cbr = await this._createBlock(header);
            if (cbr.err) {
                this.m_logger.error(`create block failed `, cbr.err);
            }
            else {
                this.m_logger.info(`create block finsihed `);
            }
        });
        this.m_consensusNode.on('verifyBlock', async (block) => {
            this.m_logger.info(`begin verify block ${block.hash} ${block.number}`);
            const cer = await this._createExecuteRoutine(block);
            if (cer.err) {
                this.m_logger.error(`dbft verify block failed `, cer.err);
                return;
            }
            const nr = await cer.next();
            if (nr.err) {
                this.m_logger.error(`dbft verify block failed `, nr.err);
                return;
            }
        });
        this.m_consensusNode.on('mineBlock', async (block, signs) => {
            block.header.setSigns(signs);
            assert(this.m_miningBlocks.has(block.hash));
            const resolve = this.m_miningBlocks.get(block.hash);
            resolve(error_code_1.ErrorCode.RESULT_OK);
        });
        return err;
    }
    async _updateTip(tip) {
        let gnmr = await this.chain.dbftHeaderStorage.getNextMiners(tip);
        if (gnmr.err) {
            this.m_logger.error(`dbft miner initialize failed for `, gnmr.err);
            return gnmr.err;
        }
        let gtvr = await this.chain.dbftHeaderStorage.getTotalView(tip);
        if (gtvr.err) {
            this.m_logger.error(`dbft miner initialize failed for `, gtvr.err);
            return gnmr.err;
        }
        this.m_consensusNode.updateTip(tip, gnmr.miners, gtvr.totalView);
        return error_code_1.ErrorCode.RESULT_OK;
    }
    async _onTipBlock(chain, tipBlock) {
        await this._updateTip(tipBlock);
    }
    async _mineBlock(block) {
        this.m_logger.info(`create block, sign ${this.m_address}`);
        block.header.updateHash();
        return new Promise((resolve) => {
            if (this.m_miningBlocks.has(block.hash)) {
                resolve(error_code_1.ErrorCode.RESULT_SKIPPED);
                return;
            }
            this.m_miningBlocks.set(block.hash, resolve);
            this.m_consensusNode.agreeProposal(block);
        });
    }
}
exports.DbftMiner = DbftMiner;
