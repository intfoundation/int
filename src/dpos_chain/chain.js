"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const error_code_1 = require("../error_code");
const value_chain_1 = require("../value_chain");
const block_1 = require("./block");
const consensus = require("./consensus");
const ValueContext = require("../value_chain/context");
const executor_1 = require("./executor");
const initMinersSql = 'CREATE TABLE IF NOT EXISTS "miners"("hash" CHAR(64) PRIMARY KEY NOT NULL UNIQUE, "miners" TEXT NOT NULL);';
const updateMinersSql = 'REPLACE INTO miners (hash, miners) values ($hash, $miners)';
const getMinersSql = 'SELECT miners FROM miners WHERE hash=$hash';
class DposChain extends value_chain_1.ValueChain {
    constructor(options) {
        super(options);
    }
    // DPOS中，只广播tipheader
    get _broadcastDepth() {
        return 0;
    }
    async initComponents(dataDir, handler, options) {
        let err = await super.initComponents(dataDir, handler, options);
        if (err) {
            return err;
        }
        const readonly = options && options.readonly;
        if (!readonly) {
            try {
                await this.m_db.run(initMinersSql);
            }
            catch (e) {
                this.logger.error(e);
                return error_code_1.ErrorCode.RESULT_EXCEPTION;
            }
        }
        return error_code_1.ErrorCode.RESULT_OK;
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
        let dbr = await storage.getReadableDataBase(value_chain_1.Chain.dbSystem);
        if (dbr.err) {
            return { err: dbr.err };
        }
        let de = new consensus.Context(dbr.value, this.globalOptions, this.logger);
        externalContext.vote = async (from, candiates) => {
            let vr = await de.vote(from, candiates);
            if (vr.err) {
                throw new Error();
            }
            return vr.returnCode;
        };
        externalContext.mortgage = async (from, amount) => {
            let mr = await de.mortgage(from, amount);
            if (mr.err) {
                throw new Error();
            }
            return mr.returnCode;
        };
        externalContext.unmortgage = async (from, amount) => {
            let mr = await de.unmortgage(from, amount);
            if (mr.err) {
                throw new Error();
            }
            return mr.returnCode;
        };
        externalContext.register = async (from) => {
            let mr = await de.registerToCandidate(from);
            if (mr.err) {
                throw new Error();
            }
            return mr.returnCode;
        };
        externalContext.getVote = async () => {
            let gvr = await de.getVote();
            if (gvr.err) {
                throw new Error();
            }
            return gvr.vote;
        };
        externalContext.getStoke = async (address) => {
            let gsr = await de.getStoke(address);
            if (gsr.err) {
                throw new Error();
            }
            return gsr.stoke;
        };
        externalContext.getCandidates = async () => {
            let gc = await de.getCandidates();
            if (gc.err) {
                throw Error();
            }
            return gc.candidates;
        };
        externalContext.getMiners = async () => {
            let gm = await de.getNextMiners();
            if (gm.err) {
                throw Error();
            }
            return gm.creators;
        };
        let executor = new executor_1.DposBlockExecutor({ logger: this.logger, block, storage, handler: this.handler, externContext: externalContext, globalOptions: this.globalOptions });
        return { err: error_code_1.ErrorCode.RESULT_OK, executor: executor };
    }
    async newViewExecutor(header, storage, method, param) {
        let nvex = await super.newViewExecutor(header, storage, method, param);
        let externalContext = nvex.executor.externContext;
        let dbr = await storage.getReadableDataBase(value_chain_1.Chain.dbSystem);
        if (dbr.err) {
            return { err: dbr.err };
        }
        let de = new consensus.Context(dbr.value, this.globalOptions, this.logger);
        externalContext.getVote = async () => {
            let gvr = await de.getVote();
            if (gvr.err) {
                throw new Error();
            }
            return gvr.vote;
        };
        externalContext.getStoke = async (address) => {
            let gsr = await de.getStoke(address);
            if (gsr.err) {
                throw new Error();
            }
            return gsr.stoke;
        };
        externalContext.getCandidates = async () => {
            let gc = await de.getCandidates();
            if (gc.err) {
                throw Error();
            }
            return gc.candidates;
        };
        return nvex;
    }
    async _compareWork(left, right) {
        // 更长的链优先
        let height = left.number - right.number;
        if (height !== 0) {
            return { err: error_code_1.ErrorCode.RESULT_OK, result: height };
        }
        // 高度相同更晚的优先
        let tir = await left.getTimeIndex(this);
        if (tir.err) {
            return { err: tir.err };
        }
        let leftIndex = tir.index;
        tir = await right.getTimeIndex(this);
        if (tir.err) {
            return { err: tir.err };
        }
        let rightIndex = tir.index;
        let time = leftIndex - rightIndex;
        if (time !== 0) {
            return { err: error_code_1.ErrorCode.RESULT_OK, result: time };
        }
        // 时间戳都相同， 就算了， 很罕见吧， 随缘
        return { err: error_code_1.ErrorCode.RESULT_OK, result: time };
    }
    async _calcuteReqLimit(fromHeader, limit) {
        let hr = await this.getHeader(fromHeader);
        let reSelectionBlocks = this.globalOptions.reSelectionBlocks;
        return reSelectionBlocks - (hr.header.number % reSelectionBlocks);
    }
    async getMiners(header) {
        let en = consensus.ViewContext.getElectionBlockNumber(this.globalOptions, header.number);
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
            return { err: error_code_1.ErrorCode.RESULT_OK, header: electionHeader, creators: JSON.parse(gm.miners) };
        }
        catch (e) {
            this.logger.error(e);
            return { err: error_code_1.ErrorCode.RESULT_EXCEPTION };
        }
    }
    async _onVerifiedBlock(block) {
        if (block.number !== 0 && block.number % this.globalOptions.reSelectionBlocks !== 0) {
            return error_code_1.ErrorCode.RESULT_OK;
        }
        let gs = await this.storageManager.getSnapshotView(block.hash);
        if (gs.err) {
            return gs.err;
        }
        let dbr = await gs.storage.getReadableDataBase(value_chain_1.Chain.dbSystem);
        if (dbr.err) {
            return dbr.err;
        }
        let denv = new consensus.ViewContext(dbr.value, this.globalOptions, this.m_logger);
        let minersInfo = await denv.getNextMiners();
        this.storageManager.releaseSnapshotView(block.hash);
        if (minersInfo.err) {
            return minersInfo.err;
        }
        try {
            await this.m_db.run(updateMinersSql, { $hash: block.hash, $miners: JSON.stringify(minersInfo.creators) });
            return error_code_1.ErrorCode.RESULT_OK;
        }
        catch (e) {
            this.logger.error(e);
            return error_code_1.ErrorCode.RESULT_EXCEPTION;
        }
    }
    _onCheckGlobalOptions(globalOptions) {
        if (!super._onCheckGlobalOptions(globalOptions)) {
            return false;
        }
        return consensus.onCheckGlobalOptions(globalOptions);
    }
    _getBlockHeaderType() {
        return block_1.DposBlockHeader;
    }
    _onCheckTypeOptions(typeOptions) {
        return typeOptions.consensus === 'dpos';
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
        let denv = new consensus.Context(dbr.value, this.globalOptions, this.m_logger);
        let ir = await denv.init(genesisOptions.candidates, genesisOptions.miners);
        if (ir.err) {
            return ir.err;
        }
        return error_code_1.ErrorCode.RESULT_OK;
    }
}
exports.DposChain = DposChain;
