"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require('assert');
const error_code_1 = require("../error_code");
const Lock_1 = require("../lib/Lock");
const address_1 = require("../address");
const value_chain_1 = require("../value_chain");
const chain_1 = require("./chain");
const validators_node_1 = require("./validators_node");
const consensus_node_1 = require("./consensus_node");
class DbftMinerChain extends chain_1.DbftChain {
    _createChainNode() {
        let node = new validators_node_1.ValidatorsNode({
            node: this.m_instanceOptions.node,
            minConnectionRate: this.globalOptions.agreeRateNumerator / this.globalOptions.agreeRateDenominator,
            dataDir: this.m_dataDir,
            logger: this.m_logger,
            headerStorage: this.m_headerStorage,
            blockHeaderType: this._getBlockHeaderType(),
            transactionType: this._getTransactionType(),
            receiptType: this._getReceiptType(),
            ignoreBan: this.m_instanceOptions.ignoreBan,
        });
        // 这里用sa的adderss初始化吧， sa部署的时候过略非miner地址的连接；
        //      因为没有同步之前无法知道当前的validators是哪些
        node.setValidators([this.globalOptions.superAdmin]);
        return node;
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
        this.m_mineLock = new Lock_1.Lock();
        this.m_verifyLock = new Lock_1.Lock();
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
    parseInstanceOptions(node, instanceOptions) {
        let { err, value } = super.parseInstanceOptions(node, instanceOptions);
        if (err) {
            return { err };
        }
        if (!instanceOptions.get('minerSecret')) {
            this.m_logger.error(`invalid instance options not minerSecret`);
            return { err: error_code_1.ErrorCode.RESULT_INVALID_PARAM };
        }
        value.minerSecret = Buffer.from(instanceOptions.get('minerSecret'), 'hex');
        return { err: error_code_1.ErrorCode.RESULT_OK, value };
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
            node: this.m_chain.node.base,
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
            // TODO:有可能重入么？先用lock
            if (header.preBlockHash !== this.chain.tipBlockHeader.hash) {
                this.m_logger.warn(`mine block skipped`);
                return;
            }
            this.m_mineLock.enter();
            this.m_logger.info(`begin create block ${header.hash} ${header.number} ${header.view}`);
            let cbr = await this._createBlock(header);
            if (cbr.err) {
                this.m_logger.error(`create block failed `, cbr.err);
            }
            else {
                this.m_logger.info(`create block finsihed `);
            }
            this.m_mineLock.leave();
        });
        this.m_consensusNode.on('verifyBlock', async (block) => {
            // TODO:有可能重入么？先用lock
            let hr = await this.chain.headerStorage.getHeader(block.header.hash);
            if (!hr.err) {
                this.m_logger.error(`verify block already added to chain ${block.header.hash} ${block.header.number}`);
                return;
            }
            else if (hr.err !== error_code_1.ErrorCode.RESULT_NOT_FOUND) {
                this.m_logger.error(`get header failed for `, hr.err);
                return;
            }
            this.m_logger.info(`begin verify block ${block.hash} ${block.number}`);
            this.m_verifyLock.enter();
            let vr = await this.chain.verifyBlock(block, { storageName: 'consensVerify', ignoreSnapshot: false });
            this.m_verifyLock.leave();
            if (vr.err) {
                this.m_logger.error(`verify block failed `, vr.err);
                return;
            }
            if (vr.verified) {
                this.m_consensusNode.agreeProposal(block);
            }
            else {
                // TODO: 传回去？
            }
        });
        this.m_consensusNode.on('primaryMineBlock', async (block, signs) => {
            block.header.setSigns(signs);
            assert(this.m_miningBlocks.has(block.hash));
            const resolve = this.m_miningBlocks.get(block.hash);
            resolve(error_code_1.ErrorCode.RESULT_OK);
        });
        this.m_consensusNode.on('otherMineBlock', async (block, signs) => {
            block.header.setSigns(signs);
            let gss = await this.chain.storageManager.getSnapshot(block.hash);
            if (gss.err) {
                this.m_logger.error(`getSnapshot failed `, gss.err);
                return;
            }
            await this.chain.addMinedBlock(block, gss.snapshot);
            this.chain.storageManager.releaseSnapshot(block.hash);
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
        this.m_logger.info(`${this.peerid} create block, sign ${this.m_address}`);
        block.header.signBlock(this.m_secret);
        block.header.updateHash();
        this.m_consensusNode.newProposal(block);
        return new Promise((resolve) => {
            assert(!this.m_miningBlocks.has(block.hash));
            if (this.m_miningBlocks.has(block.hash)) {
                resolve(error_code_1.ErrorCode.RESULT_SKIPPED);
                return;
            }
            this.m_miningBlocks.set(block.hash, resolve);
        });
    }
}
exports.DbftMiner = DbftMiner;
