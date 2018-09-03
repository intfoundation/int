"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const error_code_1 = require("../error_code");
const util_1 = require("util");
const value_chain_1 = require("../value_chain");
const chain_node_1 = require("./chain_node");
const block_1 = require("./block");
const dbftProxy_1 = require("./dbftProxy");
const LRUCache_1 = require("../lib/LRUCache");
const executor_1 = require("./executor");
const ValueContext = require("../value_chain/context");
const initMinersSql = 'CREATE TABLE IF NOT EXISTS "miners"("hash" CHAR(64) PRIMARY KEY NOT NULL UNIQUE, "miners" TEXT NOT NULL);';
const updateMinersSql = 'REPLACE INTO miners (hash, miners) values ($hash, $miners)';
const getMinersSql = 'SELECT miners FROM miners WHERE hash=$hash';
class DbftChain extends value_chain_1.ValueChain {
    constructor(options) {
        super(options);
        this.m_minerCache = new LRUCache_1.LRUCache(12);
    }
    on(event, listener) {
        super.on(event, listener);
        return this;
    }
    async newBlockExecutor(block, storage) {
        let kvBalance = (await storage.getKeyValue(value_chain_1.Chain.dbSystem, value_chain_1.ValueChain.kvBalance)).kv;
        let ve = new ValueContext.Context(kvBalance);
        let externalContext = Object.create(null);
        externalContext.getBalance = async (address) => {
            return await ve.getBalance(address);
        };
        externalContext.transferTo = async (address, amount) => {
            return await ve.transferTo(value_chain_1.ValueChain.sysAddress, address, amount);
        };
        let dbftProxy = new dbftProxy_1.DBFTSProxy(storage, this.globalOptions, this.logger);
        externalContext.register = async (address, pubkey, pubkeySign) => {
            return await dbftProxy.registerToCandidate(block.number, address, Buffer.from(pubkey, 'hex'), Buffer.from(pubkeySign, 'hex'));
        };
        externalContext.unregister = async (address, addressSign) => {
            return await dbftProxy.unRegisterToCandidate(address, Buffer.from(addressSign, 'hex'));
        };
        externalContext.getMiners = async () => {
            let gm = await dbftProxy.getMiners();
            if (gm.err) {
                throw Error('newBlockExecutor getMiners failed errcode ${gm.err}');
            }
            return gm.miners;
        };
        externalContext.isMiner = async (address) => {
            let im = await dbftProxy.isMiners(address);
            if (im.err) {
                throw Error('newBlockExecutor isMiner failed errcode ${gm.err}');
            }
            return im.isminer;
        };
        let executor = new executor_1.DbftBlockExecutor({ logger: this.logger, block, storage, handler: this.handler, externContext: externalContext, globalOptions: this.globalOptions });
        return { err: error_code_1.ErrorCode.RESULT_OK, executor: executor };
    }
    async newViewExecutor(header, storage, method, param) {
        let nvex = await super.newViewExecutor(header, storage, method, param);
        let externalContext = nvex.executor.externContext;
        let dbftProxy = new dbftProxy_1.DBFTSProxy(storage, this.globalOptions, this.logger);
        externalContext.getMiners = async () => {
            let gm = await dbftProxy.getMiners();
            if (gm.err) {
                throw Error('newBlockExecutor getMiners failed errcode ${gm.err}');
            }
            return gm.miners;
        };
        externalContext.isMiner = async (address) => {
            let im = await dbftProxy.isMiners(address);
            if (im.err) {
                throw Error('newBlockExecutor isMiner failed errcode ${gm.err}');
            }
            return im.isminer;
        };
        return nvex;
    }
    async _createChainNode() {
        let node = new chain_node_1.DbftChainNode({
            node: this.m_instanceOptions.node,
            blockHeaderType: this._getBlockHeaderType(),
            transactionType: this._getTransactionType(),
            blockStorage: this.blockStorage,
            headerStorage: this.headerStorage,
            storageManager: this.storageManager,
            logger: this.logger,
            minOutbound: this.m_instanceOptions.minOutbound,
            blockTimeout: this.m_instanceOptions.blockTimeout,
            dataDir: this.dataDir,
        });
        return { err: error_code_1.ErrorCode.RESULT_OK, node };
    }
    async initComponents(dataDir, handler) {
        let err = await super.initComponents(dataDir, handler);
        if (err) {
            return err;
        }
        try {
            await this.m_db.run(initMinersSql);
            return error_code_1.ErrorCode.RESULT_OK;
        }
        catch (e) {
            this.logger.error(e);
            return error_code_1.ErrorCode.RESULT_EXCEPTION;
        }
    }
    async getMiners(header) {
        return await this._getMiners(header, false);
    }
    async getNextMiners(header) {
        return await this._getMiners(header, true);
    }
    async _getMiners(header, bNext) {
        let en = dbftProxy_1.DBFTSProxy.getElectionBlockNumber(this.globalOptions, bNext ? header.number + 1 : header.number);
        let electionHeader;
        if (header.number === en) {
            electionHeader = header;
        }
        else {
            let hr = await this.getHeader(header.preBlockHash, en - header.number + 1);
            if (hr.err) {
                this.logger.error(`dbft get electionHeader error,number=${header.number},prevblockhash=${header.preBlockHash}`);
                return { err: hr.err };
            }
            electionHeader = hr.header;
        }
        let miners = this.m_minerCache.get(electionHeader.hash);
        if (miners) {
            return { err: error_code_1.ErrorCode.RESULT_OK, miners };
        }
        try {
            const gm = await this.m_db.get(getMinersSql, { $hash: electionHeader.hash });
            if (!gm || !gm.miners) {
                this.logger.error(`getMinersSql error,election block hash=${electionHeader.hash},en=${en},header.height=${header.number}`);
                return { err: error_code_1.ErrorCode.RESULT_NOT_FOUND };
            }
            this.m_minerCache.set(electionHeader.hash, JSON.parse(gm.miners));
            return { err: error_code_1.ErrorCode.RESULT_OK, miners: JSON.parse(gm.miners) };
        }
        catch (e) {
            this.logger.error(e);
            return { err: error_code_1.ErrorCode.RESULT_EXCEPTION };
        }
    }
    async _onVerifiedBlock(block) {
        let b = dbftProxy_1.DBFTSProxy.isElectionBlockNumber(this.globalOptions, block.number);
        if (!dbftProxy_1.DBFTSProxy.isElectionBlockNumber(this.globalOptions, block.number)) {
            return error_code_1.ErrorCode.RESULT_OK;
        }
        let gs = await this.storageManager.getSnapshotView(block.hash);
        if (gs.err) {
            return gs.err;
        }
        let minersInfo = await (new dbftProxy_1.DBFTSProxy(gs.storage, this.globalOptions, this.m_logger)).getMiners();
        this.storageManager.releaseSnapshotView(block.hash);
        if (minersInfo.err) {
            return minersInfo.err;
        }
        try {
            await this.m_db.run(updateMinersSql, { $hash: block.hash, $miners: JSON.stringify(minersInfo.miners) });
            if (dbftProxy_1.DBFTSProxy.isElectionBlockNumber(this.globalOptions, block.number)) {
                this.emit('minerChange', block.header);
            }
            return error_code_1.ErrorCode.RESULT_OK;
        }
        catch (e) {
            this.logger.error(e);
            return error_code_1.ErrorCode.RESULT_EXCEPTION;
        }
    }
    _getBlockHeaderType() {
        return block_1.DbftBlockHeader;
    }
    onCheckGlobalOptions(globalOptions) {
        if (!super.onCheckGlobalOptions(globalOptions)) {
            return false;
        }
        if (util_1.isNullOrUndefined(globalOptions.minValidator)) {
            this.m_logger.error(`globalOptions should has minValidator`);
            return false;
        }
        if (util_1.isNullOrUndefined(globalOptions.maxValidator)) {
            this.m_logger.error(`globalOptions should has maxValidator`);
            return false;
        }
        if (util_1.isNullOrUndefined(globalOptions.reSelectionBlocks)) {
            this.m_logger.error(`globalOptions should has reSelectionBlocks`);
            return false;
        }
        if (util_1.isNullOrUndefined(globalOptions.blockInterval)) {
            this.m_logger.error(`globalOptions should has blockInterval`);
            return false;
        }
        if (util_1.isNullOrUndefined(globalOptions.minWaitBlocksToMiner)) {
            this.m_logger.error(`globalOptions should has minWaitBlocksToMiner`);
            return false;
        }
        if (util_1.isNullOrUndefined(globalOptions.systemPubkey)) {
            this.m_logger.error(`globalOptions should has systemPubkey`);
            return false;
        }
        return true;
    }
    _onCheckTypeOptions(typeOptions) {
        return typeOptions.consensus === 'dbft';
    }
}
exports.DbftChain = DbftChain;
