"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require("assert");
const events_1 = require("events");
const util_1 = require("util");
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
        this.m_node = options.node;
        this.m_blockStorage = options.blockStorage;
        this.m_storageManager = options.storageManager;
        this.m_blockWithLog = options.blockWithLog;
        this.m_initBlockWnd = options.initBlockWnd ? options.initBlockWnd : 10;
        this.m_node.on('inbound', (conn) => {
            this._beginSyncWithNode(conn);
        });
        this.m_node.on('outbound', (conn) => {
            this._beginSyncWithNode(conn);
        });
        this.m_node.on('error', (connRemotePeer, err) => {
            this._onConnectionError(connRemotePeer);
        });
        this.m_node.on('ban', (remote) => {
            this._onRemoveConnection(remote);
        });
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
        await this.m_node.init();
        return this.m_node.initialOutbounds();
    }
    uninit() {
        this.removeAllListeners('blocks');
        this.removeAllListeners('headers');
        this.removeAllListeners('transactions');
        return this.m_node.uninit();
    }
    get logger() {
        return this.m_node.logger;
    }
    async listen() {
        return this.m_node.listen();
    }
    get base() {
        return this.m_node;
    }
    broadcast(content, options) {
        if (!content.length) {
            return error_code_1.ErrorCode.RESULT_OK;
        }
        let pwriter;
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
        }
        assert(pwriter);
        this.m_node.node.broadcast(pwriter, options);
        return error_code_1.ErrorCode.RESULT_OK;
    }
    _beginSyncWithNode(conn) {
        // TODO: node 层也要做封禁，比如发送无法解析的pkg， 过大， 过频繁的请求等等
        conn.on('pkg', async (pkg) => {
            if (pkg.header.cmdType === SYNC_CMD_TYPE.tx) {
                let buffer = pkg.copyData();
                let txReader = new reader_1.BufferReader(buffer);
                let txes = [];
                let err = error_code_1.ErrorCode.RESULT_OK;
                for (let ix = 0; ix < pkg.body.count; ++ix) {
                    let tx = this.base.newTransaction();
                    if (tx.decode(txReader) !== error_code_1.ErrorCode.RESULT_OK) {
                        this.logger.warn(`receive invalid format transaction from ${conn.getRemote()}`);
                        err = error_code_1.ErrorCode.RESULT_INVALID_PARAM;
                        break;
                    }
                    if (!tx.verifySignature()) {
                        this.logger.warn(`receive invalid signature transaction ${tx.hash} from ${conn.getRemote()}`);
                        err = error_code_1.ErrorCode.RESULT_INVALID_TOKEN;
                        break;
                    }
                    txes.push(tx);
                }
                if (err) {
                    this.m_node.banConnection(conn.getRemote(), block_1.BAN_LEVEL.forever);
                }
                else {
                    if (txes.length) {
                        let hashs = [];
                        for (let tx of txes) {
                            hashs.push(tx.hash);
                        }
                        this.logger.debug(`receive transaction from ${conn.getRemote()} ${JSON.stringify(hashs)}`);
                        this.emit('transactions', conn, txes);
                    }
                }
            }
            else if (pkg.header.cmdType === SYNC_CMD_TYPE.header) {
                let time = Date.now() / 1000;
                let buffer = pkg.copyData();
                let headerReader = new reader_1.BufferReader(buffer);
                let headers = [];
                if (!pkg.body.error) {
                    let err = error_code_1.ErrorCode.RESULT_OK;
                    let preHeader;
                    for (let ix = 0; ix < pkg.body.count; ++ix) {
                        let header = this.base.newBlockHeader();
                        if (header.decode(headerReader) !== error_code_1.ErrorCode.RESULT_OK) {
                            this.logger.warn(`receive invalid format header from ${conn.getRemote()}`);
                            err = error_code_1.ErrorCode.RESULT_INVALID_BLOCK;
                            break;
                        }
                        if (!pkg.body.request || pkg.body.request.from) {
                            // 广播或者用from请求的header必须连续
                            if (preHeader) {
                                if (!preHeader.isPreBlock(header)) {
                                    this.logger.warn(`receive headers not in sequence from ${conn.getRemote()}`);
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
                        this.m_node.banConnection(conn.getRemote(), block_1.BAN_LEVEL.forever);
                        return;
                    }
                    // 用from请求的返回的第一个跟from不一致
                    if (headers.length && pkg.body.request && headers[0].preBlockHash !== pkg.body.request.from) {
                        this.logger.warn(`receive headers ${headers[0].preBlockHash} not match with request ${pkg.body.request.from} from ${conn.getRemote()}`);
                        this.m_node.banConnection(conn.getRemote(), block_1.BAN_LEVEL.forever);
                        return;
                    }
                    // 任何返回 gensis 的都不对
                    if (headers.length) {
                        if (headers[0].number === 0) {
                            this.logger.warn(`receive genesis header from ${conn.getRemote()}`);
                            this.m_node.banConnection(conn.getRemote(), block_1.BAN_LEVEL.forever);
                            return;
                        }
                    }
                }
                else if (pkg.body.error === error_code_1.ErrorCode.RESULT_NOT_FOUND) {
                    let ghr = await this.base.headerStorage.getHeader(0);
                    if (ghr.err) {
                        return;
                    }
                    // from用gensis请求的返回没有
                    if (pkg.body.request && pkg.body.request.from === ghr.header.hash) {
                        this.logger.warn(`receive can't get genesis header ${pkg.body.request.from} from ${conn.getRemote()}`);
                        this.m_node.banConnection(conn.getRemote(), block_1.BAN_LEVEL.forever);
                        return;
                    }
                }
                if (!this._onRecvHeaders(conn.getRemote(), time, pkg.body.request)) {
                    return;
                }
                this.emit('headers', { remote: conn.getRemote(), headers, request: pkg.body.request, error: pkg.body.error });
            }
            else if (pkg.header.cmdType === SYNC_CMD_TYPE.getHeader) {
                this._responseHeaders(conn, pkg.body);
            }
            else if (pkg.header.cmdType === SYNC_CMD_TYPE.block) {
                this._handlerBlockPackage(conn, pkg);
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
    _handlerBlockPackage(conn, pkg) {
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
            this.m_node.banConnection(conn.getRemote(), block_1.BAN_LEVEL.forever);
            return;
        }
        // 构造block对象
        let block = this.base.newBlock();
        if (block.decode(blockReader) !== error_code_1.ErrorCode.RESULT_OK) {
            this.logger.warn(`receive block invalid format from ${conn.getRemote()}`);
            this.m_node.banConnection(conn.getRemote(), block_1.BAN_LEVEL.forever);
            return;
        }
        if (!block.verify()) {
            this.logger.warn(`receive block not match header ${block.header.hash} from ${conn.getRemote()}`);
            this.m_node.banConnection(conn.getRemote(), block_1.BAN_LEVEL.day); // 可能分叉？
            return;
        }
        let err = this._onRecvBlock(block, conn.getRemote());
        if (err) {
            return;
        }
        // 数据emit 到chain层
        this.emit('blocks', { remote: conn.getRemote(), block, redoLog });
    }
    requestHeaders(from, options) {
        let conn;
        this.logger.debug(`request headers from ${util_1.isString(from) ? from : from.getRemote()} with options `, options);
        if (typeof from === 'string') {
            let connRequesting = this._getConnRequesting(from);
            if (!connRequesting) {
                this.logger.debug(`request headers from ${from} skipped for connection not found with options `, options);
                return error_code_1.ErrorCode.RESULT_NOT_FOUND;
            }
            conn = connRequesting.conn;
        }
        else {
            conn = from;
        }
        if (this.m_requestingHeaders.get(conn.getRemote())) {
            this.logger.warn(`request headers ${options} from ${conn.getRemote()} skipped for former headers request existing`);
            return error_code_1.ErrorCode.RESULT_ALREADY_EXIST;
        }
        this.m_requestingHeaders.set(conn.getRemote(), {
            time: Date.now() / 1000,
            req: Object.assign(Object.create(null), options)
        });
        let writer = net_1.PackageStreamWriter.fromPackage(SYNC_CMD_TYPE.getHeader, options);
        conn.addPendingWriter(writer);
        return error_code_1.ErrorCode.RESULT_OK;
    }
    // 这里必须实现成同步的
    requestBlocks(options, from) {
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
                    setImmediate(() => {
                        this.emit('blocks', { block });
                    });
                    return false;
                }
            }
            let sources = this.m_blockFromMap.get(header.hash);
            if (!sources) {
                sources = new Set();
                this.m_blockFromMap.set(header.hash, sources);
            }
            if (sources.has(from)) {
                return false;
            }
            sources.add(from);
            if (this.m_requestingBlock.hashMap.has(header.hash)) {
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
            if (!this._tryRequestBlockFromConnection(hash, connRequesting)) {
                this._addToPendingBlocks(hash);
            }
        }
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
    _getConnRequesting(remote) {
        let connRequesting = this.m_requestingBlock.connMap.get(remote);
        if (!connRequesting) {
            let conn = this.m_node.node.getConnection(remote);
            // TODO: 取不到这个conn的时候要处理
            // assert(conn, `no connection to ${remote}`);
            this.logger.error(`non connection to ${remote}`);
            if (!conn) {
                return;
            }
            connRequesting = { hashes: new Set(), wnd: this.m_initBlockWnd, conn: conn };
            this.m_requestingBlock.connMap.set(remote, connRequesting);
        }
        return connRequesting;
    }
    _requestBlockFromConnection(hash, from) {
        let connRequesting;
        if (typeof from === 'string') {
            connRequesting = this._getConnRequesting(from);
            if (!connRequesting) {
                return error_code_1.ErrorCode.RESULT_NOT_FOUND;
            }
        }
        else {
            connRequesting = from;
        }
        this.logger.debug(`request block ${hash} from ${connRequesting.conn.getRemote()}`);
        let writer = net_1.PackageStreamWriter.fromPackage(SYNC_CMD_TYPE.getBlock, { hash, redoLog: this.m_blockWithLog ? 1 : 0 });
        connRequesting.conn.addPendingWriter(writer);
        connRequesting.hashes.add(hash);
        this.m_requestingBlock.hashMap.set(hash, { from: connRequesting.conn.getRemote(), time: Date.now() / 1000 });
        return error_code_1.ErrorCode.RESULT_OK;
    }
    _onFreeBlockWnd(connRequesting) {
        let pending = this.m_pendingBlock;
        let index = 0;
        do {
            if (!pending.sequence.length) {
                break;
            }
            let hash = pending.sequence[index];
            let sources = this.m_blockFromMap.get(hash);
            assert(sources, `to request block ${hash} from unknown source`);
            if (!sources) {
                return error_code_1.ErrorCode.RESULT_EXCEPTION;
            }
            if (sources.has(connRequesting.conn.getRemote())) {
                this._requestBlockFromConnection(hash, connRequesting);
                pending.sequence.splice(index, 1);
                pending.hashes.delete(hash);
                if (connRequesting.wnd <= connRequesting.hashes.size) {
                    break;
                }
                else {
                    continue;
                }
            }
            ++index;
        } while (true);
    }
    _onRecvHeaders(from, time, request) {
        let valid = true;
        if (request) {
            // 返回没有请求过的headers， 要干掉
            let rh = this.m_requestingHeaders.get(from);
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
                this.m_requestingHeaders.delete(from);
            }
        }
        else {
            // TODO: 过频繁的广播header, 要干掉
        }
        if (!valid) {
            this.m_node.banConnection(from, block_1.BAN_LEVEL.forever);
        }
        return valid;
    }
    _onRecvBlock(block, from) {
        let connRequesting = this.m_requestingBlock.connMap.get(from);
        if (!connRequesting) {
            this.logger.error(`requesting info on ${from} missed, skip it`);
            return error_code_1.ErrorCode.RESULT_NOT_FOUND;
        }
        let stub = this.m_requestingBlock.hashMap.get(block.hash);
        assert(stub, `recv block ${block.hash} from ${from} that never request`);
        if (!stub) {
            this.m_node.banConnection(from, block_1.BAN_LEVEL.day);
            return error_code_1.ErrorCode.RESULT_INVALID_BLOCK;
        }
        this.logger.debug(`recv block hash: ${block.hash} number: ${block.number} from ${from}`);
        this.m_blockStorage.add(block);
        assert(stub.from === from, `request ${block.hash} from ${stub.from} while recv from ${from}`);
        this.m_requestingBlock.hashMap.delete(block.hash);
        connRequesting.hashes.delete(block.hash);
        this.m_blockFromMap.delete(block.hash);
        this.m_cc.onRecvBlock(this, block, connRequesting);
        this._onFreeBlockWnd(connRequesting);
        return error_code_1.ErrorCode.RESULT_OK;
    }
    _onConnectionError(remote) {
        this.logger.warn(`connection from ${remote} break, close it.`);
        this._onRemoveConnection(remote);
    }
    /*must not async*/
    _onRemoveConnection(remote) {
        this.logger.info(`removing ${remote} from block requesting source`);
        let connRequesting = this.m_requestingBlock.connMap.get(remote);
        if (connRequesting) {
            for (let hash of connRequesting.hashes) {
                this.logger.debug(`change block ${hash} from requesting to pending`);
                this.m_requestingBlock.hashMap.delete(hash);
                this._addToPendingBlocks(hash, true);
            }
        }
        this.m_requestingBlock.connMap.delete(remote);
        const pendings = this.m_pendingBlock.sequence.slice(0);
        for (let hash of pendings) {
            let sources = this.m_blockFromMap.get(hash);
            if (sources.has(remote)) {
                sources.delete(remote);
                if (!sources.size) {
                    this.logger.debug(`remove block ${hash} from pending blocks for all source removed`);
                    this._removeFromPendingBlocks(hash);
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
        this.m_requestingHeaders.delete(remote);
    }
    _onReqTimeoutTimer(now) {
        for (let hash of this.m_requestingBlock.hashMap.keys()) {
            let stub = this.m_requestingBlock.hashMap.get(hash);
            let fromRequesting = this.m_requestingBlock.connMap.get(stub.from);
            if (now - stub.time > this.m_blockTimeout) {
                this.m_cc.onBlockTimeout(this, hash, fromRequesting);
                // close it 
                if (fromRequesting.wnd < 1) {
                    this.m_node.banConnection(stub.from, block_1.BAN_LEVEL.hour);
                }
            }
        }
        // 返回headers超时
        for (let remote of this.m_requestingHeaders.keys()) {
            let rh = this.m_requestingHeaders.get(remote);
            if (now - rh.time > this.m_headersTimeout) {
                this.logger.debug(`header request timeout from ${remote} timeout with options `, rh.req);
                this.m_node.banConnection(remote, block_1.BAN_LEVEL.hour);
            }
        }
    }
    async _responseBlocks(conn, req) {
        assert(this.m_blockStorage);
        this.logger.info(`receive block request from ${conn.getRemote()} with ${JSON.stringify(req)}`);
        let bwriter = new writer_1.BufferWriter();
        let block = this.m_blockStorage.get(req.hash);
        if (!block) {
            this.logger.crit(`cannot get Block ${req.hash} from blockStorage`);
            assert(false, `${this.m_node.peerid} cannot get Block ${req.hash} from blockStorage`);
            return error_code_1.ErrorCode.RESULT_OK;
        }
        let err = block.encode(bwriter);
        if (err) {
            this.logger.error(`encode block ${block.hash} failed`);
            return err;
        }
        let rawBlocks = bwriter.render();
        // 如果请求参数里设置了redoLog,  则读取redoLog, 合并在返回的包里
        if (req.redoLog === 1) {
            let redoLogWriter = new writer_1.BufferWriter();
            // 从本地文件中读取redoLog, 处理raw 拼接在block后
            let redoLog = this.m_storageManager.getRedoLog(req.hash);
            err = redoLog.encode(redoLogWriter);
            if (err) {
                this.logger.error(`encode redolog ${req.hash} failed`);
                return err;
            }
            let redoLogRaw = redoLogWriter.render();
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
        this.logger.info(`receive header request from ${conn.getRemote()} with ${JSON.stringify(req)}`);
        if (req.from) {
            let hwriter = new writer_1.BufferWriter();
            let respErr = error_code_1.ErrorCode.RESULT_OK;
            let headerCount = 0;
            do {
                let tipResult = await this.base.headerStorage.getHeader('latest');
                if (tipResult.err) {
                    return tipResult.err;
                }
                let heightResult = await this.m_node.headerStorage.getHeightOnBest(req.from);
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
                let hr = await this.base.headerStorage.getHeader(heightResult.height + headerCount);
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
                let hsr = await this.base.headerStorage.getHeader(hr.header.hash, -headerCount + 1);
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
