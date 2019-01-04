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
    parseInstanceOptions(options) {
        const chainRet = this.m_chain.parseInstanceOptions(options);
        if (chainRet.err) {
            return chainRet;
        }
        let value = chainRet.value;
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
    _setIdle(name) {
        if (this._checkCancel(name)) {
            return;
        }
        this.m_state = MinerState.idle;
        delete this.m_stateContext;
    }
    _checkCancel(name) {
        if (this.m_state <= MinerState.idle) {
            return true;
        }
        if (this.m_state > MinerState.idle) {
            if (this.m_stateContext.name !== name) {
                return true;
            }
        }
        return false;
    }
    _onCancel(state, context) {
        if (state === MinerState.executing) {
            if (context && context.routine) {
                context.routine.cancel();
            }
        }
    }
    async _createExecuteRoutine(block) {
        let name = `${Date.now()}${block.header.preBlockHash}`;
        if (this.m_state !== MinerState.idle) {
            if (this.m_state > MinerState.idle) {
                if (this.m_stateContext.name === name) {
                    return { err: error_code_1.ErrorCode.RESULT_INVALID_STATE };
                }
                else {
                    let state = this.m_state;
                    let context = this.m_stateContext;
                    this.m_state = MinerState.idle;
                    delete this.m_stateContext;
                    this._onCancel(state, context);
                }
            }
            else {
                return { err: error_code_1.ErrorCode.RESULT_INVALID_STATE };
            }
        }
        this.m_state = MinerState.executing;
        this.m_stateContext = Object.create(null);
        this.m_stateContext.name = name;
        let sr = await this.chain.storageManager.createStorage(name, block.header.preBlockHash);
        if (sr.err) {
            this._setIdle(name);
            return { err: sr.err };
        }
        sr.storage.createLogger();
        const crr = this.chain.routineManager.create({ name, block, storage: sr.storage });
        if (crr.err) {
            this._setIdle(name);
            await sr.storage.remove();
            return { err: crr.err };
        }
        const routine = crr.routine;
        this.m_stateContext.routine = crr.routine;
        const next = async () => {
            let err;
            do {
                const rer = await routine.execute();
                err = rer.err;
                if (err) {
                    this.m_logger.error(`${routine.name} block execute failed! ret ${err}`);
                    break;
                }
                err = rer.result.err;
                if (err) {
                    this.m_logger.error(`${routine.name} block execute failed! ret ${err}`);
                    break;
                }
                if (this._checkCancel(routine.name)) {
                    err = error_code_1.ErrorCode.RESULT_CANCELED;
                    this.m_logger.error(`${routine.name} block execute canceled! ret ${err}`);
                    break;
                }
                this.m_state = MinerState.mining;
                delete this.m_stateContext.routine;
                err = await this._mineBlock(routine.block);
                if (err) {
                    this.m_logger.error(`mine block failed! ret ${err}`);
                    break;
                }
                if (this._checkCancel(routine.name)) {
                    err = error_code_1.ErrorCode.RESULT_CANCELED;
                    this.m_logger.error(`${name} block execute canceled! ret ${err}`);
                    break;
                }
            } while (false);
            this._setIdle(routine.name);
            if (err) {
                await routine.storage.remove();
                return { err };
            }
            let ssr = await this.chain.storageManager.createSnapshot(routine.storage, routine.block.hash, true);
            if (ssr.err) {
                return { err: ssr.err };
            }
            await this.chain.addMinedBlock(routine.block, ssr.snapshot);
            this.m_logger.info(`finish mine a block on block hash: ${this.chain.tipBlockHeader.hash} number: ${this.chain.tipBlockHeader.number}`);
            return { err: error_code_1.ErrorCode.RESULT_OK, block: routine.block };
        };
        return { err: error_code_1.ErrorCode.RESULT_OK, routine, next };
    }
    async _createBlock(header) {
        let block = this.chain.newBlock(header);
        this._collectTransactions(block);
        await this._decorateBlock(block);
        const cer = await this._createExecuteRoutine(block);
        if (cer.err) {
            return { err: cer.err };
        }
        return cer.next();
    }
    _collectTransactions(block) {
        let tx = this.chain.pending.popTransaction();
        while (tx) {
            block.content.addTransaction(tx);
            tx = this.chain.pending.popTransaction();
        }
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
