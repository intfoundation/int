"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const error_code_1 = require("../error_code");
const util_1 = require("util");
const value_chain_1 = require("../value_chain");
const block_1 = require("./block");
const context_1 = require("./context");
const executor_1 = require("./executor");
const ValueContext = require("../value_chain/context");
const header_storage_1 = require("./header_storage");
const getMinersSql = 'SELECT miners FROM miners WHERE hash=$hash';
class DbftChain extends value_chain_1.ValueChain {
    constructor(options) {
        super(options);
    }
    // 都不需要验证内容
    get _ignoreVerify() {
        return true;
    }
    // 不会分叉
    get _morkSnapshot() {
        return false;
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
        let context = new context_1.DbftContext(storage, this.globalOptions, this.logger);
        externalContext.register = async (caller) => {
            return await context.registerToCandidate(caller, block.number);
        };
        externalContext.mortgage = async (from, amount) => {
            return await context.mortgage(from, amount);
        };
        externalContext.unmortgage = async (from, amount) => {
            return await context.unmortgage(from, amount);
        };
        externalContext.vote = async (from, candiates) => {
            return await context.vote(from, candiates);
        };
        // externalContext.unregister = async (caller: string, address: string): Promise<ErrorCode> => {
        //     return await context.unRegisterFromCandidate(caller, address);
        // };
        externalContext.getMiners = async () => {
            let gm = await context.getMiners();
            if (gm.err) {
                throw Error(`newBlockExecutor getMiners failed errcode ${gm.err}`);
            }
            return gm.miners;
        };
        // externalContext.isMiner = async (address: string): Promise<boolean> => {
        //     let im = await context.isMiner(address);
        //     if (im.err) {
        //         throw Error('newBlockExecutor isMiner failed errcode ${gm.err}');
        //     }
        //
        //     return im.isminer!;
        // };
        let executor = new executor_1.DbftBlockExecutor({ logger: this.logger, block, storage, handler: this.m_handler, externContext: externalContext, globalOptions: this.m_globalOptions });
        return { err: error_code_1.ErrorCode.RESULT_OK, executor: executor };
    }
    async newViewExecutor(header, storage, method, param) {
        let nvex = await super.newViewExecutor(header, storage, method, param);
        let externalContext = nvex.executor.externContext;
        let dbftProxy = new context_1.DbftContext(storage, this.m_globalOptions, this.logger);
        externalContext.getMiners = async () => {
            let gm = await dbftProxy.getMiners();
            if (gm.err) {
                throw Error(`newBlockExecutor getMiners failed errcode ${gm.err}`);
            }
            return gm.miners;
        };
        externalContext.getVote = async () => {
            let gm = await dbftProxy.getVote();
            if (gm.err) {
                throw Error(`view tx getVote Execute failed errcode ${gm.err}`);
            }
            return gm.vote;
        };
        externalContext.getStake = async (address) => {
            let gm = await dbftProxy.getStake(address);
            if (gm.err) {
                throw Error(`newBlockExecutor getStake failed errcode ${gm.err}`);
            }
            return gm.stake;
        };
        externalContext.getCandidates = async () => {
            let gm = await dbftProxy.getCandidates();
            if (gm.err) {
                throw Error(`newBlockExecutor getCandidates failed errcode ${gm.err}`);
            }
            return gm.candidates;
        };
        // externalContext.isMiner = async (address: string): Promise<boolean> => {
        //     let im = await dbftProxy.isMiner(address);
        //     if (im.err) {
        //         throw Error(`newBlockExecutor isMiner failed errcode ${gm.err}`);
        //     }
        //
        //     return im.isminer!;
        // };
        return nvex;
    }
    async initComponents(options) {
        let err = await super.initComponents(options);
        if (err) {
            return err;
        }
        this.m_dbftHeaderStorage = new header_storage_1.DbftHeaderStorage({
            db: this.m_db,
            headerStorage: this.m_headerStorage,
            globalOptions: this.globalOptions,
            logger: this.logger,
            readonly: this.m_readonly
        });
        err = await this.m_dbftHeaderStorage.init();
        if (err) {
            this.logger.error(`dbft header storage init err `, err);
        }
        return err;
    }
    async uninitComponents() {
        if (this.m_dbftHeaderStorage) {
            this.m_dbftHeaderStorage.uninit();
            delete this.m_dbftHeaderStorage;
        }
        await super.uninitComponents();
    }
    _getBlockHeaderType() {
        return block_1.DbftBlockHeader;
    }
    async _onVerifiedBlock(block) {
        return await this.m_dbftHeaderStorage.addHeader(block.header, this.m_storageManager);
    }
    _onCheckGlobalOptions(globalOptions) {
        if (!super._onCheckGlobalOptions(globalOptions)) {
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
        if (util_1.isNullOrUndefined(globalOptions.numberOffsetToLastBlock)) {
            this.m_logger.error(`globalOptions should has numberOffsetToLastBlock`);
            return false;
        }
        if (util_1.isNullOrUndefined(globalOptions.banBlocks)) {
            this.m_logger.error(`globalOptions should has banBlocks`);
            return false;
        }
        // if (isNullOrUndefined(globalOptions.minWaitBlocksToMiner)) {
        //     this.m_logger.error(`globalOptions should has minWaitBlocksToMiner`);
        //     return false;
        // }
        if (util_1.isNullOrUndefined(globalOptions.superAdmin)) {
            this.m_logger.error(`globalOptions should has superAdmin`);
            return false;
        }
        if (util_1.isNullOrUndefined(globalOptions.agreeRateNumerator)) {
            this.m_logger.error(`globalOptions should has agreeRateNumerator`);
            return false;
        }
        if (util_1.isNullOrUndefined(globalOptions.agreeRateDenominator)) {
            this.m_logger.error(`globalOptions should has agreeRateDenominator`);
            return false;
        }
        return true;
    }
    _onCheckTypeOptions(typeOptions) {
        return typeOptions.consensus === 'dbft';
    }
    get dbftHeaderStorage() {
        return this.m_dbftHeaderStorage;
    }
    async _calcuteReqLimit(fromHeader, limit) {
        let hr = await this.getHeader(fromHeader);
        let reSelectionBlocks = this.globalOptions.reSelectionBlocks;
        return reSelectionBlocks - (hr.header.number % reSelectionBlocks);
    }
    async getMiners(header) {
        let en = context_1.DbftContext.getElectionBlockNumber(this.globalOptions, header.number);
        let electionHeader;
        if (header.number === en) {
            electionHeader = header;
        }
        else {
            let hr = await this.getHeader(header.preBlockHash, en - header.number + 1);
            if (hr.err) {
                this.logger.error(`get electionHeader error,number=${header.number},prevblockhash=${header.preBlockHash}`);
                return { err: hr.err };
            }
            electionHeader = hr.header;
        }
        try {
            const gm = await this.m_db.get(getMinersSql, { $hash: electionHeader.hash });
            if (!gm || !gm.miners) {
                this.logger.error(`getMinersSql error,election block hash=${electionHeader.hash},en=${en},header.height=${header.number}`);
                return { err: error_code_1.ErrorCode.RESULT_NOT_FOUND };
            }
            return { err: error_code_1.ErrorCode.RESULT_OK, miners: JSON.parse(gm.miners) };
        }
        catch (e) {
            this.logger.error(e);
            return { err: error_code_1.ErrorCode.RESULT_EXCEPTION };
        }
    }
    async onCreateGenesisBlock(block, storage, genesisOptions) {
        let err = await super.onCreateGenesisBlock(block, storage, genesisOptions);
        if (err) {
            return err;
        }
        let gkvr = await storage.getKeyValue(value_chain_1.Chain.dbSystem, value_chain_1.Chain.kvConfig);
        if (gkvr.err) {
            return gkvr.err;
        }
        let rpr = await gkvr.kv.set('consensus', 'dbft');
        if (rpr.err) {
            return rpr.err;
        }
        let dbr = await storage.getReadWritableDatabase(value_chain_1.Chain.dbSystem);
        if (dbr.err) {
            return dbr.err;
        }
        // storage的键值对要在初始化的时候就建立好
        let kvr = await dbr.value.createKeyValue(context_1.DbftContext.kvDBFT);
        if (kvr.err) {
            return kvr.err;
        }
        let denv = new context_1.DbftContext(storage, this.globalOptions, this.m_logger);
        let ir = await denv.init(genesisOptions.miners);
        if (ir.err) {
            return ir.err;
        }
        return error_code_1.ErrorCode.RESULT_OK;
    }
    getLastIrreversibleBlockNumber() {
        return this.m_tip.number;
    }
}
exports.DbftChain = DbftChain;
