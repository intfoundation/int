"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const chain_1 = require("./chain");
const error_code_1 = require("../error_code");
const assert = require("assert");
const events_1 = require("events");
const util_1 = require("util");
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
        this.m_logger = options.logger;
        this.m_state = MinerState.none;
    }
    get chain() {
        return this.m_chain;
    }
    get peerid() {
        return this.m_chain.peerid;
    }
    async initComponents(dataDir, handler) {
        if (this.m_state > MinerState.none) {
            return error_code_1.ErrorCode.RESULT_OK;
        }
        this.m_chain = this._chainInstance();
        let err = await this.m_chain.initComponents(dataDir, handler);
        if (err) {
            this.m_logger.error(`miner initComponent failed for chain initComponent failed`, err);
            return err;
        }
        this.m_state = MinerState.init;
        return error_code_1.ErrorCode.RESULT_OK;
    }
    _chainInstance() {
        return new chain_1.Chain({ logger: this.m_logger });
    }
    parseInstanceOptions(node, instanceOptions) {
        let value = Object.create(null);
        value.node = node;
        return { err: error_code_1.ErrorCode.RESULT_OK, value };
    }
    async initialize(options) {
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
        this.m_chain.on('tipBlock', (chain, tipBlock) => {
            this._onTipBlock(this.m_chain, tipBlock);
        });
        this.m_state = MinerState.idle;
        return error_code_1.ErrorCode.RESULT_OK;
    }
    async create(globalOptions, genesisOptions) {
        if (this.m_state !== MinerState.init) {
            this.m_logger.error(`miner create failed hasn't initComponent`);
            return error_code_1.ErrorCode.RESULT_INVALID_STATE;
        }
        if (!this.m_chain.onCheckGlobalOptions(globalOptions)) {
            this.m_logger.error(`miner create failed for invalid globalOptions`, globalOptions);
        }
        let genesis = this.m_chain.newBlock();
        genesis.header.timestamp = Date.now() / 1000;
        let sr = await this.chain.storageManager.createStorage('genesis');
        if (sr.err) {
            return sr.err;
        }
        let err;
        do {
            err = await this._decorateBlock(genesis);
            if (err) {
                break;
            }
            err = await this._createGenesisBlock(genesis, sr.storage, globalOptions, genesisOptions);
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
            err = await this.chain.create(genesis, ssr.snapshot);
        } while (false);
        await sr.storage.remove();
        return err;
    }
    /**
     * virtual
     * @param block
     */
    async _createGenesisBlock(block, storage, globalOptions, genesisOptions) {
        let dbr = await storage.createDatabase(chain_1.Chain.dbUser);
        if (dbr.err) {
            this.m_logger.error(`miner create genensis block failed for create user table to storage failed ${dbr.err}`);
            return dbr.err;
        }
        dbr = await storage.createDatabase(chain_1.Chain.dbSystem);
        if (dbr.err) {
            return dbr.err;
        }
        let kvr = await dbr.value.createKeyValue(chain_1.Chain.kvNonce);
        if (kvr.err) {
            this.m_logger.error(`miner create genensis block failed for create nonce table to storage failed ${kvr.err}`);
            return kvr.err;
        }
        kvr = await dbr.value.createKeyValue(chain_1.Chain.kvConfig);
        if (kvr.err) {
            this.m_logger.error(`miner create genensis block failed for create config table to storage failed ${kvr.err}`);
            return kvr.err;
        }
        for (let [key, value] of Object.entries(globalOptions)) {
            if (!(util_1.isString(value) || util_1.isNumber(value) || util_1.isBoolean(value))) {
                assert(false, `invalid globalOptions ${key}`);
                this.m_logger.error(`miner create genensis block failed for write global config to storage failed for invalid globalOptions ${key}`);
                return error_code_1.ErrorCode.RESULT_INVALID_FORMAT;
            }
            let { err } = await kvr.kv.hset('global', key, value);
            if (err) {
                this.m_logger.error(`miner create genensis block failed for write global config to storage failed ${err}`);
                return err;
            }
        }
        return error_code_1.ErrorCode.RESULT_OK;
    }
    async _createBlock(header) {
        let block = this.chain.newBlock(header);
        this.m_state = MinerState.executing;
        let tx = this.chain.pending.popTransaction();
        while (tx) {
            block.content.addTransaction(tx);
            tx = this.chain.pending.popTransaction();
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
                this.m_logger.error(`${this.chain.node.node.peerid} execute failed! ret ${err}`);
                break;
            }
            this.m_state = MinerState.mining;
            err = await this._mineBlock(block);
            if (err) {
                this.m_logger.error(`${this.chain.node.node.peerid} mine block failed! ret ${err}`);
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
