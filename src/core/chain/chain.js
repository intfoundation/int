"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require("assert");
const events_1 = require("events");
const path = require("path");
const sqlite = require("sqlite");
const sqlite3 = require("sqlite3");
const fs = require("fs-extra");
const util_1 = require("util");
const error_code_1 = require("../error_code");
const logger_util_1 = require("../lib/logger_util");
const tmp_manager_1 = require("../lib/tmp_manager");
const block_1 = require("../block");
const storage_1 = require("../storage");
const storage_2 = require("../storage_sqlite/storage");
const executor_1 = require("../executor");
const pending_1 = require("./pending");
const chain_node_1 = require("./chain_node");
const executor_routine_1 = require("./executor_routine");
var ChainState;
(function (ChainState) {
    ChainState[ChainState["none"] = 0] = "none";
    ChainState[ChainState["init"] = 1] = "init";
    ChainState[ChainState["syncing"] = 2] = "syncing";
    ChainState[ChainState["synced"] = 3] = "synced";
})(ChainState || (ChainState = {}));
class Chain extends events_1.EventEmitter {
    /**
     * @param options.dataDir
     * @param options.blockHeaderType
     * @param options.node
     */
    constructor(options) {
        super();
        this.m_state = ChainState.none;
        this.m_refSnapshots = [];
        this.m_constSnapshots = [];
        this.m_pendingHeaders = new Array();
        this.m_pendingBlocks = {
            hashes: new Set(),
            sequence: new Array()
        };
        this.m_connSyncMap = new Map();
        this.m_logger = logger_util_1.initLogger(options);
        this.m_dataDir = options.dataDir;
        this.m_handler = options.handler;
        this.m_globalOptions = Object.create(null);
        Object.assign(this.m_globalOptions, options.globalOptions);
        this.m_tmpManager = new tmp_manager_1.TmpManager({ root: this.m_dataDir, logger: this.logger });
    }
    static dataDirValid(dataDir) {
        if (!fs.pathExistsSync(dataDir)) {
            return false;
        }
        if (!fs.pathExistsSync(path.join(dataDir, Chain.s_dbFile))) {
            return false;
        }
        return true;
    }
    on(event, listener) {
        return super.on(event, listener);
    }
    prependListener(event, listener) {
        return super.prependListener(event, listener);
    }
    once(event, listener) {
        return super.once(event, listener);
    }
    prependOnceListener(event, listener) {
        return super.prependOnceListener(event, listener);
    }
    // broadcast数目，广播header时会同时广播tip到这个深度的header
    get _broadcastDepth() {
        return this.m_instanceOptions.confirmDepth;
    }
    get _confirmDepth() {
        return this.m_instanceOptions.confirmDepth;
    }
    get _headerReqLimit() {
        return this.m_instanceOptions.headerReqLimit;
    }
    get _initializePeerCount() {
        return this.m_instanceOptions.initializePeerCount;
    }
    get _ignoreVerify() {
        return this.m_instanceOptions.ignoreVerify;
    }
    get _saveMismatch() {
        return this.m_logger.level === 'debug';
    }
    get globalOptions() {
        const c = this.m_globalOptions;
        return c;
    }
    get logger() {
        return this.m_logger;
    }
    get pending() {
        return this.m_pending;
    }
    get storageManager() {
        return this.m_storageManager;
    }
    get blockStorage() {
        return this.m_blockStorage;
    }
    get dataDir() {
        return this.m_dataDir;
    }
    get node() {
        return this.m_node;
    }
    get peerid() {
        return this.m_node.base.peerid;
    }
    get handler() {
        return this.m_handler;
    }
    get headerStorage() {
        return this.m_headerStorage;
    }
    get routineManager() {
        return this.m_routineManager;
    }
    get tmpManager() {
        return this.m_tmpManager;
    }
    async _loadGenesis() {
        let genesis = await this.m_headerStorage.getHeader(0);
        if (genesis.err) {
            return genesis.err;
        }
        let gsv = await this.m_storageManager.getSnapshotView(genesis.header.hash);
        if (gsv.err) {
            this.m_logger.error(`chain initialize failed for load genesis snapshot failed ${gsv.err}`);
            return gsv.err;
        }
        this.m_constSnapshots.push(genesis.header.hash);
        let dbr = await gsv.storage.getReadableDataBase(Chain.dbSystem);
        if (dbr.err) {
            this.m_logger.error(`chain initialize failed for load system database failed ${dbr.err}`);
            return dbr.err;
        }
        let kvr = await dbr.value.getReadableKeyValue(Chain.kvConfig);
        if (kvr.err) {
            this.m_logger.error(`chain initialize failed for load global config failed ${kvr.err}`);
            return kvr.err;
        }
        let typeOptions = Object.create(null);
        let kvgr = await kvr.kv.get('consensus');
        if (kvgr.err) {
            this.m_logger.error(`chain initialize failed for load global config consensus failed ${kvgr.err}`);
            return kvgr.err;
        }
        typeOptions.consensus = kvgr.value;
        kvgr = await kvr.kv.lrange('features', 1, -1);
        if (kvgr.err === error_code_1.ErrorCode.RESULT_OK) {
            typeOptions.features = kvgr.value;
        }
        else if (kvgr.err === error_code_1.ErrorCode.RESULT_NOT_FOUND) {
            typeOptions.features = [];
        }
        else {
            this.m_logger.error(`chain initialize failed for load global config features failed ${kvgr.err}`);
            return kvgr.err;
        }
        if (!this._onCheckTypeOptions(typeOptions)) {
            this.m_logger.error(`chain initialize failed for check type options failed`);
            return error_code_1.ErrorCode.RESULT_INVALID_BLOCK;
        }
        kvgr = await kvr.kv.hgetall('global');
        if (kvgr.err) {
            this.m_logger.error(`chain initialize failed for load global config global failed ${kvgr.err}`);
            return kvgr.err;
        }
        // 将hgetall返回的数组转换成对象
        if (Array.isArray(kvgr.value)) {
            kvgr.value = kvgr.value.reduce((obj, item) => {
                const { key, value } = item;
                obj[key] = value;
                return obj;
            }, {});
        }
        // TODO: compare with globalOptions
        return error_code_1.ErrorCode.RESULT_OK;
    }
    async initComponents(options) {
        // 上层保证await调用别重入了, 不加入中间状态了
        if (this.m_state >= ChainState.init) {
            return error_code_1.ErrorCode.RESULT_OK;
        }
        if (!await this._onCheckGlobalOptions(this.m_globalOptions)) {
            return error_code_1.ErrorCode.RESULT_INVALID_PARAM;
        }
        const readonly = options && options.readonly;
        this.m_readonly = readonly;
        let err;
        err = this.m_tmpManager.init({ clean: !this.m_readonly });
        if (err) {
            this.m_logger.error(`chain init faield for tmp manager init failed `, err);
            return err;
        }
        this.m_blockStorage = new block_1.BlockStorage({
            logger: this.m_logger,
            path: this.m_dataDir,
            blockHeaderType: this._getBlockHeaderType(),
            transactionType: this._getTransactionType(),
            receiptType: this._getReceiptType(),
            readonly
        });
        await this.m_blockStorage.init();
        let sqliteOptions = {};
        if (!readonly) {
            sqliteOptions.mode = sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE;
        }
        else {
            sqliteOptions.mode = sqlite3.OPEN_READONLY;
        }
        try {
            this.m_db = await sqlite.open(this.m_dataDir + '/' + Chain.s_dbFile, sqliteOptions);
        }
        catch (e) {
            this.m_logger.error(`open database failed`, e);
            return error_code_1.ErrorCode.RESULT_EXCEPTION;
        }
        this.m_headerStorage = new block_1.HeaderStorage({
            logger: this.m_logger,
            blockHeaderType: this._getBlockHeaderType(),
            db: this.m_db,
            blockStorage: this.m_blockStorage,
            readonly
        });
        err = await this.m_headerStorage.init();
        if (err) {
            this.m_logger.error(`chain init faield for header storage init failed `, err);
            return err;
        }
        this.m_storageManager = new storage_1.StorageManager({
            path: path.join(this.m_dataDir, 'storage'),
            tmpManager: this.m_tmpManager,
            storageType: storage_2.SqliteStorage,
            logger: this.m_logger,
            headerStorage: this.m_headerStorage,
            readonly
        });
        err = await this.m_storageManager.init();
        if (err) {
            return err;
        }
        this.m_state = ChainState.init;
        return error_code_1.ErrorCode.RESULT_OK;
    }
    async uninitComponents() {
        // 上层保证await调用别重入了, 不加入中间状态了
        if (this.m_state !== ChainState.init) {
            return;
        }
        this.m_storageManager.uninit();
        delete this.m_storageManager;
        this.m_headerStorage.uninit();
        delete this.m_headerStorage;
        await this.m_db.close();
        delete this.m_db;
        this.m_blockStorage.uninit();
        delete this.m_blockStorage;
        delete this.m_handler;
        delete this.m_dataDir;
        this.m_state = ChainState.none;
    }
    _onCheckTypeOptions(typeOptions) {
        return true;
    }
    _onCheckGlobalOptions(globalOptions) {
        if (util_1.isNullOrUndefined(globalOptions.txlivetime)) {
            globalOptions.txlivetime = 60 * 60;
        }
        if (util_1.isNullOrUndefined(globalOptions.maxPengdingCount)) {
            globalOptions.maxPengdingCount = 10000;
        }
        if (util_1.isNullOrUndefined(globalOptions.warnPengdingCount)) {
            globalOptions.warnPengdingCount = 5000;
        }
        return true;
    }
    parseInstanceOptions(options) {
        let value = Object.create(null);
        value.node = options.parsed.node;
        value.routineManagerType = options.parsed.routineManagerType;
        value.ignoreBan = options.origin.get('ignoreBan');
        value.saveMismatch = options.origin.get('saveMismatch');
        return { err: error_code_1.ErrorCode.RESULT_OK, value };
    }
    async initialize(instanceOptions) {
        // 上层保证await调用别重入了, 不加入中间状态了
        if (this.m_state !== ChainState.init) {
            this.m_logger.error(`chain initialize failed for hasn't initComponent`);
            return error_code_1.ErrorCode.RESULT_INVALID_STATE;
        }
        let err = await this._loadGenesis();
        if (err) {
            return err;
        }
        this.m_state = ChainState.syncing;
        let _instanceOptions = Object.create(null);
        Object.assign(_instanceOptions, instanceOptions);
        // 初始化时，要同步的peer数目，与这个数目的peer完成同步之后，才开始接收tx，挖矿等等
        _instanceOptions.initializePeerCount = !util_1.isNullOrUndefined(instanceOptions.initializePeerCount) ? instanceOptions.initializePeerCount : 1;
        // 初始化时，一次请求的最大header数目
        _instanceOptions.headerReqLimit = !util_1.isNullOrUndefined(instanceOptions.headerReqLimit) ? instanceOptions.headerReqLimit : 2000;
        // confirm数目，当块的depth超过这个值时，认为时绝对安全的；分叉超过这个depth的两个fork，无法自动合并回去
        _instanceOptions.confirmDepth = !util_1.isNullOrUndefined(instanceOptions.confirmDepth) ? instanceOptions.confirmDepth : 6;
        _instanceOptions.ignoreVerify = !util_1.isNullOrUndefined(instanceOptions.ignoreVerify) ? instanceOptions.ignoreVerify : false;
        this.m_instanceOptions = _instanceOptions;
        this.m_pending = this._createPending();
        this.m_pending.on('txAdded', (tx) => {
            this.logger.debug(`broadcast transaction txhash=${tx.hash}, nonce=${tx.nonce}, address=${tx.address}`);
            this.m_node.broadcast([tx]);
        });
        this.m_pending.init();
        this.m_routineManager = new instanceOptions.routineManagerType(this);
        let baseNode = this._createChainNode();
        let node = new chain_node_1.ChainNode({
            node: baseNode,
            blockStorage: this.m_blockStorage,
            storageManager: this.m_storageManager,
            blockWithLog: !!this._ignoreVerify
        });
        this.m_node = node;
        this.m_node.on('blocks', (params) => {
            this._addPendingBlocks(params);
        });
        this.m_node.on('headers', (params) => {
            this._addPendingHeaders(params);
        });
        this.m_node.on('transactions', async (conn, transactions) => {
            for (let tx of transactions) {
                const _err = await this._addTransaction(tx);
                if (_err === error_code_1.ErrorCode.RESULT_TX_CHECKER_ERROR) {
                    this._banConnection(conn.getRemote(), block_1.BAN_LEVEL.forever);
                    break;
                }
            }
        });
        this.m_node.base.on('ban', (remote) => {
            this._onConnectionError(remote);
        });
        this.m_node.base.on('error', (connRemotePeer) => {
            this._onConnectionError(connRemotePeer);
        });
        err = await this._loadChain();
        if (err) {
            return err;
        }
        // init chainnode in _initialBlockDownload
        err = await this._initialBlockDownload();
        if (err) {
            return err;
        }
        err = await new Promise(async (resolve) => {
            this.prependOnceListener('tipBlock', () => {
                this.m_logger.info(`chain initialized success, tip number: ${this.m_tip.number} hash: ${this.m_tip.hash}`);
                resolve(error_code_1.ErrorCode.RESULT_OK);
            });
        });
        if (err) {
            return err;
        }
        // 初始化完成之后开始监听，这样初始化中的节点不会被作为初始化的sync 节点
        err = await this.m_node.listen();
        if (err) {
            return err;
        }
        return error_code_1.ErrorCode.RESULT_OK;
    }
    async uninitialize() {
        // 上层保证await调用别重入了, 不加入中间状态了
        if (this.m_state <= ChainState.init) {
            return;
        }
        await this.m_node.uninit();
        delete this.m_node;
        this.m_pending.uninit();
        delete this.m_pending;
        delete this.m_instanceOptions;
        for (let s of this.m_constSnapshots) {
            this.m_storageManager.releaseSnapshotView(s);
        }
        this.m_state = ChainState.init;
    }
    _createPending() {
        return new pending_1.PendingTransactions({
            storageManager: this.m_storageManager,
            logger: this.logger,
            txlivetime: this.m_globalOptions.txlivetime,
            handler: this.m_handler,
            maxPengdingCount: this.m_globalOptions.maxPengdingCount,
            warnPendingCount: this.m_globalOptions.warnPengdingCount
        });
    }
    _createChainNode() {
        return new block_1.RandomOutNode({
            node: this.m_instanceOptions.node,
            minOutbound: !util_1.isNullOrUndefined(this.m_instanceOptions.minOutbound) ? this.m_instanceOptions.minOutbound : 8,
            checkCycle: this.m_instanceOptions.connectionCheckCycle ? this.m_instanceOptions.connectionCheckCycle : 1000,
            dataDir: this.m_dataDir,
            logger: this.m_logger,
            headerStorage: this.m_headerStorage,
            blockHeaderType: this._getBlockHeaderType(),
            transactionType: this._getTransactionType(),
            receiptType: this._getReceiptType(),
            ignoreBan: this.m_instanceOptions.ignoreBan
        });
    }
    async _loadChain() {
        assert(this.m_headerStorage);
        assert(this.m_blockStorage);
        let result = await this.m_headerStorage.getHeader('latest');
        let err = result.err;
        if (err || !result.header) {
            return err;
        }
        err = await this._updateTip(result.header);
        if (err) {
            return err;
        }
        this.m_logger.info(`load chain tip from disk, height:${this.m_tip.number}, hash:${this.m_tip.hash}`);
        return error_code_1.ErrorCode.RESULT_OK;
    }
    async _updateTip(tip) {
        this.m_tip = tip;
        for (let blockHash of this.m_refSnapshots) {
            this.m_storageManager.releaseSnapshotView(blockHash);
        }
        this.m_refSnapshots = [];
        let gsv = await this.m_storageManager.getSnapshotView(tip.hash);
        if (gsv.err) {
            return gsv.err;
        }
        this.m_refSnapshots.push(tip.hash);
        let mork = tip.number - 2 * this._confirmDepth;
        mork = mork >= 0 ? mork : 0;
        if (mork !== tip.number) {
            let hr = await this.m_headerStorage.getHeader(mork);
            if (hr.err) {
                return hr.err;
            }
            gsv = await this.m_storageManager.getSnapshotView(hr.header.hash);
            if (gsv.err) {
                return gsv.err;
            }
            this.m_refSnapshots.push(hr.header.hash);
        }
        this.m_storageManager.recycleSnapShot();
        let err = await this.m_pending.updateTipBlock(tip);
        if (err) {
            return err;
        }
        return error_code_1.ErrorCode.RESULT_OK;
    }
    get tipBlockHeader() {
        return this.m_tip;
    }
    getBlock(hash) {
        return this.m_blockStorage.get(hash);
    }
    async _addTransaction(tx) {
        if (this.m_state !== ChainState.synced) {
            return error_code_1.ErrorCode.RESULT_INVALID_STATE;
        }
        let err = await this.m_pending.addTransaction(tx);
        return err;
    }
    async _compareWork(left, right) {
        // TODO: pow 用height并不安全， 因为大bits高height的工作量可能低于小bits低height 的工作量
        return { err: error_code_1.ErrorCode.RESULT_OK, result: left.number - right.number };
    }
    async _addPendingHeaders(params) {
        // TODO: 这里可以和pending block一样优化，去重已经有的
        this.m_pendingHeaders.push(params);
        if (this.m_pendingHeaders.length === 1) {
            while (this.m_pendingHeaders.length) {
                let _params = this.m_pendingHeaders[0];
                await this._addHeaders(_params);
                this.m_pendingHeaders.shift();
            }
        }
    }
    async _addPendingBlocks(params, head = false) {
        let pendingBlocks = this.m_pendingBlocks;
        if (pendingBlocks.hashes.has(params.block.hash)) {
            return;
        }
        if (head) {
            pendingBlocks.sequence.unshift(params);
        }
        else {
            pendingBlocks.sequence.push(params);
        }
        pendingBlocks.hashes.add(params.block.hash);
        if (!pendingBlocks.adding) {
            while (pendingBlocks.sequence.length) {
                pendingBlocks.adding = pendingBlocks.sequence.shift();
                let { block, remote, storage, redoLog } = pendingBlocks.adding;
                await this._addBlock(block, { remote, storage, redoLog });
                pendingBlocks.hashes.delete(block.hash);
                delete pendingBlocks.adding;
            }
        }
    }
    _onConnectionError(remote) {
        this.m_connSyncMap.delete(remote);
        let hi = 1;
        while (true) {
            if (hi >= this.m_pendingHeaders.length) {
                break;
            }
            if (this.m_pendingHeaders[hi].remote === remote) {
                this.m_pendingHeaders.splice(hi, 1);
            }
            else {
                ++hi;
            }
        }
        let bi = 1;
        let pendingBlocks = this.m_pendingBlocks;
        while (true) {
            if (bi >= pendingBlocks.sequence.length) {
                break;
            }
            let params = pendingBlocks.sequence[bi];
            if (params.remote === remote) {
                pendingBlocks.sequence.splice(bi, 1);
                pendingBlocks.hashes.delete(params.block.hash);
            }
            else {
                ++bi;
            }
        }
    }
    _banConnection(remote, level) {
        let connSync;
        if (typeof remote === 'string') {
            connSync = this.m_connSyncMap.get(remote);
            if (!connSync) {
                return error_code_1.ErrorCode.RESULT_NOT_FOUND;
            }
            this.m_node.base.banConnection(remote, level);
        }
        else {
            connSync = remote;
            this.m_node.base.banConnection(connSync.conn.getRemote(), level);
        }
        return error_code_1.ErrorCode.RESULT_OK;
    }
    async _continueSyncWithConnection(from) {
        let connSync;
        if (typeof from === 'string') {
            connSync = this.m_connSyncMap.get(from);
            if (!connSync) {
                return error_code_1.ErrorCode.RESULT_NOT_FOUND;
            }
        }
        else {
            connSync = from;
        }
        if (connSync.moreHeaders) {
            connSync.lastRequestHeader = connSync.lastRecvHeader.hash;
            let limit = await this._calcuteReqLimit(connSync.lastRequestHeader, this._headerReqLimit);
            connSync.reqLimit = limit;
            this.m_node.requestHeaders(connSync.conn, { from: connSync.lastRecvHeader.hash, limit });
        }
        else {
            connSync.state = ChainState.synced;
            delete connSync.moreHeaders;
            if (this.m_state === ChainState.syncing) {
                let syncedCount = 0;
                let out = this.m_node.base.node.getOutbounds();
                for (let conn of out) {
                    let _connSync = this.m_connSyncMap.get(conn.getRemote());
                    if (_connSync && _connSync.state === ChainState.synced) {
                        ++syncedCount;
                    }
                }
                if (syncedCount >= this._initializePeerCount) {
                    this.m_state = ChainState.synced;
                    this.logger.debug(`emit tipBlock with ${this.m_tip.hash} ${this.m_tip.number}`);
                    this.emit('tipBlock', this, this.m_tip);
                }
            }
        }
        return error_code_1.ErrorCode.RESULT_OK;
    }
    _createSyncedConnection(from) {
        let conn = this.m_node.base.node.getConnection(from);
        if (!conn) {
            return { err: error_code_1.ErrorCode.RESULT_NOT_FOUND };
        }
        let connSync = { state: ChainState.synced, conn, reqLimit: this._headerReqLimit };
        this.m_connSyncMap.set(from, connSync);
        return { err: error_code_1.ErrorCode.RESULT_OK, connSync };
    }
    async _beginSyncWithConnection(from, fromHeader) {
        let connSync;
        if (typeof from === 'string') {
            connSync = this.m_connSyncMap.get(from);
            if (!connSync) {
                let conn = this.m_node.base.node.getConnection(from);
                if (!conn) {
                    return error_code_1.ErrorCode.RESULT_NOT_FOUND;
                }
                connSync = { state: ChainState.syncing, conn, reqLimit: this._headerReqLimit };
                this.m_connSyncMap.set(from, connSync);
            }
        }
        else {
            connSync = from;
        }
        connSync.state = ChainState.syncing;
        connSync.lastRequestHeader = fromHeader;
        let limit = await this._calcuteReqLimit(fromHeader, this._headerReqLimit);
        connSync.reqLimit = limit;
        this.m_node.requestHeaders(connSync.conn, { from: fromHeader, limit });
        return error_code_1.ErrorCode.RESULT_OK;
    }
    async _calcuteReqLimit(fromHeader, limit) {
        return limit;
    }
    async _verifyAndSaveHeaders(headers) {
        assert(this.m_headerStorage);
        let hr = await this.m_headerStorage.getHeader(headers[0].preBlockHash);
        if (hr.err) {
            return { err: hr.err };
        }
        let toSave = [];
        let toRequest = [];
        for (let ix = 0; ix < headers.length; ++ix) {
            let header = headers[ix];
            let result = await this.m_headerStorage.getHeader(header.hash);
            if (result.err) {
                if (result.err === error_code_1.ErrorCode.RESULT_NOT_FOUND) {
                    toSave = headers.slice(ix);
                    break;
                }
                else {
                    return { err: result.err };
                }
            }
            else if (result.verified === block_1.VERIFY_STATE.notVerified) {
                // 已经认证过的block就不要再请求了
                toRequest.push(header);
            }
            else if (result.verified === block_1.VERIFY_STATE.invalid) {
                // 如果这个header已经判定为invalid，那么后续的header也不用被加入了
                return { err: error_code_1.ErrorCode.RESULT_INVALID_BLOCK };
            }
        }
        toRequest.push(...toSave);
        assert(this.m_tip);
        for (let header of toSave) {
            let { err, valid } = await header.verify(this);
            if (err) {
                return { err };
            }
            if (!valid) {
                return { err: error_code_1.ErrorCode.RESULT_INVALID_BLOCK };
            }
            let saveRet = await this.m_headerStorage.saveHeader(header);
            if (saveRet) {
                return { err: saveRet };
            }
        }
        return { err: error_code_1.ErrorCode.RESULT_OK, toRequest };
    }
    async _addHeaders(params) {
        let { remote, headers, request, error } = params;
        let connSync = this.m_connSyncMap.get(remote);
        if (request && !connSync) {
            // 非广播的headers一定请求过
            return error_code_1.ErrorCode.RESULT_NOT_FOUND;
        }
        if (!connSync) {
            // 广播过来的可能没有请求过header，此时创建conn sync
            let cr = this._createSyncedConnection(remote);
            if (cr.err) {
                return cr.err;
            }
            connSync = cr.connSync;
        }
        if (connSync.state === ChainState.syncing) {
            if (request && request.from) {
                if (request.from !== connSync.lastRequestHeader) {
                    this.m_logger.error(`request ${connSync.lastRequestHeader} from ${remote} while got headers from ${request.from}`);
                    this._banConnection(remote, block_1.BAN_LEVEL.forever);
                    return error_code_1.ErrorCode.RESULT_OK;
                }
                if (error === error_code_1.ErrorCode.RESULT_OK) {
                    // 现有机制下，不可能ok并返回空，干掉
                    if (!headers.length) {
                        this._banConnection(remote, block_1.BAN_LEVEL.forever);
                        return error_code_1.ErrorCode.RESULT_OK;
                    }
                    this.m_logger.info(`get headers [${headers[0].hash}, ${headers[headers.length - 1].hash}] from ${remote} at syncing`);
                    let vsh = await this._verifyAndSaveHeaders(headers);
                    // 找不到的header， 或者验证header出错， 都干掉
                    if (vsh.err === error_code_1.ErrorCode.RESULT_NOT_FOUND || vsh.err === error_code_1.ErrorCode.RESULT_INVALID_BLOCK) {
                        this._banConnection(remote, block_1.BAN_LEVEL.forever);
                        return error_code_1.ErrorCode.RESULT_OK;
                    }
                    else if (vsh.err) {
                        // TODO：本地出错，可以重新请求？
                        return vsh.err;
                    }
                    connSync.lastRecvHeader = headers[headers.length - 1];
                    connSync.moreHeaders = (headers.length === connSync.reqLimit);
                    if (vsh.toRequest.length) {
                        // 向conn 发出block请求
                        // 如果options.redoLog=1 同时也请求redo log内容, redo log 会随着block package 一起返回
                        this.m_node.requestBlocks({
                            headers: vsh.toRequest,
                            redoLog: this._ignoreVerify ? 1 : 0,
                        }, remote);
                    }
                    else {
                        // 继续同步header回来
                        return await this._continueSyncWithConnection(connSync);
                    }
                }
                else if (error === error_code_1.ErrorCode.RESULT_SKIPPED) {
                    // 没有更多了
                    connSync.moreHeaders = false;
                    // 继续同步header回来
                    return await this._continueSyncWithConnection(connSync);
                }
                else if (error === error_code_1.ErrorCode.RESULT_NOT_FOUND) {
                    // 上次请求的没有获取到，那么朝前回退limit再请求
                    let hsr = await this.getHeader(connSync.lastRequestHeader, -this._headerReqLimit);
                    if (hsr.err) {
                        return hsr.err;
                    }
                    return await this._beginSyncWithConnection(connSync, hsr.header.hash);
                }
                else {
                    assert(false, `get header with syncing from ${remote} with err ${error}`);
                }
            }
            else if (!request) {
                // 广播来的直接忽略
            }
            else {
                this.m_logger.error(`invalid header request ${request} response when syncing with ${remote}`);
                this._banConnection(remote, block_1.BAN_LEVEL.forever);
            }
        }
        else if (connSync.state === ChainState.synced) {
            if (!request) {
                this.m_logger.info(`get headers [${headers[0].hash}, ${headers[headers.length - 1].hash}] from ${remote} at synced`);
                let vsh = await this._verifyAndSaveHeaders(headers);
                // 验证header出错干掉
                if (vsh.err === error_code_1.ErrorCode.RESULT_INVALID_BLOCK) {
                    this._banConnection(remote, block_1.BAN_LEVEL.day);
                    return error_code_1.ErrorCode.RESULT_OK;
                }
                else if (vsh.err === error_code_1.ErrorCode.RESULT_NOT_FOUND) {
                    // 找不到可能是因为落后太久了，先从当前tip请求吧
                    let hsr = await this.getHeader(this.m_tip, -this._confirmDepth + 1);
                    if (hsr.err) {
                        return hsr.err;
                    }
                    return await this._beginSyncWithConnection(connSync, hsr.header.hash);
                }
                else if (vsh.err) {
                    // TODO：本地出错，可以重新请求？
                    return vsh.err;
                }
                connSync.lastRecvHeader = headers[headers.length - 1];
                this.m_node.requestBlocks({ headers: vsh.toRequest }, remote);
            }
            else {
                // 不是广播来来的都不对
                this.m_logger.error(`invalid header request ${request} response when synced with ${remote}`);
                this._banConnection(remote, block_1.BAN_LEVEL.forever);
            }
        }
        return error_code_1.ErrorCode.RESULT_OK;
    }
    async _addBlock(block, options) {
        // try{
        assert(this.m_headerStorage);
        this.m_logger.info(`begin adding block number: ${block.number}  hash: ${block.hash} to chain `);
        let err = error_code_1.ErrorCode.RESULT_OK;
        if (options.storage) {
            // mine from local miner
            let _err = await this._addVerifiedBlock(block, options.storage);
            if (_err) {
                return _err;
            }
        }
        else {
            do {
                // 加入block之前肯定已经有header了
                let headerResult = await this.m_headerStorage.getHeader(block.hash);
                if (headerResult.err) {
                    this.m_logger.warn(`ignore block for header missing`);
                    err = headerResult.err;
                    if (err === error_code_1.ErrorCode.RESULT_NOT_FOUND) {
                        err = error_code_1.ErrorCode.RESULT_INVALID_BLOCK;
                    }
                    break;
                }
                assert(headerResult.header && headerResult.verified !== undefined);
                if (headerResult.verified === block_1.VERIFY_STATE.verified
                    || headerResult.verified === block_1.VERIFY_STATE.invalid) {
                    this.m_logger.info(`ignore block for block has been verified as ${headerResult.verified}`);
                    if (headerResult.verified === block_1.VERIFY_STATE.invalid) {
                        err = error_code_1.ErrorCode.RESULT_INVALID_BLOCK;
                    }
                    else {
                        err = error_code_1.ErrorCode.RESULT_SKIPPED;
                    }
                    break;
                }
                headerResult = await this.m_headerStorage.getHeader(block.header.preBlockHash);
                if (headerResult.err) {
                    this.m_logger.warn(`ignore block for previous header hash: ${block.header.preBlockHash} missing`);
                    err = headerResult.err;
                    break;
                }
                assert(headerResult.header && headerResult.verified !== undefined);
                if (headerResult.verified === block_1.VERIFY_STATE.notVerified) {
                    this.m_logger.info(`ignore block for previous header hash: ${block.header.preBlockHash} hasn't been verified`);
                    err = error_code_1.ErrorCode.RESULT_SKIPPED;
                    break;
                }
                else if (headerResult.verified === block_1.VERIFY_STATE.invalid) {
                    this.m_logger.info(`ignore block for previous block has been verified as invalid`);
                    this.m_headerStorage.updateVerified(block.header, block_1.VERIFY_STATE.invalid);
                    err = error_code_1.ErrorCode.RESULT_INVALID_BLOCK;
                    break;
                }
            } while (false);
            if (err === error_code_1.ErrorCode.RESULT_INVALID_BLOCK) {
                if (options.remote) {
                    this._banConnection(options.remote, block_1.BAN_LEVEL.day);
                }
                return err;
            }
            else if (err !== error_code_1.ErrorCode.RESULT_OK) {
                return err;
            }
            const name = `${block.hash}${Date.now()}`;
            let rr = await this.verifyBlock(name, block, { redoLog: options.redoLog });
            if (rr.err) {
                this.m_logger.error(`add block failed for verify failed for ${rr.err}`);
                return rr.err;
            }
            const routine = rr.routine;
            const vbr = await rr.next();
            if (vbr.valid === error_code_1.ErrorCode.RESULT_OK) {
                this.m_logger.info(`${routine.name} block verified`);
                assert(routine.storage, `${routine.name} verified ok but storage missed`);
                let csr = await this.m_storageManager.createSnapshot(routine.storage, block.hash);
                if (csr.err) {
                    this.m_logger.error(`${name} verified ok but save snapshot failed`);
                    await routine.storage.remove();
                    return csr.err;
                }
                let _err = await this._addVerifiedBlock(block, csr.snapshot);
                if (_err) {
                    return _err;
                }
            }
            else {
                this.m_logger.info(`${routine.name} block invalid for `, error_code_1.stringifyErrorCode(vbr.valid));
                if (options.remote) {
                    this._banConnection(options.remote, block_1.BAN_LEVEL.day);
                }
                let _err = await this.m_headerStorage.updateVerified(block.header, block_1.VERIFY_STATE.invalid);
                if (_err) {
                    return _err;
                }
                return error_code_1.ErrorCode.RESULT_OK;
            }
        }
        let syncing = false;
        let synced = false;
        let broadcastExcept = new Set();
        for (let remote of this.m_connSyncMap.keys()) {
            let connSync = this.m_connSyncMap.get(remote);
            if (connSync.state === ChainState.syncing) {
                if (connSync.lastRecvHeader && connSync.lastRecvHeader.hash === block.hash) {
                    await this._continueSyncWithConnection(connSync);
                    syncing = true;
                }
                broadcastExcept.add(remote);
            }
            else {
                if (connSync.lastRecvHeader && connSync.lastRecvHeader.hash === block.hash) {
                    synced = true;
                    broadcastExcept.add(remote);
                }
            }
        }
        if (options.storage || (!syncing && synced)) {
            if (this.m_tip.hash === block.header.hash) {
                this.logger.debug(`emit tipBlock with ${this.m_tip.hash} ${this.m_tip.number}`);
                this.emit('tipBlock', this, this.m_tip);
                // 在broadcast之前执行一次recycleSnapShot
                this.m_storageManager.recycleSnapShot();
                let hr = await this.getHeader(this.m_tip, -this._broadcastDepth);
                if (hr.err) {
                    return hr.err;
                }
                assert(hr.headers);
                if (hr.headers[0].number === 0) {
                    hr.headers = hr.headers.slice(1);
                }
                this.m_node.broadcast(hr.headers, { filter: (conn) => {
                        this.m_logger.debug(`broadcast to ${conn.getRemote()}: ${!broadcastExcept.has(conn.getRemote())}`);
                        return !broadcastExcept.has(conn.getRemote());
                    } });
                this.m_logger.info(`broadcast tip headers from number: ${hr.headers[0].number} hash: ${hr.headers[0].hash} to number: ${this.m_tip.number} hash: ${this.m_tip.hash}`);
            }
        }
        let nextResult = await this.m_headerStorage.getNextHeader(block.header.hash);
        if (nextResult.err) {
            if (nextResult.err === error_code_1.ErrorCode.RESULT_NOT_FOUND) {
                return error_code_1.ErrorCode.RESULT_OK;
            }
            else {
                return nextResult.err;
            }
        }
        assert(nextResult.results && nextResult.results.length);
        for (let result of nextResult.results) {
            let _block = this.m_blockStorage.get(result.header.hash);
            if (_block) {
                this.m_logger.info(`next block hash ${result.header.hash} is ready`);
                this._addPendingBlocks({ block: _block }, true);
            }
        }
        return error_code_1.ErrorCode.RESULT_OK;
        // } catch (e) {
        //     console.error(e);
        //     return ErrorCode.RESULT_OK;
        // }
    }
    async _addVerifiedBlock(block, storage) {
        this.m_logger.info(`begin add verified block to chain`);
        assert(this.m_headerStorage);
        assert(this.m_tip);
        let cr = await this._compareWork(block.header, this.m_tip);
        if (cr.err) {
            return cr.err;
        }
        if (cr.result > 0) {
            this.m_logger.info(`begin extend chain's tip`);
            let err = await this.m_headerStorage.changeBest(block.header);
            if (err) {
                this.m_logger.info(`extend chain's tip failed for save to header storage failed for ${err}`);
                return err;
            }
            err = await this._onVerifiedBlock(block);
            err = await this._updateTip(block.header);
            if (err) {
                return err;
            }
        }
        else {
            let err = await this.m_headerStorage.updateVerified(block.header, block_1.VERIFY_STATE.verified);
            if (err) {
                this.m_logger.error(`add verified block to chain failed for update verify state to header storage failed for ${err}`);
                return err;
            }
        }
        return error_code_1.ErrorCode.RESULT_OK;
    }
    async _onVerifiedBlock(block) {
        return error_code_1.ErrorCode.RESULT_OK;
    }
    newBlockHeader() {
        return new (this._getBlockHeaderType())();
    }
    newBlock(header) {
        let block = new block_1.Block({
            header,
            headerType: this._getBlockHeaderType(),
            transactionType: this._getTransactionType(),
            receiptType: this._getReceiptType()
        });
        return block;
    }
    async newBlockExecutor(block, storage) {
        let executor = new executor_1.BlockExecutor({ logger: this.m_logger, block, storage, handler: this.m_handler, externContext: {}, globalOptions: this.m_globalOptions });
        return { err: error_code_1.ErrorCode.RESULT_OK, executor };
    }
    async newViewExecutor(header, storage, method, param) {
        let executor = new executor_1.ViewExecutor({ logger: this.m_logger, header, storage, method, param, handler: this.m_handler, externContext: {} });
        return { err: error_code_1.ErrorCode.RESULT_OK, executor };
    }
    async getHeader(arg1, arg2) {
        return await this.m_headerStorage.getHeader(arg1, arg2);
    }
    async _initialBlockDownload() {
        assert(this.m_node);
        let err = await this.m_node.init();
        if (err) {
            if (err === error_code_1.ErrorCode.RESULT_SKIPPED) {
                this.m_state = ChainState.synced;
                this.logger.debug(`emit tipBlock with ${this.m_tip.hash} ${this.m_tip.number}`);
                const tip = this.m_tip;
                setImmediate(() => {
                    this.emit('tipBlock', this, tip);
                });
                return error_code_1.ErrorCode.RESULT_OK;
            }
            return err;
        }
        this.m_node.base.on('outbound', async (conn) => {
            let syncPeer = conn;
            assert(syncPeer);
            let hr = await this.m_headerStorage.getHeader((this.m_tip.number > this._confirmDepth) ? (this.m_tip.number - this._confirmDepth) : 0);
            if (hr.err) {
                return hr.err;
            }
            assert(hr.header);
            return await this._beginSyncWithConnection(conn.getRemote(), hr.header.hash);
        });
        return error_code_1.ErrorCode.RESULT_OK;
    }
    async verifyBlock(name, block, options) {
        this.m_logger.info(`begin verify block number: ${block.number} hash: ${block.hash} `);
        let sr = await this.m_storageManager.createStorage(name, block.header.preBlockHash);
        if (sr.err) {
            this.m_logger.warn(`verify block failed for recover storage to previous block's failed for ${sr.err}`);
            return { err: sr.err };
        }
        const storage = sr.storage;
        let crr;
        // 通过redo log 来添加block的内容
        if (options && options.redoLog) {
            this.m_logger.debug(`verify block blocknumber=${block.number}, from log`);
            crr = { err: error_code_1.ErrorCode.RESULT_OK, routine: new VerifyBlockWithRedoLogRoutine({
                    name,
                    block,
                    storage,
                    redoLog: options.redoLog,
                    logger: this.logger
                }) };
        }
        else {
            this.m_logger.debug(`verify block blocknumber=${block.number}, not from log`);
            crr = this.m_routineManager.create({ name, block, storage });
        }
        if (crr.err) {
            await storage.remove();
            return { err: crr.err };
        }
        const routine = crr.routine;
        const next = async () => {
            const rr = await routine.verify();
            if (rr.err || rr.result.err) {
                this.m_logger.error(`verify block failed, blocknumber=${block.number}, rr.err=${rr.err} rr.result!.err=${rr.err ? 0 : rr.result.err}`);
                await storage.remove();
                return { err: rr.err };
            }
            if (rr.result.valid !== error_code_1.ErrorCode.RESULT_OK) {
                this.m_logger.error(`verify block failed, blocknumber=${block.number}, rr.result!.valid !== ErrorCode.RESULT_OK`);
                if (!(this._saveMismatch && rr.result.valid === error_code_1.ErrorCode.RESULT_VERIFY_NOT_MATCH)) {
                    await storage.remove();
                }
            }
            return rr.result;
        };
        return { err: error_code_1.ErrorCode.RESULT_OK, routine, next };
    }
    async addMinedBlock(block, storage) {
        this.m_blockStorage.add(block);
        this.m_logger.info(`miner mined block number:${block.number} hash:${block.hash}`);
        assert(this.m_headerStorage);
        let err = await this.m_headerStorage.saveHeader(block.header);
        if (!err) {
            this._addPendingBlocks({ block, storage });
        }
    }
    /**
     * virtual
     * @param block
     */
    async onCreateGenesisBlock(block, storage, genesisOptions) {
        let dbr = await storage.createDatabase(Chain.dbUser);
        if (dbr.err) {
            this.m_logger.error(`miner create genensis block failed for create user table to storage failed ${dbr.err}`);
            return dbr.err;
        }
        dbr = await storage.createDatabase(Chain.dbSystem);
        if (dbr.err) {
            return dbr.err;
        }
        let kvr = await dbr.value.createKeyValue(Chain.kvNonce);
        if (kvr.err) {
            this.m_logger.error(`miner create genensis block failed for create nonce table to storage failed ${kvr.err}`);
            return kvr.err;
        }
        kvr = await dbr.value.createKeyValue(Chain.kvConfig);
        if (kvr.err) {
            this.m_logger.error(`miner create genensis block failed for create config table to storage failed ${kvr.err}`);
            return kvr.err;
        }
        for (let [key, value] of Object.entries(this.globalOptions)) {
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
    async onPostCreateGenesis(genesis, storage) {
        // assert(genesis.header.storageHash === (await storage.messageDigest()).value);
        assert(genesis.number === 0);
        if (genesis.number !== 0) {
            return error_code_1.ErrorCode.RESULT_INVALID_PARAM;
        }
        assert(this.m_headerStorage && this.m_blockStorage);
        this.m_blockStorage.add(genesis);
        let err = await this.m_headerStorage.createGenesis(genesis.header);
        if (err) {
            return err;
        }
        await this._onVerifiedBlock(genesis);
        return error_code_1.ErrorCode.RESULT_OK;
    }
    async view(from, methodname, param) {
        let retInfo = { err: error_code_1.ErrorCode.RESULT_FAILED };
        let storageView;
        do {
            let hr = await this.getHeader(from);
            if (hr.err !== error_code_1.ErrorCode.RESULT_OK) {
                this.m_logger.error(`view ${methodname} failed for load header ${from} failed for ${hr.err}`);
                retInfo = { err: hr.err };
                break;
            }
            let header = hr.header;
            let svr = await this.m_storageManager.getSnapshotView(header.hash);
            if (svr.err !== error_code_1.ErrorCode.RESULT_OK) {
                this.m_logger.error(`view ${methodname} failed for get snapshot ${header.hash} failed for ${svr.err}`);
                retInfo = { err: svr.err };
                break;
            }
            storageView = svr.storage;
            let nver = await this.newViewExecutor(header, storageView, methodname, param);
            if (nver.err) {
                this.m_logger.error(`view ${methodname} failed for create view executor failed for ${nver.err}`);
                retInfo = { err: nver.err };
                this.m_storageManager.releaseSnapshotView(header.hash);
                break;
            }
            let ret1 = await nver.executor.execute();
            this.m_storageManager.releaseSnapshotView(header.hash);
            if (ret1.err === error_code_1.ErrorCode.RESULT_OK) {
                retInfo = { err: error_code_1.ErrorCode.RESULT_OK, value: ret1.value };
                break;
            }
            this.m_logger.error(`view ${methodname} failed for view executor execute failed for ${ret1.err}`);
            retInfo = { err: ret1.err };
            break;
        } while (false);
        return retInfo;
    }
    async getNonce(s) {
        return await this.m_pending.getNonce(s);
    }
    async getPendingTransactions() {
        return await this.m_pending.getPendingTransactions();
    }
    async getTransactionReceipt(s) {
        let ret = await this.m_headerStorage.txView.get(s);
        if (ret.err !== error_code_1.ErrorCode.RESULT_OK) {
            this.logger.error(`get transaction receipt ${s} failed for ${ret.err}`);
            return { err: ret.err };
        }
        let block = this.getBlock(ret.blockhash);
        if (!block) {
            this.logger.error(`get transaction receipt failed for get block ${ret.blockhash} failed`);
            return { err: error_code_1.ErrorCode.RESULT_NOT_FOUND };
        }
        let tx = block.content.getTransaction(s);
        let receipt = block.content.getReceipt(s);
        if (tx && receipt) {
            return { err: error_code_1.ErrorCode.RESULT_OK, block: block.header, tx, receipt };
        }
        assert(false, `transaction ${s} declared in ${ret.blockhash} but not found in block`);
        return { err: error_code_1.ErrorCode.RESULT_NOT_FOUND };
    }
    async getTransactionByAddress(s) {
        let ret = await this.m_headerStorage.txView.getTransactionByAddress(s);
        if (ret.err !== error_code_1.ErrorCode.RESULT_OK) {
            this.logger.error(`get transaction by address ${s} failed for ${ret.err}`);
            return { err: ret.err };
        }
        return { err: error_code_1.ErrorCode.RESULT_OK, txs: ret.txs };
    }
    addTransaction(tx) {
        return this._addTransaction(tx);
    }
    _getBlockHeaderType() {
        return block_1.BlockHeader;
    }
    _getTransactionType() {
        return block_1.Transaction;
    }
    _getReceiptType() {
        return block_1.Receipt;
    }
}
// 存储address入链的tx的最大nonce
Chain.dbSystem = '__system';
Chain.kvNonce = 'nonce'; // address<--->nonce
Chain.kvConfig = 'config';
Chain.dbUser = '__user';
Chain.s_dbFile = 'database';
exports.Chain = Chain;
class VerifyBlockWithRedoLogRoutine extends executor_routine_1.BlockExecutorRoutine {
    constructor(options) {
        super(options);
        this.m_redoLog = options.redoLog;
    }
    async execute() {
        return { err: error_code_1.ErrorCode.RESULT_NO_IMP };
    }
    async verify() {
        this.m_logger.info(`redo log, block[${this.block.number}, ${this.block.hash}]`);
        // 执行redolog
        this.storage.createLogger();
        let redoError = await this.m_redoLog.redoOnStorage(this.storage);
        if (redoError) {
            this.m_logger.error(`redo error ${redoError}`);
            return { err: error_code_1.ErrorCode.RESULT_OK, result: { err: redoError } };
        }
        // 获得storage的hash值
        let digestResult = await this.storage.messageDigest();
        if (digestResult.err) {
            this.m_logger.error(`redo log get storage messageDigest error`);
            return { err: error_code_1.ErrorCode.RESULT_OK, result: { err: digestResult.err } };
        }
        this.m_logger.info(`redo log verify, digestResult.value=${digestResult.value}, blockstoragehash=${this.block.header.storageHash}`);
        const valid = digestResult.value === this.block.header.storageHash ? error_code_1.ErrorCode.RESULT_OK : error_code_1.ErrorCode.RESULT_VERIFY_NOT_MATCH;
        // 当前的storage hash和header上的storageHash 比较 
        // 设置verify 结果, 后续流程需要使用 res.valid
        return { err: error_code_1.ErrorCode.RESULT_OK, result: { err: error_code_1.ErrorCode.RESULT_OK, valid } };
    }
    cancel() {
        // do nothing
    }
}
