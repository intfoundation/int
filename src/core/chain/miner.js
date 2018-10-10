"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const chain_1 = require("./chain");
const error_code_1 = require("../error_code");
const assert = require("assert");
const events_1 = require("events");
var MinerState;
(function (MinerState) {
    MinerState[MinerState["none"] = 0] = "none";
    MinerState[MinerState["init"] = 1] = "init";
    MinerState[MinerState["syncing"] = 2] = "syncing";
    MinerState[MinerState["idle"] = 3] = "idle";
    MinerState[MinerState["executing"] = 4] = "executing";
    MinerState[MinerState["mining"] = 5] = "mining";
})(MinerState = exports.MinerState || (exports.MinerState = {}));
class Miner extends events_1.EventEmitter {
    constructor(options) {
        super();
        this.m_constructOptions = options;
        this.m_logger = options.logger;
        this.m_state = MinerState.none;
    }
    get chain() {
        return this.m_chain;
    }
    get peerid() {
        return this.m_chain.peerid;
    }
    async initComponents() {
        // 上层保证await调用别重入了, 不加入中间状态了
        if (this.m_state > MinerState.none) {
            return error_code_1.ErrorCode.RESULT_OK;
        }
        this.m_chain = this._chainInstance();
        let err = await this.m_chain.initComponents();
        if (err) {
            this.m_logger.error(`miner initComponent failed for chain initComponent failed`, err);
            return err;
        }
        this.m_state = MinerState.init;
        return error_code_1.ErrorCode.RESULT_OK;
    }
    async uninitComponents() {
        // 上层保证await调用别重入了, 不加入中间状态了
        if (this.m_state !== MinerState.init) {
            return;
        }
        await this.m_chain.uninitComponents();
        delete this.m_chain;
        this.m_state = MinerState.none;
    }
    _chainInstance() {
        return new chain_1.Chain(this.m_constructOptions);
    }
    parseInstanceOptions(node, instanceOptions) {
        let value = Object.create(null);
        value.node = node;
        if (instanceOptions.has('genesisMiner')) {
            value.minOutbound = 0;
        }
        return { err: error_code_1.ErrorCode.RESULT_OK, value };
    }
    async initialize(options) {
        // 上层保证await调用别重入了, 不加入中间状态了
        if (this.m_state !== MinerState.init) {
            this.m_logger.error(`miner initialize failed hasn't initComponent`);
            return error_code_1.ErrorCode.RESULT_INVALID_STATE;
        }
        this.m_state = MinerState.syncing;
        let err = await this.m_chain.initialize(options);
        if (err) {
            this.m_logger.error(`miner initialize failed for chain initialize failed ${err}`);
            return err;
        }
        this.m_onTipBlockListener = this._onTipBlock.bind(this);
        this.m_chain.on('tipBlock', this.m_onTipBlockListener);
        this.m_state = MinerState.idle;
        return error_code_1.ErrorCode.RESULT_OK;
    }
    async uninitialize() {
        // 上层保证await调用别重入了, 不加入中间状态了
        if (this.m_state <= MinerState.init) {
            return;
        }
        this.m_chain.removeListener('tipBlock', this.m_onTipBlockListener);
        delete this.m_onTipBlockListener;
        await this.m_chain.uninitialize();
        this.m_state = MinerState.init;
    }
    async create(genesisOptions) {
        if (this.m_state !== MinerState.init) {
            this.m_logger.error(`miner create failed hasn't initComponent`);
            return error_code_1.ErrorCode.RESULT_INVALID_STATE;
        }
        let genesis = this.m_chain.newBlock();
        genesis.header.timestamp = Date.now() / 1000;
        let sr = await this.chain.storageManager.createStorage('genesis');
        if (sr.err) {
            return sr.err;
        }
        let err = error_code_1.ErrorCode.RESULT_OK;
        do {
            err = await this._decorateBlock(genesis);
            if (err) {
                break;
            }
            err = await this.chain.onCreateGenesisBlock(genesis, sr.storage, genesisOptions);
            if (err) {
                break;
            }
            let nber = await this.chain.newBlockExecutor(genesis, sr.storage);
            if (nber.err) {
                err = nber.err;
                break;
            }
            err = await nber.executor.execute();
            if (err) {
                break;
            }
            let ssr = await this.chain.storageManager.createSnapshot(sr.storage, genesis.header.hash);
            if (ssr.err) {
                err = ssr.err;
                break;
            }
            assert(ssr.snapshot);
            err = await this.chain.onPostCreateGenesis(genesis, ssr.snapshot);
        } while (false);
        await sr.storage.remove();
        return err;
    }
    async _createBlock(header) {
        await this.chain.setIdle(false);
        let ret = await this.__createBlock(header);
        await this.chain.setIdle(true);
        return ret;
    }
    async __createBlock(header) {
        let block = this.chain.newBlock(header);
        this.m_state = MinerState.executing;
        let nMax = this.chain.globalOptions.blockTxMaxCount;
        let txs = this.chain.pending.popTransaction(nMax);
        while (txs.length > 0) {
            block.content.addTransaction(txs.shift());
        }
        await this._decorateBlock(block);
        let sr = await this.chain.storageManager.createStorage(header.preBlockHash, block.header.preBlockHash);
        if (sr.err) {
            return { err: sr.err };
        }
        let err;
        do {
            let nber = await this.chain.newBlockExecutor(block, sr.storage);
            if (nber.err) {
                err = nber.err;
                break;
            }
            err = await nber.executor.execute();
            if (err) {
                this.m_logger.error(`${this.chain.peerid} execute failed! ret ${err}`);
                break;
            }
            this.m_state = MinerState.mining;
            err = await this._mineBlock(block);
            if (err) {
                this.m_logger.error(`${this.chain.peerid} mine block failed! ret ${err}`);
                break;
            }
        } while (false);
        if (err) {
            await sr.storage.remove();
            return { err };
        }
        let ssr = await this.chain.storageManager.createSnapshot(sr.storage, block.hash, true);
        if (ssr.err) {
            return { err: ssr.err };
        }
        await this.chain.addMinedBlock(block, ssr.snapshot);
        this.m_state = MinerState.idle;
        this.m_logger.info(`finish mine a block on block hash: ${this.chain.tipBlockHeader.hash} number: ${this.chain.tipBlockHeader.number}`);
        return { err, block };
    }
    /**
     * virtual
     * @param chain
     * @param tipBlock
     */
    async _onTipBlock(chain, tipBlock) {
    }
    /**
     * virtual
     * @param block
     */
    async _mineBlock(block) {
        return error_code_1.ErrorCode.RESULT_OK;
    }
    async _decorateBlock(block) {
        return error_code_1.ErrorCode.RESULT_OK;
    }
}
exports.Miner = Miner;
