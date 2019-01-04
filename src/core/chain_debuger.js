"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const fs = require("fs-extra");
const path = require("path");
const error_code_1 = require("./error_code");
const bignumber_js_1 = require("bignumber.js");
const tmp_manager_1 = require("./lib/tmp_manager");
const storage_1 = require("./storage_json/storage");
const storage_2 = require("./storage_sqlite/storage");
const value_chain_1 = require("./value_chain");
const address_1 = require("./address");
const storage_3 = require("./storage");
const util_1 = require("util");
class ValueChainDebugSession {
    constructor(debuger) {
        this.debuger = debuger;
    }
    async init(options) {
        const chain = this.debuger.chain;
        const dumpSnapshotManager = new storage_3.StorageDumpSnapshotManager({
            logger: chain.logger,
            path: options.storageDir
        });
        this.m_dumpSnapshotManager = dumpSnapshotManager;
        const snapshotManager = new storage_3.StorageLogSnapshotManager({
            path: chain.storageManager.path,
            headerStorage: chain.headerStorage,
            storageType: storage_1.JsonStorage,
            logger: chain.logger,
            dumpSnapshotManager
        });
        const tmpManager = new tmp_manager_1.TmpManager({
            root: options.storageDir,
            logger: chain.logger
        });
        let err = tmpManager.init({ clean: true });
        if (err) {
            chain.logger.error(`ValueChainDebugSession init tmpManager init failed `, error_code_1.stringifyErrorCode(err));
            return err;
        }
        const storageManager = new storage_3.StorageManager({
            tmpManager,
            path: options.storageDir,
            storageType: storage_1.JsonStorage,
            logger: chain.logger,
            snapshotManager
        });
        this.m_storageManager = storageManager;
        err = await this.m_storageManager.init();
        if (err) {
            chain.logger.error(`ValueChainDebugSession init storageManager init failed `, error_code_1.stringifyErrorCode(err));
            return err;
        }
        const ghr = await chain.headerStorage.getHeader(0);
        if (ghr.err) {
            chain.logger.error(`ValueChainDebugSession init get genesis header failed `, error_code_1.stringifyErrorCode(ghr.err));
            return ghr.err;
        }
        const genesisHash = ghr.header.hash;
        const gsr = await this.m_dumpSnapshotManager.getSnapshot(genesisHash);
        if (!gsr.err) {
            return error_code_1.ErrorCode.RESULT_OK;
        }
        else if (gsr.err !== error_code_1.ErrorCode.RESULT_NOT_FOUND) {
            chain.logger.error(`ValueChainDebugSession init get gensis dump snapshot err `, error_code_1.stringifyErrorCode(gsr.err));
            return gsr.err;
        }
        const gsvr = await chain.storageManager.getSnapshotView(genesisHash);
        if (gsvr.err) {
            chain.logger.error(`ValueChainDebugSession init get gensis dump snapshot err `, error_code_1.stringifyErrorCode(gsvr.err));
            return gsvr.err;
        }
        const srcStorage = gsvr.storage;
        let csr = await storageManager.createStorage('genesis');
        if (csr.err) {
            chain.logger.error(`ValueChainDebugSession init create genesis memory storage failed `, error_code_1.stringifyErrorCode(csr.err));
            return csr.err;
        }
        const dstStorage = csr.storage;
        const tjsr = await srcStorage.toJsonStorage(dstStorage);
        if (tjsr.err) {
            chain.logger.error(`ValueChainDebugSession init transfer genesis memory storage failed `, error_code_1.stringifyErrorCode(tjsr.err));
            return tjsr.err;
        }
        csr = await this.m_storageManager.createSnapshot(dstStorage, genesisHash, true);
        if (csr.err) {
            chain.logger.error(`ValueChainDebugSession init create genesis memory dump failed `, error_code_1.stringifyErrorCode(csr.err));
            return csr.err;
        }
        return error_code_1.ErrorCode.RESULT_OK;
    }
    async block(hash) {
        const chain = this.debuger.chain;
        const block = chain.blockStorage.get(hash);
        if (!block) {
            chain.logger.error(`block ${hash} not found`);
            return { err: error_code_1.ErrorCode.RESULT_NOT_FOUND };
        }
        const csr = await this.m_storageManager.createStorage(hash, block.header.preBlockHash);
        if (csr.err) {
            chain.logger.error(`block ${hash} create pre block storage failed `, error_code_1.stringifyErrorCode(csr.err));
        }
        const { err } = await this.debuger.debugBlock(csr.storage, block);
        csr.storage.remove();
        return { err };
    }
    async transaction(hash) {
        const chain = this.debuger.chain;
        const gtrr = await chain.getTransactionReceipt(hash);
        if (gtrr.err) {
            chain.logger.error(`transaction ${hash} get receipt failed `, error_code_1.stringifyErrorCode(gtrr.err));
            return { err: gtrr.err };
        }
        return this.block(gtrr.block.hash);
    }
    async view(from, method, params) {
        const chain = this.debuger.chain;
        let hr = await chain.headerStorage.getHeader(from);
        if (hr.err !== error_code_1.ErrorCode.RESULT_OK) {
            chain.logger.error(`view ${method} failed for load header ${from} failed for ${hr.err}`);
            return { err: hr.err };
        }
        let header = hr.header;
        let svr = await this.m_storageManager.getSnapshotView(header.hash);
        if (svr.err !== error_code_1.ErrorCode.RESULT_OK) {
            chain.logger.error(`view ${method} failed for get snapshot ${header.hash} failed for ${svr.err}`);
            return { err: svr.err };
        }
        const ret = await this.debuger.debugView(svr.storage, header, method, params);
        this.m_storageManager.releaseSnapshotView(header.hash);
        return ret;
    }
}
exports.ValueChainDebugSession = ValueChainDebugSession;
class ValueIndependDebugSession {
    constructor(debuger) {
        this.debuger = debuger;
        this.m_fakeNonces = new Map();
    }
    async init(options) {
        const storageOptions = Object.create(null);
        storageOptions.memory = options.memoryStorage;
        if (!(util_1.isNullOrUndefined(options.memoryStorage) || options.memoryStorage)) {
            const storageDir = options.storageDir;
            fs.ensureDirSync(storageDir);
            const storagePath = path.join(storageDir, `${Date.now()}`);
            storageOptions.path = storagePath;
        }
        const csr = await this.debuger.createStorage(storageOptions);
        if (csr.err) {
            return { err: csr.err };
        }
        this.m_storage = csr.storage;
        this.m_storage.createLogger();
        if (util_1.isArray(options.accounts)) {
            this.m_accounts = options.accounts.map((x) => Buffer.from(x));
        }
        else {
            this.m_accounts = [];
            for (let i = 0; i < options.accounts; ++i) {
                this.m_accounts.push(address_1.createKeyPair()[1]);
            }
        }
        this.m_interval = options.interval;
        const chain = this.debuger.chain;
        let gh = chain.newBlockHeader();
        gh.timestamp = Date.now() / 1000;
        let block = chain.newBlock(gh);
        let genesissOptions = {};
        genesissOptions.candidates = [];
        genesissOptions.miners = [];
        genesissOptions.coinbase = address_1.addressFromSecretKey(this.m_accounts[options.coinbase]);
        if (options.preBalance) {
            genesissOptions.preBalances = [];
            this.m_accounts.forEach((value) => {
                genesissOptions.preBalances.push({ address: address_1.addressFromSecretKey(value), amount: options.preBalance });
            });
        }
        const err = await chain.onCreateGenesisBlock(block, csr.storage, genesissOptions);
        if (err) {
            chain.logger.error(`onCreateGenesisBlock failed for `, error_code_1.stringifyErrorCode(err));
            return { err };
        }
        block.header.updateHash();
        const dber = await this.debuger.debugBlockEvent(this.m_storage, block.header, { preBlock: true });
        if (dber.err) {
            return { err };
        }
        this.m_curBlock = {
            header: block.header,
            transactions: [],
            receipts: []
        };
        this.m_curBlock.receipts.push(...dber.receipts);
        if (options.height > 0) {
            return await this.updateHeightTo(options.height, options.coinbase);
        }
        return { err: error_code_1.ErrorCode.RESULT_OK };
    }
    get curHeader() {
        return this.m_curBlock.header;
    }
    get storage() {
        return this.m_storage;
    }
    async updateHeightTo(height, coinbase) {
        if (height <= this.m_curBlock.header.number) {
            this.debuger.chain.logger.error(`updateHeightTo ${height} failed for current height ${this.m_curBlock.header.number} is larger`);
            return { err: error_code_1.ErrorCode.RESULT_INVALID_PARAM };
        }
        const offset = height - this.m_curBlock.header.number;
        let blocks = [];
        for (let i = 0; i < offset; ++i) {
            const nhr = await this._nextHeight(coinbase, []);
            if (nhr.err) {
                return { err: nhr.err };
            }
            blocks.push(nhr.block);
        }
        return { err: error_code_1.ErrorCode.RESULT_OK, blocks };
    }
    nextHeight(coinbase, transactions) {
        return this._nextHeight(coinbase, transactions);
    }
    async _nextHeight(coinbase, transactions) {
        let curHeader = this.m_curBlock.header;
        for (let tx of transactions) {
            const dtr = await this.debuger.debugTransaction(this.m_storage, curHeader, tx);
            if (dtr.err) {
                return { err: dtr.err };
            }
            this.m_curBlock.transactions.push(tx);
            this.m_curBlock.receipts.push(dtr.receipt);
        }
        let dber = await this.debuger.debugBlockEvent(this.m_storage, curHeader, { postBlock: true });
        if (dber.err) {
            return { err: dber.err };
        }
        this.m_curBlock.receipts.push(...dber.receipts);
        let block = this.debuger.chain.newBlock(this.m_curBlock.header);
        for (const tx of this.m_curBlock.transactions) {
            block.content.addTransaction(tx);
        }
        block.content.setReceipts(this.m_curBlock.receipts);
        block.header.updateHash();
        let header = this.debuger.chain.newBlockHeader();
        header.timestamp = curHeader.timestamp + this.m_interval;
        header.coinbase = address_1.addressFromSecretKey(this.m_accounts[coinbase]);
        header.setPreBlock(block.header);
        this.m_curBlock = {
            header: header,
            transactions: [],
            receipts: []
        };
        dber = await this.debuger.debugBlockEvent(this.m_storage, curHeader, { preBlock: true });
        if (dber.err) {
            return { err: dber.err };
        }
        this.m_curBlock.receipts.push(...dber.receipts);
        return { err: error_code_1.ErrorCode.RESULT_OK, block };
    }
    createTransaction(options) {
        const tx = new value_chain_1.ValueTransaction();
        tx.limit = new bignumber_js_1.BigNumber(0);
        tx.price = new bignumber_js_1.BigNumber(0);
        tx.value = new bignumber_js_1.BigNumber(options.value);
        tx.method = options.method;
        tx.input = options.input;
        tx.limit = options.limit;
        tx.price = options.price;
        let pk;
        if (Buffer.isBuffer(options.caller)) {
            pk = options.caller;
        }
        else {
            pk = this.m_accounts[options.caller];
        }
        tx.nonce = util_1.isNullOrUndefined(options.nonce) ? 0 : options.nonce;
        tx.sign(pk);
        return tx;
    }
    async transaction(options) {
        let pk;
        if (Buffer.isBuffer(options.caller)) {
            pk = options.caller;
        }
        else {
            pk = this.m_accounts[options.caller];
        }
        let addr = address_1.addressFromSecretKey(pk);
        const nonce = this.m_fakeNonces.has(addr) ? this.m_fakeNonces.get(addr) : 0;
        this.m_fakeNonces.set(addr, nonce + 1);
        const txop = Object.create(options);
        txop.nonce = nonce;
        const tx = this.createTransaction(txop);
        const dtr = await this.debuger.debugTransaction(this.m_storage, this.m_curBlock.header, tx);
        if (dtr.err) {
            return { err: dtr.err };
        }
        this.m_curBlock.transactions.push(tx);
        this.m_curBlock.receipts.push(dtr.receipt);
        return dtr;
    }
    wage() {
        return this.debuger.debugMinerWageEvent(this.m_storage, this.m_curBlock.header);
    }
    view(options) {
        return this.debuger.debugView(this.m_storage, this.m_curBlock.header, options.method, options.params);
    }
    getAccount(index) {
        return address_1.addressFromSecretKey(this.m_accounts[index]);
    }
}
exports.ValueIndependDebugSession = ValueIndependDebugSession;
class ChainDebuger {
    constructor(chain, logger) {
        this.chain = chain;
        this.logger = logger;
    }
    async createStorage(options) {
        const inMemory = (util_1.isNullOrUndefined(options.memory) || options.memory);
        let storage;
        if (inMemory) {
            storage = new storage_1.JsonStorage({
                filePath: '',
                logger: this.logger
            });
        }
        else {
            storage = new storage_2.SqliteStorage({
                filePath: options.path,
                logger: this.logger
            });
        }
        const err = await storage.init();
        if (err) {
            this.chain.logger.error(`init storage failed `, error_code_1.stringifyErrorCode(err));
            return { err };
        }
        storage.createLogger();
        return { err: error_code_1.ErrorCode.RESULT_OK, storage };
    }
    async debugTransaction(storage, header, tx) {
        const block = this.chain.newBlock(header);
        const nber = await this.chain.newBlockExecutor(block, storage);
        if (nber.err) {
            return { err: nber.err };
        }
        const etr = await nber.executor.executeTransaction(tx, { ignoreNoce: true });
        if (etr.err) {
            return { err: etr.err };
        }
        return { err: error_code_1.ErrorCode.RESULT_OK, receipt: etr.receipt };
    }
    async debugBlockEvent(storage, header, options) {
        const block = this.chain.newBlock(header);
        const nber = await this.chain.newBlockExecutor(block, storage);
        if (nber.err) {
            return { err: nber.err };
        }
        if (options.listener) {
            const ebr = await nber.executor.executeBlockEvent(options.listener);
            if (ebr.err) {
                return { err: ebr.err };
            }
            else {
                return { err: error_code_1.ErrorCode.RESULT_OK, receipts: [ebr.receipt] };
            }
        }
        else {
            let receipts = [];
            if (options.preBlock) {
                const ebr = await nber.executor.executePreBlockEvent();
                if (ebr.err) {
                    return { err: ebr.err };
                }
                receipts.push(...ebr.receipts);
            }
            if (options.postBlock) {
                const ebr = await nber.executor.executePostBlockEvent();
                if (ebr.err) {
                    return { err: ebr.err };
                }
                receipts.push(...ebr.receipts);
            }
            return { err: error_code_1.ErrorCode.RESULT_OK, receipts };
        }
    }
    async debugView(storage, header, method, params) {
        const nver = await this.chain.newViewExecutor(header, storage, method, params);
        if (nver.err) {
            return { err: nver.err };
        }
        return nver.executor.execute();
    }
    async debugBlock(storage, block) {
        const nber = await this.chain.newBlockExecutor(block, storage);
        if (nber.err) {
            return { err: nber.err };
        }
        const err = await nber.executor.execute();
        return { err };
    }
}
class ValueChainDebuger extends ChainDebuger {
    async debugMinerWageEvent(storage, header) {
        const block = this.chain.newBlock(header);
        const nber = await this.chain.newBlockExecutor(block, storage);
        if (nber.err) {
            return { err: nber.err };
        }
        const err = await nber.executor.executeMinerWageEvent();
        return { err };
    }
    createIndependSession() {
        return new ValueIndependDebugSession(this);
    }
    async createChainSession(storageDir) {
        let err = await this.chain.initComponents();
        if (err) {
            return { err };
        }
        const session = new ValueChainDebugSession(this);
        err = await session.init({ storageDir });
        if (err) {
            return { err };
        }
        return { err: error_code_1.ErrorCode.RESULT_OK, session };
    }
}
exports.ValueChainDebuger = ValueChainDebuger;
async function createValueDebuger(chainCreator, dataDir) {
    const ccir = await chainCreator.createChainInstance(dataDir, { readonly: true, initComponents: false });
    if (ccir.err) {
        chainCreator.logger.error(`create chain instance from ${dataDir} failed `, error_code_1.stringifyErrorCode(ccir.err));
        return { err: ccir.err };
    }
    return { err: error_code_1.ErrorCode.RESULT_OK, debuger: new ValueChainDebuger(ccir.chain, chainCreator.logger) };
}
exports.createValueDebuger = createValueDebuger;
