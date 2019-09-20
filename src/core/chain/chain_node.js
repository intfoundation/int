"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require("assert");
const events_1 = require("events");
const error_code_1 = require("../error_code");
const storage_1 = require("../storage");
const block_1 = require("../block");
const reader_1 = require("../lib/reader");
const writer_1 = require("../lib/writer");
const net_1 = require("../net");
var SYNC_CMD_TYPE;
(function (SYNC_CMD_TYPE) {
    SYNC_CMD_TYPE[SYNC_CMD_TYPE["getHeader"] = 16] = "getHeader";
    SYNC_CMD_TYPE[SYNC_CMD_TYPE["header"] = 17] = "header";
    SYNC_CMD_TYPE[SYNC_CMD_TYPE["getBlock"] = 18] = "getBlock";
    SYNC_CMD_TYPE[SYNC_CMD_TYPE["block"] = 19] = "block";
    SYNC_CMD_TYPE[SYNC_CMD_TYPE["tx"] = 21] = "tx";
    SYNC_CMD_TYPE[SYNC_CMD_TYPE["end"] = 22] = "end";
})(SYNC_CMD_TYPE = exports.SYNC_CMD_TYPE || (exports.SYNC_CMD_TYPE = {}));
class ChainNode extends events_1.EventEmitter {
    constructor(options) {
        super();
        this.m_requestingBlock = {
            connMap: new Map(),
            hashMap: new Map()
        };
        this.m_pendingBlock = { hashes: new Set(), sequence: new Array() };
        this.m_blockFromMap = new Map();
        this.m_requestingHeaders = new Map();
        this.m_cc = {
            onRecvBlock(node, block, from) {
                from.wnd += 1;
                from.wnd = from.wnd > 3 * node.m_initBlockWnd ? 3 * node.m_initBlockWnd : from.wnd;
            },
            onBlockTimeout(node, hash, from) {
                from.wnd = Math.floor(from.wnd / 2);
            }
        };
        // net/node
        this.m_logger = options.logger;
        this.m_networks = options.networks.slice();
        this.m_blockStorage = options.blockStorage;
        this.m_storageManager = options.storageManager;
        this.m_blockWithLog = options.blockWithLog;
        this.m_initBlockWnd = options.initBlockWnd ? options.initBlockWnd : 10;
        this.m_blockTimeout = options.blockTimeout ? options.blockTimeout : 10000;
        this.m_headersTimeout = options.headersTimeout ? options.headersTimeout : 30000;
        this.m_reqTimeoutTimer = setInterval(() => {
            this._onReqTimeoutTimer(Date.now() / 1000);
        }, 1000);
    }
    on(event, listener) {
        return super.on(event, listener);
    }
    once(event, listener) {
        return super.once(event, listener);
    }
    async init() {
        let inits = [];
        for (const network of this.m_networks) {
            network.on('inbound', (conn) => {
                this._beginSyncWithNode(network, conn);
                this.emit('inbound', conn);
            });
            network.on('outbound', (conn) => {
                this._beginSyncWithNode(network, conn);
                this.emit('outbound', conn);
            });
            network.on('error', (remote, id, err) => {
                const fullRemote = net_1.INode.fullPeerid(network.name, remote);
                this._onConnectionError(fullRemote, id);
                this.emit('error', fullRemote);
            });
            network.on('ban', (remote) => {
                const fullRemote = net_1.INode.fullPeerid(network.name, remote);
                this._onRemoveConnection(fullRemote);
                this.emit('ban', fullRemote);
            });
            inits.push(network.init());
        }
        let results = await Promise.all(inits);
        if (results[0]) {
            return results[0];
        }
        let initOutbounds = [];
        for (const network of this.m_networks) {
            initOutbounds.push(network.initialOutbounds());
        }
        results = await Promise.all(initOutbounds);
        return results[0];
    }
    uninit() {
        this.removeAllListeners('blocks');
        this.removeAllListeners('headers');
        this.removeAllListeners('transactions');
        let uninits = [];
        for (const network of this.m_networks) {
            uninits.push(network.uninit());
        }
        return Promise.all(uninits);
    }
    get logger() {
        return this.m_logger;
    }
    async listen() {
        let listens = [];
        for (const network of this.m_networks) {
            listens.push(network.listen());
        }
        const results = await Promise.all(listens);
        for (const err of results) {
            if (err) {
                return err;
            }
        }
        return error_code_1.ErrorCode.RESULT_OK;
    }
    getNetwork(_network) {
        if (_network) {
            for (const network of this.m_networks) {
                if (network.name === _network) {
                    return network;
                }
            }
            return undefined;
        }
        else {
            return this.m_networks[0];
        }
    }
    getConnection(fullremote) {
        const { network, peerid } = net_1.INode.splitFullPeerid(fullremote);
        const node = this.getNetwork(network);
        if (!node) {
            return;
        }
        return node.node.getConnection(peerid);
    }
    getOutbounds() {
        let arr = [];
        for (const network of this.m_networks) {
            arr.push(...network.node.getOutbounds());
        }
        return arr;
    }
    getInbounds() {
        let arr = [];
        for (const network of this.m_networks) {
            arr.push(...network.node.getInbounds());
        }
        return arr;
    }
    broadcast(content, options) {
        if (!content.length) {
            return error_code_1.ErrorCode.RESULT_OK;
        }
        let pwriter;
        let strategy;
        if (content[0] instanceof block_1.BlockHeader) {
            let hwriter = new writer_1.BufferWriter();
            for (let header of content) {
                let err = header.encode(hwriter);
                if (err) {
                    this.logger.error(`encode header ${header.hash} failed`);
                    return err;
                }
            }
            let raw = hwriter.render();
            pwriter = net_1.PackageStreamWriter.fromPackage(SYNC_CMD_TYPE.header, { count: content.length }, raw.length);
            pwriter.writeData(raw);
            strategy = block_1.NetworkBroadcastStrategy.headers;
        }
        else if (content[0] instanceof block_1.Transaction) {
            let hwriter = new writer_1.BufferWriter();
            for (let tx of content) {
                let err = tx.encode(hwriter);
                if (err) {
                    this.logger.error(`encode transaction ${tx.hash} failed`);
                    return err;
                }
            }
            let raw = hwriter.render();
            pwriter = net_1.PackageStreamWriter.fromPackage(SYNC_CMD_TYPE.tx, { count: content.length }, raw.length);
            pwriter.writeData(raw);
            strategy = block_1.NetworkBroadcastStrategy.transaction;
        }
        assert(pwriter);
        for (const network of this.m_networks) {
            const opt = Object.create(options ? options : null);
            opt.strategy = strategy;
            network.broadcast(pwriter, opt);
        }
        return error_code_1.ErrorCode.RESULT_OK;
    }
    _beginSyncWithNode(network, conn) {
        // TODO: node 层也要做封禁，比如发送无法解析的pkg， 过大， 过频繁的请求等等
        conn.on('pkg', async (pkg) => {
            if (pkg.header.cmdType === SYNC_CMD_TYPE.tx) {
                let buffer = pkg.copyData();
                let txReader = new reader_1.BufferReader(buffer);
                let txes = [];
                let err = error_code_1.ErrorCode.RESULT_OK;
                for (let ix = 0; ix < pkg.body.count; ++ix) {
                    let tx = network.newTransaction();
                    if (tx.decode(txReader) !== error_code_1.ErrorCode.RESULT_OK) {
                        this.logger.warn(`receive invalid format transaction from ${conn.fullRemote}`);
                        err = error_code_1.ErrorCode.RESULT_INVALID_PARAM;
                        break;
                    }
                    if (!tx.verifySignature()) {
                        this.logger.warn(`receive invalid signature transaction ${tx.hash} from ${conn.fullRemote}`);
                        err = error_code_1.ErrorCode.RESULT_INVALID_TOKEN;
                        break;
                    }
                    txes.push(tx);
                }
                if (err) {
                    network.banConnection(conn.remote, block_1.BAN_LEVEL.forever);
                }
                else {
                    if (txes.length) {
                        let hashs = [];
                        for (let tx of txes) {
                            hashs.push(tx.hash);
                        }
                        this.logger.debug(`receive transaction from ${conn.fullRemote} ${JSON.stringify(hashs)}`);
                        this.emit('transactions', conn, txes);
                    }
                }
            }
            else if (pkg.header.cmdType === SYNC_CMD_TYPE.header) {
                let time = Date.now() / 1000;
                let buffer = pkg.copyData();
                let headerReader = new reader_1.BufferReader(buffer);
                let headers = [];
                this.logger.debug(`receive headers from ${conn.fullRemote} err ${pkg.body.error} request `, pkg.body.request);
                if (!pkg.body.error) {
                    let err = error_code_1.ErrorCode.RESULT_OK;
                    let preHeader;
                    for (let ix = 0; ix < pkg.body.count; ++ix) {
                        let header = network.newBlockHeader();
                        if (header.decode(headerReader) !== error_code_1.ErrorCode.RESULT_OK) {
                            this.logger.warn(`receive invalid format header from ${conn.fullRemote}`);
                            err = error_code_1.ErrorCode.RESULT_INVALID_BLOCK;
                            break;
                        }
                        if (!pkg.body.request || pkg.body.request.from) {
                            // 广播或者用from请求的header必须连续
                            if (preHeader) {
                                if (!preHeader.isPreBlock(header)) {
                                    this.logger.warn(`receive headers not in sequence from ${conn.fullRemote}`);
                                    err = error_code_1.ErrorCode.RESULT_INVALID_BLOCK;
                                    break;
                                }
                            }
                            preHeader = header;
                        }
                        headers.push(header);
                    }
                    if (err) {
                        // 发错的header的peer怎么处理
                        network.banConnection(conn.remote, block_1.BAN_LEVEL.forever);
                        return;
                    }
                    // 用from请求的返回的第一个跟from不一致
                    if (headers.length && pkg.body.request && headers[0].preBlockHash !== pkg.body.request.from) {
                        this.logger.warn(`receive headers ${headers[0].preBlockHash} not match with request ${pkg.body.request.from} from ${conn.fullRemote}`);
                        network.banConnection(conn.remote, block_1.BAN_LEVEL.forever);
                        return;
                    }
                    // 任何返回 gensis 的都不对
                    if (headers.length) {
                        if (headers[0].number === 0) {
                            this.logger.warn(`receive genesis header from ${conn.fullRemote}`);
                            network.banConnection(conn.remote, block_1.BAN_LEVEL.forever);
                            return;
                        }
                    }
                }
                else if (pkg.body.error === error_code_1.ErrorCode.RESULT_NOT_FOUND) {
                    let ghr = await network.headerStorage.getHeader(0);
                    if (ghr.err) {
                        return;
                    }
                    // from用gensis请求的返回没有
                    if (pkg.body.request && pkg.body.request.from === ghr.header.hash) {
                        this.logger.warn(`receive can't get genesis header ${pkg.body.request.from} from ${conn.fullRemote}`);
                        network.banConnection(conn.remote, block_1.BAN_LEVEL.forever);
                        return;
                    }
                }
                if (!this._onRecvHeaders(conn.fullRemote, time, pkg.body.request)) {
                    return;
                }
                this.emit('headers', { from: conn.fullRemote, headers, request: pkg.body.request, error: pkg.body.error });
            }
            else if (pkg.header.cmdType === SYNC_CMD_TYPE.getHeader) {
                this._responseHeaders(conn, pkg.body);
            }
            else if (pkg.header.cmdType === SYNC_CMD_TYPE.block) {
                this._handlerBlockPackage(network, conn, pkg);
            }
            else if (pkg.header.cmdType === SYNC_CMD_TYPE.getBlock) {
                this._responseBlocks(conn, pkg.body);
            }
        });
    }
    // 处理通过网络请求获取的block package
    // 然后emit到chain层
    // @param conn 网络连接
    // @param pgk  block 数据包
    _handlerBlockPackage(network, conn, pkg) {
        let buffer = pkg.copyData();
        let blockReader;
        let redoLogReader;
        let redoLog;
        // check body buffer 中是否包含了redoLog
        // 如果包含了redoLog 需要切割buffer
        if (pkg.body.redoLog) {
            // 由于在传输时, redolog和block都放在package的data属性里（以合并buffer形式）
            // 所以需要根据body中的length 分配redo和block的buffer
            let blockBuffer = buffer.slice(0, pkg.body.blockLength);
            let redoLogBuffer = buffer.slice(pkg.body.blockLength, buffer.length);
            // console.log(pkg.body.blockLength, blockBuffer.length, pkg.body.redoLogLength, redoLogBuffer.length)
            // console.log('------------------')
            blockReader = new reader_1.BufferReader(blockBuffer);
            redoLogReader = new reader_1.BufferReader(redoLogBuffer);
            // 构造redo log 对象
            redoLog = new storage_1.JStorageLogger();
            let redoDecodeError = redoLog.decode(redoLogReader);
            if (redoDecodeError) {
                return;
            }
        }
        else {
            blockReader = new reader_1.BufferReader(buffer);
        }
        if (pkg.body.err === error_code_1.ErrorCode.RESULT_NOT_FOUND) {
            // 请求的block肯定已经从header里面确定remote有，直接禁掉
            network.banConnection(conn.remote, block_1.BAN_LEVEL.forever);
            return;
        }
        // 构造block对象
        let block = network.newBlock();
        if (block.decode(blockReader) !== error_code_1.ErrorCode.RESULT_OK) {
            this.logger.warn(`receive block invalid format from ${conn.fullRemote}`);
            network.banConnection(conn.remote, block_1.BAN_LEVEL.forever);
            return;
        }
        if (!block.verify()) {
            this.logger.warn(`receive block not match header ${block.header.hash} from ${conn.fullRemote}`);
            network.banConnection(conn.remote, block_1.BAN_LEVEL.day); // 可能分叉？
            return;
        }
        const eventParams = { from: conn.fullRemote, block, redoLog };
        let err = this._onRecvBlock(eventParams);
        if (err) {
            return;
        }
        // 数据emit 到chain层
        this.emit('blocks', eventParams);
    }
    requestHeaders(from, options) {
        this.logger.debug(`request headers from  with options ${from.fullRemote}`, options);
        if (this.m_requestingHeaders.get(from.fullRemote)) {
            this.logger.warn(`request headers ${options} from ${from.fullRemote} skipped for former headers request existing`);
            return error_code_1.ErrorCode.RESULT_ALREADY_EXIST;
        }
        this.m_requestingHeaders.set(from.fullRemote, {
            time: Date.now() / 1000,
            req: Object.assign(Object.create(null), options)
        });
        let writer = net_1.PackageStreamWriter.fromPackage(SYNC_CMD_TYPE.getHeader, options);
        from.addPendingWriter(writer);
        return error_code_1.ErrorCode.RESULT_OK;
    }
    // 这里必须实现成同步的
    requestBlocks(from, options) {
        this.logger.debug(`request blocks from ${from} with options `, options);
        let connRequesting = this._getConnRequesting(from);
        if (!connRequesting) {
            this.logger.debug(`request blocks from ${from} skipped for connection not found with options `, options);
            return error_code_1.ErrorCode.RESULT_NOT_FOUND;
        }
        let requests = [];
        let addRequesting = (header) => {
            if (this.m_blockStorage.has(header.hash)) {
                let block = this.m_blockStorage.get(header.hash);
                assert(block, `block storage load block ${header.hash} failed while file exists`);
                if (block) {
                    if (this.m_blockWithLog) {
                        if (this.m_storageManager.hasRedoLog(header.hash)) {
                            let redoLog = this.m_storageManager.getRedoLog(header.hash);
                            if (redoLog) {
                                setImmediate(() => {
                                    this.emit('blocks', { block, redoLog });
                                });
                            }
                            else {
                                setImmediate(() => {
                                    this.emit('blocks', { block });
                                });
                            }
                        }
                        else {
                            setImmediate(() => {
                                this.emit('blocks', { block });
                            });
                        }
                    }
                    else {
                        setImmediate(() => {
                            this.emit('blocks', { block });
                        });
                    }
                    return false;
                }
            }
            let sources = this.m_blockFromMap.get(header.hash);
            if (!sources) {
                sources = new Set();
                this.m_blockFromMap.set(header.hash, sources);
            }
            if (!sources.has(from)) {
                sources.add(from);
            }
            let stub = this.m_requestingBlock.hashMap.get(header.hash);
            if (stub && (Date.now() / 1000 - stub.time) < 5) {
                this.logger.debug(`block has requested hash = ${header.hash}, stub = ${stub}`);
                return false;
            }
            requests.push(header.hash);
            return true;
        };
        if (options.headers) {
            for (let header of options.headers) {
                addRequesting(header);
            }
        }
        else {
            assert(false, `invalid block request ${options}`);
            return error_code_1.ErrorCode.RESULT_INVALID_PARAM;
        }
        for (let hash of requests) {
            this._addToPendingBlocks(hash);
        }
        this._onFreeBlockWnd(connRequesting);
        return error_code_1.ErrorCode.RESULT_OK;
    }
    _tryRequestBlockFromConnection(hash, from) {
        if (from.wnd - from.hashes.size > 0) {
            this._requestBlockFromConnection(hash, from);
            this._removeFromPendingBlocks(hash);
            return true;
        }
        return false;
    }
    _addToPendingBlocks(hash, head = false) {
        if (!this.m_pendingBlock.hashes.has(hash)) {
            this.m_pendingBlock.hashes.add(hash);
            this.logger.debug(`add new waiting async block to m_pendingBlock, hash = ${hash}`);
            if (head) {
                this.m_pendingBlock.sequence.unshift(hash);
            }
            else {
                this.m_pendingBlock.sequence.push(hash);
            }
        }
    }
    _removeFromPendingBlocks(hash) {
        if (this.m_pendingBlock.hashes.has(hash)) {
            this.m_pendingBlock.hashes.delete(hash);
            this.m_pendingBlock.sequence.splice(this.m_pendingBlock.sequence.indexOf(hash), 1);
        }
    }
    _getConnRequesting(fpid) {
        let connRequesting = this.m_requestingBlock.connMap.get(fpid);
        if (!connRequesting) {
            const { network, peerid } = net_1.INode.splitFullPeerid(fpid);
            const node = this.getNetwork(network);
            if (!node) {
                return;
            }
            let conn = node.node.getConnection(peerid);
            // TODO: 取不到这个conn的时候要处理
            // assert(conn, `no connection to ${remote}`);
            this.logger.error(`non connection to ${fpid}`);
            if (!conn) {
                return;
            }
            connRequesting = { hashes: new Set(), wnd: this.m_initBlockWnd, conn: conn };
            this.m_requestingBlock.connMap.set(fpid, connRequesting);
        }
        return connRequesting;
    }
    _requestBlockFromConnection(hash, connRequesting) {
        this.logger.debug(`request block ${hash} from ${connRequesting.conn.fullRemote}`);
        let writer = net_1.PackageStreamWriter.fromPackage(SYNC_CMD_TYPE.getBlock, { hash, redoLog: this.m_blockWithLog ? 1 : 0 });
        connRequesting.conn.addPendingWriter(writer);
        connRequesting.hashes.add(hash);
        this.m_requestingBlock.hashMap.set(hash, { remote: connRequesting.conn.fullRemote, time: Date.now() / 1000 });
        return error_code_1.ErrorCode.RESULT_OK;
    }
    _onFreeBlockWnd(connRequesting) {
        let pending = this.m_pendingBlock;
        let index = 0;
        do {
            if (!pending.sequence.length
                || index >= pending.sequence.length) {
                break;
            }
            let hash = pending.sequence[index];
            let sources = this.m_blockFromMap.get(hash);
            assert(sources, `to request block ${hash} from unknown source`);
            if (!sources) {
                return error_code_1.ErrorCode.RESULT_EXCEPTION;
            }
            if (sources.has(connRequesting.conn.fullRemote)) {
                this._requestBlockFromConnection(hash, connRequesting);
                pending.sequence.splice(index, 1);
                pending.hashes.delete(hash);
                if (connRequesting.wnd <= connRequesting.hashes.size) {
                    this.logger.debug(`onFreeBlockWnd connRequesting.wnd <= connRequesting.hashes.size, from ${connRequesting.conn.fullRemote},hash ${hash}`);
                    break;
                }
                else {
                    continue;
                }
            }
            ++index;
        } while (true);
    }
    _onRecvHeaders(fpid, time, request) {
        let valid = true;
        if (request) {
            // 返回没有请求过的headers， 要干掉
            let rh = this.m_requestingHeaders.get(fpid);
            if (rh) {
                for (let key of Object.keys(request)) {
                    if (request[key] !== rh.req[key]) {
                        valid = false;
                        break;
                    }
                }
            }
            else {
                // TODO: 如果request header之后connection失效， 会从requesting headers 中移除；
                // 因为回调处理基本都是异步的，可能是会出现同时进入receive header的回调和connection error的回调；
                // 此时这段分支会导致header被置为invalid；相比不停返回header的ddos攻击行为是有区别的；
                // ban的策略也应该有区别；
                valid = false;
            }
            if (valid) {
                this.m_requestingHeaders.delete(fpid);
            }
        }
        else {
            // TODO: 过频繁的广播header, 要干掉
        }
        if (!valid) {
            this._banConnection(fpid, block_1.BAN_LEVEL.forever);
        }
        return valid;
    }
    _onRecvBlock(params) {
        let connRequesting = this.m_requestingBlock.connMap.get(params.from);
        if (!connRequesting) {
            this.logger.error(`requesting info on ${params.from} missed, skip it`);
            return error_code_1.ErrorCode.RESULT_NOT_FOUND;
        }
        let stub = this.m_requestingBlock.hashMap.get(params.block.hash);
        assert(stub, `recv block ${params.block.hash} from ${params.from} that never request`);
        if (!stub) {
            this._banConnection(params.from, block_1.BAN_LEVEL.day);
            return error_code_1.ErrorCode.RESULT_INVALID_BLOCK;
        }
        this.logger.debug(`recv block hash: ${params.block.hash} number: ${params.block.number} from ${params.from}`);
        this.m_blockStorage.add(params.block);
        if (params.redoLog) {
            this.m_storageManager.addRedoLog(params.block.hash, params.redoLog);
        }
        assert(stub.remote === params.from, `request ${params.block.hash} from ${stub.remote} while recv from ${params.from}`);
        this.m_requestingBlock.hashMap.delete(params.block.hash);
        connRequesting.hashes.delete(params.block.hash);
        this.m_blockFromMap.delete(params.block.hash);
        this.m_cc.onRecvBlock(this, params.block, connRequesting);
        this._onFreeBlockWnd(connRequesting);
        return error_code_1.ErrorCode.RESULT_OK;
    }
    _onConnectionError(fullRemote, id) {
        this.logger.warn(`connection ${id} from ${fullRemote} break, close it.`);
        this._onRemoveConnection(fullRemote);
    }
    /*must not async*/
    _onRemoveConnection(fullRemote) {
        this.logger.info(`removing ${fullRemote} from block requesting source`);
        let connRequesting = this.m_requestingBlock.connMap.get(fullRemote);
        if (connRequesting) {
            for (let hash of connRequesting.hashes) {
                this.logger.debug(`change block ${hash} from requesting to pending`);
                this.m_requestingBlock.hashMap.delete(hash);
                this._addToPendingBlocks(hash, true);
            }
        }
        this.m_requestingBlock.connMap.delete(fullRemote);
        for (let hash of this.m_blockFromMap.keys()) {
            let sources = this.m_blockFromMap.get(hash);
            if (sources.has(fullRemote)) {
                sources.delete(fullRemote);
                if (!sources.size) {
                    this.logger.debug(`remove block ${hash} from pending blocks for all source removed`);
                    // this._removeFromPendingBlocks(hash);
                }
                else {
                    for (let from of sources) {
                        let fromRequesting = this.m_requestingBlock.connMap.get(from);
                        assert(fromRequesting, `block requesting connection ${from} not exists`);
                        if (this._tryRequestBlockFromConnection(hash, fromRequesting)) {
                            break;
                        }
                    }
                }
            }
        }
        this.m_requestingHeaders.delete(fullRemote);
    }
    banConnection(fullRemote, level) {
        return this._banConnection(fullRemote, level);
    }
    _banConnection(fullRemote, level) {
        const { network, peerid } = net_1.INode.splitFullPeerid(fullRemote);
        const node = this.getNetwork(network);
        if (node) {
            node.banConnection(peerid, level);
        }
    }
    _onReqTimeoutTimer(now) {
        for (let hash of this.m_requestingBlock.hashMap.keys()) {
            let stub = this.m_requestingBlock.hashMap.get(hash);
            let fromRequesting = this.m_requestingBlock.connMap.get(stub.remote);
            if (now - stub.time > this.m_blockTimeout) {
                this.m_cc.onBlockTimeout(this, hash, fromRequesting);
                // close it 
                if (fromRequesting.wnd < 1) {
                    this._banConnection(stub.remote, block_1.BAN_LEVEL.hour);
                }
            }
        }
        // 返回headers超时
        for (let fullRemote of this.m_requestingHeaders.keys()) {
            let rh = this.m_requestingHeaders.get(fullRemote);
            if (now - rh.time > this.m_headersTimeout) {
                this.logger.debug(`header request timeout from ${fullRemote} timeout with options `, rh.req);
                this._banConnection(fullRemote, block_1.BAN_LEVEL.hour);
            }
        }
    }
    async _responseBlocks(conn, req) {
        assert(this.m_blockStorage);
        this.logger.info(`receive block request from ${conn.fullRemote} with ${JSON.stringify(req)}`);
        let bwriter = new writer_1.BufferWriter();
        let block = this.m_blockStorage.get(req.hash);
        if (!block) {
            this.logger.crit(`cannot get Block ${req.hash} from blockStorage`);
            const node = this.getNetwork(conn.network);
            assert(false, `${conn.fullRemote} cannot get Block ${req.hash} from blockStorage`);
            return error_code_1.ErrorCode.RESULT_OK;
        }
        let err = block.encode(bwriter);
        if (err) {
            this.logger.error(`encode block ${block.hash} failed`);
            return err;
        }
        let rawBlocks = bwriter.render();
        let redoLogRaw;
        // 如果请求参数里设置了redoLog,  则读取redoLog, 合并在返回的包里
        if (req.redoLog === 1) {
            do {
                let redoLogWriter = new writer_1.BufferWriter();
                // 从本地文件中读取redoLog, 处理raw 拼接在block后
                let redoLog = this.m_storageManager.getRedoLog(req.hash);
                if (!redoLog) {
                    this.logger.error(`${req.hash} redo log missing`);
                    break;
                }
                err = redoLog.encode(redoLogWriter);
                if (err) {
                    this.logger.error(`encode redolog ${req.hash} failed`);
                    break;
                }
                redoLogRaw = redoLogWriter.render();
            } while (false);
        }
        if (redoLogRaw) {
            let dataLength = rawBlocks.length + redoLogRaw.length;
            let pwriter = net_1.PackageStreamWriter.fromPackage(SYNC_CMD_TYPE.block, {
                blockLength: rawBlocks.length,
                redoLogLength: redoLogRaw.length,
                redoLog: 1,
            }, dataLength);
            pwriter.writeData(rawBlocks);
            pwriter.writeData(redoLogRaw);
            conn.addPendingWriter(pwriter);
        }
        else {
            let pwriter = net_1.PackageStreamWriter.fromPackage(SYNC_CMD_TYPE.block, { redoLog: 0 }, rawBlocks.length);
            pwriter.writeData(rawBlocks);
            conn.addPendingWriter(pwriter);
        }
        return error_code_1.ErrorCode.RESULT_OK;
    }
    async _responseHeaders(conn, req) {
        const node = this.getNetwork(conn.network);
        this.logger.info(`receive header request from ${conn.fullRemote} with ${JSON.stringify(req)}`);
        if (req.from) {
            let hwriter = new writer_1.BufferWriter();
            let respErr = error_code_1.ErrorCode.RESULT_OK;
            let headerCount = 0;
            do {
                let tipResult = await node.headerStorage.getHeader('latest');
                if (tipResult.err) {
                    return tipResult.err;
                }
                let heightResult = await node.headerStorage.getHeightOnBest(req.from);
                if (heightResult.err === error_code_1.ErrorCode.RESULT_NOT_FOUND) {
                    respErr = error_code_1.ErrorCode.RESULT_NOT_FOUND;
                    break;
                }
                assert(tipResult.header);
                if (tipResult.header.hash === req.from) {
                    // 没有更多了
                    respErr = error_code_1.ErrorCode.RESULT_SKIPPED;
                    break;
                }
                if (!req.limit || heightResult.height + req.limit > tipResult.header.number) {
                    headerCount = tipResult.header.number - heightResult.height;
                }
                else {
                    headerCount = req.limit;
                }
                let hr = await node.headerStorage.getHeader(heightResult.height + headerCount);
                if (hr.err) {
                    // 中间changeBest了，返回not found
                    if (hr.err === error_code_1.ErrorCode.RESULT_NOT_FOUND) {
                        respErr = error_code_1.ErrorCode.RESULT_NOT_FOUND;
                        break;
                    }
                    else {
                        return hr.err;
                    }
                }
                let hsr = await node.headerStorage.getHeader(hr.header.hash, -headerCount + 1);
                if (hsr.err) {
                    return hsr.err;
                }
                if (hsr.headers[0].preBlockHash !== req.from) {
                    // 中间changeBest了，返回not found
                    respErr = error_code_1.ErrorCode.RESULT_NOT_FOUND;
                    break;
                }
                for (let h of hsr.headers) {
                    let err = h.encode(hwriter);
                    if (err) {
                        this.logger.error(`encode header ${h.hash} failed`);
                        respErr = error_code_1.ErrorCode.RESULT_NOT_FOUND;
                    }
                }
            } while (false);
            let rawHeaders = hwriter.render();
            let pwriter = net_1.PackageStreamWriter.fromPackage(SYNC_CMD_TYPE.header, { count: headerCount, request: req, error: respErr }, rawHeaders.length);
            pwriter.writeData(rawHeaders);
            conn.addPendingWriter(pwriter);
            return error_code_1.ErrorCode.RESULT_OK;
        }
        else {
            return error_code_1.ErrorCode.RESULT_INVALID_PARAM;
        }
    }
}
exports.ChainNode = ChainNode;
