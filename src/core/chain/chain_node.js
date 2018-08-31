"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require("assert");
const events_1 = require("events");
const error_code_1 = require("../error_code");
const storage_1 = require("../storage");
const block_1 = require("../block");
const reader_1 = require("../lib/reader");
const writer_1 = require("../lib/writer");
const node_storage_1 = require("./node_storage");
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
var BAN_LEVEL;
(function (BAN_LEVEL) {
    BAN_LEVEL[BAN_LEVEL["minute"] = 1] = "minute";
    BAN_LEVEL[BAN_LEVEL["hour"] = 60] = "hour";
    BAN_LEVEL[BAN_LEVEL["day"] = 1440] = "day";
    BAN_LEVEL[BAN_LEVEL["month"] = 43200] = "month";
    BAN_LEVEL[BAN_LEVEL["forever"] = 0] = "forever";
})(BAN_LEVEL = exports.BAN_LEVEL || (exports.BAN_LEVEL = {}));
class ChainNode extends events_1.EventEmitter {
    constructor(options) {
        super();
        this.m_connectingCount = 0;
        this.m_connectingPeerids = [];
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
        this.m_headerStorage = options.headerStorage;
        this.m_storageManager = options.storageManager;
        this.m_blockHeaderType = options.blockHeaderType;
        this.m_transactionType = options.transactionType;
        this.m_logger = options.logger;
        this.m_minOutbound = options.minOutbound ? options.minOutbound : 8;
        this.m_initBlockWnd = options.initBlockWnd ? options.initBlockWnd : 10;
        this.m_node.on('error', (conn, err) => {
            this._onConnectionError(conn.getRemote());
        });
        // 收到net/node的ban事件, 调用 ChainNode的banConnection方法做封禁处理
        // 日期先设置为按天
        this.m_node.on('ban', (remote) => {
            this.banConnection(remote, BAN_LEVEL.day);
        });
        this.m_blockTimeout = options.blockTimeout ? options.blockTimeout : 10000;
        this.m_headersTimeout = options.headersTimeout ? options.headersTimeout : 30000;
        this.m_reqTimeoutTimer = setInterval(() => {
            this._onReqTimeoutTimer(Date.now() / 1000);
        }, 1000);
        this.m_nodeStorage = new node_storage_1.NodeStorage({
            count: options.nodeCacheSize ? options.nodeCacheSize : 50,
            dataDir: options.dataDir,
            logger: this.m_logger
        });
    }
    on(event, listener) {
        return super.on(event, listener);
    }
    once(event, listener) {
        return super.on(event, listener);
    }
    async init() {
        // 读取创始块的hash值， 并将其传入 net/node
        const result = await this.getHeader(0);
        const genesis_hash = result.header.hash;
        this.m_node.genesis_hash = genesis_hash;
        await this.m_node.init();
    }
    get logger() {
        return this.m_logger;
    }
    get node() {
        return this.m_node;
    }
    get peerid() {
        return this.m_node.peerid;
    }
    async initialOutbounds() {
        let err = await this._newOutbounds(this.m_minOutbound);
        if (err) {
            return err;
        }
        this.m_checkOutboundTimer = setInterval(() => {
            let next = this.m_minOutbound - (this.m_connectingCount + this.m_node.getOutbounds().length);
            if (next > 0) {
                this._newOutbounds(next);
            }
        }, 1000);
        return error_code_1.ErrorCode.RESULT_OK;
    }
    async _newOutbounds(count, callback) {
        let willConnPeerids = [];
        let canUse = (peerid) => {
            if (this.m_nodeStorage.isBan(peerid)) {
                return false;
            }
            let outConns = this.m_node.getOutbounds();
            for (let outConn of outConns) {
                if (outConn.getRemote() === peerid) {
                    return false;
                }
            }
            for (let pid of this.m_connectingPeerids) {
                if (pid === peerid) {
                    return false;
                }
            }
            for (let pid of willConnPeerids) {
                if (pid === peerid) {
                    return false;
                }
            }
            return true;
        };
        let peerids = this.m_nodeStorage.get('all');
        for (let pid of peerids) {
            if (canUse(pid)) {
                willConnPeerids.push(pid);
                if (willConnPeerids.length === count) {
                    break;
                }
            }
        }
        if (willConnPeerids.length < count) {
            let result = await this.m_node.randomPeers(count);
            if (result.err === error_code_1.ErrorCode.RESULT_OK) {
                for (let pid of result.peers) {
                    if (canUse(pid)) {
                        willConnPeerids.push(pid);
                        if (willConnPeerids.length === count) {
                            break;
                        }
                    }
                }
            }
            else {
                return result.err;
            }
        }
        return await this.connectTo(willConnPeerids, callback);
    }
    async connectTo(willConnPeerids, callback) {
        if (willConnPeerids.length === 0) {
            if (callback) {
                callback(0);
            }
            return error_code_1.ErrorCode.RESULT_OK;
        }
        let canUse = (peerid) => {
            if (this.m_nodeStorage.isBan(peerid)) {
                return false;
            }
            let outConns = this.m_node.getOutbounds();
            for (let outConn of outConns) {
                if (outConn.getRemote() === peerid) {
                    return false;
                }
            }
            for (let pid of this.m_connectingPeerids) {
                if (pid === peerid) {
                    return false;
                }
            }
            return true;
        };
        let ops = [];
        for (let peer of willConnPeerids) {
            if (canUse(peer)) {
                this.m_connectingPeerids.push(peer);
                ops.push(this.m_node.connectTo(peer));
            }
        }
        if (ops.length === 0) {
            if (callback) {
                callback(0);
            }
            return error_code_1.ErrorCode.RESULT_OK;
        }
        let count = ops.length;
        this.m_connectingCount += count;
        let deleteFrom = (pid, pidArray) => {
            for (let i = 0; i < pidArray.length; i++) {
                if (pidArray[i] === pid) {
                    pidArray.splice(i, 1);
                    return;
                }
            }
        };
        Promise.all(ops).then((results) => {
            this.m_connectingCount -= count;
            let connCount = 0;
            for (let r of results) {
                deleteFrom(r.peerid, this.m_connectingPeerids);
                if (r.conn) {
                    this.m_nodeStorage.add(r.conn.getRemote());
                    this._beginSyncWithNode(r.conn);
                    this.emit('outbound', r.conn);
                    ++connCount;
                }
                else {
                    this.m_nodeStorage.remove(r.peerid);
                    if (r.err === error_code_1.ErrorCode.RESULT_VER_NOT_SUPPORT) {
                        this.m_nodeStorage.ban(r.peerid, BAN_LEVEL.month);
                    }
                    else {
                        // 禁用1分钟，防止random的时候又找到它
                        this.m_nodeStorage.ban(r.peerid, BAN_LEVEL.minute);
                    }
                }
            }
            if (callback) {
                callback(connCount);
            }
        });
        return error_code_1.ErrorCode.RESULT_OK;
    }
    async listen() {
        this.m_node.on('inbound', (inbound) => {
            if (this.m_nodeStorage.isBan(inbound.getRemote())) {
                this.m_node.closeConnection(inbound);
            }
            else {
                this._beginSyncWithNode(inbound);
            }
        });
        return await this.m_node.listen();
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
                    this.m_logger.error(`encode header ${header.hash} failed`);
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
                    this.m_logger.error(`encode transaction ${tx.hash} failed`);
                    return err;
                }
            }
            let raw = hwriter.render();
            pwriter = net_1.PackageStreamWriter.fromPackage(SYNC_CMD_TYPE.tx, { count: content.length }, raw.length);
            pwriter.writeData(raw);
        }
        assert(pwriter);
        this.m_node.broadcast(pwriter, options);
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
                    let tx = this.newTransaction();
                    if (tx.decode(txReader) !== error_code_1.ErrorCode.RESULT_OK) {
                        this.m_logger.warn(`receive invalid format transaction from ${conn.getRemote()}`);
                        err = error_code_1.ErrorCode.RESULT_INVALID_PARAM;
                        break;
                    }
                    if (!tx.verifySignature()) {
                        this.m_logger.warn(`receive invalid signature transaction ${tx.hash} from ${conn.getRemote()}`);
                        err = error_code_1.ErrorCode.RESULT_INVALID_TOKEN;
                        break;
                    }
                    txes.push(tx);
                }
                if (err) {
                    this.banConnection(conn.getRemote(), BAN_LEVEL.forever);
                }
                else {
                    if (txes.length) {
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
                        let header = this.newBlockHeader();
                        if (header.decode(headerReader) !== error_code_1.ErrorCode.RESULT_OK) {
                            this.m_logger.warn(`receive invalid format header from ${conn.getRemote()}`);
                            err = error_code_1.ErrorCode.RESULT_INVALID_BLOCK;
                            break;
                        }
                        if (!pkg.body.request || pkg.body.request.from) {
                            // 广播或者用from请求的header必须连续
                            if (preHeader) {
                                if (!preHeader.isPreBlock(header)) {
                                    this.m_logger.warn(`receive headers not in sequence from ${conn.getRemote()}`);
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
                        this.banConnection(conn.getRemote(), BAN_LEVEL.forever);
                        return;
                    }
                    // 用from请求的返回的第一个跟from不一致
                    if (headers.length && pkg.body.request && headers[0].preBlockHash !== pkg.body.request.from) {
                        this.m_logger.warn(`receive headers ${headers[0].preBlockHash} not match with request ${pkg.body.request.from} from ${conn.getRemote()}`);
                        this.banConnection(conn.getRemote(), BAN_LEVEL.forever);
                        return;
                    }
                    // 任何返回 gensis 的都不对
                    if (headers.length) {
                        if (headers[0].number === 0) {
                            this.m_logger.warn(`receive genesis header from ${conn.getRemote()}`);
                            this.banConnection(conn.getRemote(), BAN_LEVEL.forever);
                            return;
                        }
                    }
                }
                else if (pkg.body.error === error_code_1.ErrorCode.RESULT_NOT_FOUND) {
                    let ghr = await this.m_headerStorage.loadHeader(0);
                    if (ghr.err) {
                        return;
                    }
                    // from用gensis请求的返回没有
                    if (pkg.body.request && pkg.body.request.from === ghr.header.hash) {
                        this.m_logger.warn(`receive can't get genesis header ${pkg.body.request.from} from ${conn.getRemote()}`);
                        this.banConnection(conn.getRemote(), BAN_LEVEL.forever);
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
            this.banConnection(conn.getRemote(), BAN_LEVEL.forever);
            return;
        }
        // 构造block对象
        let block = this.newBlock();
        if (block.decode(blockReader) !== error_code_1.ErrorCode.RESULT_OK) {
            this.m_logger.warn(`receive block invalid format from ${conn.getRemote()}`);
            this.banConnection(conn.getRemote(), BAN_LEVEL.forever);
            return;
        }
        if (!block.verify()) {
            this.m_logger.warn(`receive block not match header ${block.header.hash} from ${conn.getRemote()}`);
            this.banConnection(conn.getRemote(), BAN_LEVEL.day); // 可能分叉？
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
        if (typeof from === 'string') {
            let connRequesting = this._getConnRequesting(from);
            if (!connRequesting) {
                return error_code_1.ErrorCode.RESULT_NOT_FOUND;
            }
            conn = connRequesting.conn;
        }
        else {
            conn = from;
        }
        if (this.m_requestingHeaders.get(conn.getRemote())) {
            this.m_logger.warn(`request headers ${options} from ${conn.getRemote()} skipped for former headers request existing`);
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
        let connRequesting = this._getConnRequesting(from);
        if (!connRequesting) {
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
            if (connRequesting.wnd - connRequesting.hashes.size > 0) {
                this._requestBlockFromConnection(hash, connRequesting, options.redoLog);
                if (this.m_pendingBlock.hashes.has(hash)) {
                    this.m_pendingBlock.hashes.delete(hash);
                    this.m_pendingBlock.sequence.splice(this.m_pendingBlock.sequence.indexOf(hash), 1);
                }
            }
            else if (!this.m_pendingBlock.hashes.has(hash)) {
                this.m_pendingBlock.hashes.add(hash);
                this.m_pendingBlock.sequence.push(hash);
            }
        }
        return error_code_1.ErrorCode.RESULT_OK;
    }
    banConnection(remote, level) {
        this.m_logger.warn(`banned peer ${remote} for ${level}`);
        this.m_nodeStorage.ban(remote, level);
        this.m_node.banConnection(remote);
        this._onRemoveConnection(remote);
        this.emit('ban', remote);
    }
    _getConnRequesting(remote) {
        let connRequesting = this.m_requestingBlock.connMap.get(remote);
        if (!connRequesting) {
            let conn = this.m_node.getConnection(remote);
            // TODO: 取不到这个conn的时候要处理
            assert(conn, `no connection to ${remote}`);
            if (!conn) {
                return;
            }
            connRequesting = { hashes: new Set(), wnd: this.m_initBlockWnd, conn: conn };
            this.m_requestingBlock.connMap.set(remote, connRequesting);
        }
        return connRequesting;
    }
    _requestBlockFromConnection(hash, from, redoLog = 0) {
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
        this.m_logger.debug(`request block ${hash} from ${connRequesting.conn.getRemote()}`);
        let writer = net_1.PackageStreamWriter.fromPackage(SYNC_CMD_TYPE.getBlock, { hash, redoLog });
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
            this.banConnection(from, BAN_LEVEL.forever);
        }
        return valid;
    }
    _onRecvBlock(block, from) {
        let stub = this.m_requestingBlock.hashMap.get(block.hash);
        assert(stub, `recv block ${block.hash} from ${from} that never request`);
        if (!stub) {
            this.banConnection(from, BAN_LEVEL.day);
            return error_code_1.ErrorCode.RESULT_INVALID_BLOCK;
        }
        this.m_logger.debug(`recv block hash: ${block.hash} number: ${block.number} from ${from}`);
        this.m_blockStorage.add(block);
        assert(stub.from === from, `request ${block.hash} from ${stub.from} while recv from ${from}`);
        this.m_requestingBlock.hashMap.delete(block.hash);
        let connRequesting = this.m_requestingBlock.connMap.get(stub.from);
        assert(connRequesting, `requesting info on ${stub.from} missed`);
        if (!connRequesting) {
            return error_code_1.ErrorCode.RESULT_EXCEPTION;
        }
        connRequesting.hashes.delete(block.hash);
        this.m_blockFromMap.delete(block.hash);
        this.m_cc.onRecvBlock(this, block, connRequesting);
        this._onFreeBlockWnd(connRequesting);
        return error_code_1.ErrorCode.RESULT_OK;
    }
    _onConnectionError(remote) {
        this._onRemoveConnection(remote);
    }
    _onRemoveConnection(remote) {
        let connRequesting = this.m_requestingBlock.connMap.get(remote);
        if (connRequesting) {
            let toPending = new Array();
            for (let hash of connRequesting.hashes) {
                this.m_pendingBlock.hashes.add(hash);
                toPending.push(hash);
                this.m_requestingBlock.hashMap.delete(hash);
            }
            this.m_pendingBlock.sequence.unshift(...toPending);
        }
        this.m_requestingBlock.connMap.delete(remote);
        for (let hash of this.m_blockFromMap.keys()) {
            let sources = this.m_blockFromMap.get(hash);
            if (sources.has(remote)) {
                sources.delete(remote);
                if (!sources.size) {
                    this.m_pendingBlock.sequence.splice(this.m_pendingBlock.sequence.indexOf(hash), 1);
                }
                else {
                    for (let from of sources) {
                        let fromRequesting = this.m_requestingBlock.connMap.get(from);
                        assert(fromRequesting, `block requesting connection ${from} not exists`);
                        if (fromRequesting.hashes.size < fromRequesting.wnd) {
                            this._requestBlockFromConnection(hash, fromRequesting);
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
                    this.banConnection(stub.from, BAN_LEVEL.hour);
                }
            }
        }
        // 返回headers超时
        for (let remote of this.m_requestingHeaders.keys()) {
            let rh = this.m_requestingHeaders.get(remote);
            if (now - rh.time > this.m_headersTimeout) {
                this.banConnection(remote, BAN_LEVEL.hour);
            }
        }
    }
    newTransaction() {
        return new this.m_transactionType();
    }
    newBlockHeader() {
        return new this.m_blockHeaderType();
    }
    newBlock(header) {
        let block = new block_1.Block({
            header,
            headerType: this.m_blockHeaderType,
            transactionType: this.m_transactionType
        });
        return block;
    }
    async _responseBlocks(conn, req) {
        assert(this.m_headerStorage);
        assert(this.m_blockStorage);
        this.m_logger.info(`receive block request from ${conn.getRemote()} with ${JSON.stringify(req)}`);
        let bwriter = new writer_1.BufferWriter();
        let block = this.m_blockStorage.get(req.hash);
        if (!block) {
            this.m_logger.crit(`cannot get Block ${req.hash} from blockStorage`);
            assert(false, `${this.m_node.peerid} cannot get Block ${req.hash} from blockStorage`);
            return error_code_1.ErrorCode.RESULT_OK;
        }
        let err = block.encode(bwriter);
        if (err) {
            this.m_logger.error(`encode block ${block.hash} failed`);
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
                this.m_logger.error(`encode redolog ${req.hash} failed`);
                return err;
            }
            let redoLogRaw = redoLogWriter.render();
            let dataLength = rawBlocks.length + redoLogRaw.length;
            let pwriter = net_1.PackageStreamWriter.fromPackage(SYNC_CMD_TYPE.block, {
                blockLength: rawBlocks.length,
                redoLogLength: redoLogRaw.length,
                redoLog: 1,
            }, dataLength);
            conn.addPendingWriter(pwriter);
            pwriter.writeData(rawBlocks);
            pwriter.writeData(redoLogRaw);
        }
        else {
            let pwriter = net_1.PackageStreamWriter.fromPackage(SYNC_CMD_TYPE.block, { redoLog: 0 }, rawBlocks.length);
            conn.addPendingWriter(pwriter);
            pwriter.writeData(rawBlocks);
        }
        return error_code_1.ErrorCode.RESULT_OK;
    }
    async getHeader(arg1, arg2) {
        let header;
        assert(this.m_headerStorage);
        if (arg2 === undefined || arg2 === undefined) {
            if (arg1 instanceof block_1.BlockHeader) {
                assert(false);
                return { err: error_code_1.ErrorCode.RESULT_INVALID_PARAM };
            }
            return await this.m_headerStorage.loadHeader(arg1);
        }
        else {
            let fromHeader;
            if (arg1 instanceof block_1.BlockHeader) {
                fromHeader = arg1;
            }
            else {
                let hr = await this.m_headerStorage.loadHeader(arg1);
                if (hr.err) {
                    return hr;
                }
                fromHeader = hr.header;
            }
            let headers = [];
            headers.push(fromHeader);
            if (arg2 > 0) {
                assert(false);
                return { err: error_code_1.ErrorCode.RESULT_INVALID_PARAM };
            }
            else {
                if (fromHeader.number + arg2 < 0) {
                    arg2 = -fromHeader.number;
                }
                for (let ix = 0; ix < -arg2; ++ix) {
                    let hr = await this.m_headerStorage.loadHeader(fromHeader.preBlockHash);
                    if (hr.err) {
                        return hr;
                    }
                    fromHeader = hr.header;
                    headers.push(fromHeader);
                }
                headers = headers.reverse();
                return { err: error_code_1.ErrorCode.RESULT_OK, header: headers[0], headers };
            }
        }
    }
    async _responseHeaders(conn, req) {
        assert(this.m_headerStorage);
        this.m_logger.info(`receive header request from ${conn.getRemote()} with ${JSON.stringify(req)}`);
        if (req.from) {
            let hwriter = new writer_1.BufferWriter();
            let respErr = error_code_1.ErrorCode.RESULT_OK;
            let headerCount = 0;
            do {
                let tipResult = await this.m_headerStorage.loadHeader('latest');
                if (tipResult.err) {
                    return tipResult.err;
                }
                let heightResult = await this.m_headerStorage.getHeightOnBest(req.from);
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
                let hr = await this.getHeader(heightResult.height + headerCount);
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
                let hsr = await this.getHeader(hr.header.hash, -headerCount + 1);
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
                        this.m_logger.error(`encode header ${h.hash} failed`);
                        respErr = error_code_1.ErrorCode.RESULT_NOT_FOUND;
                    }
                }
            } while (false);
            let rawHeaders = hwriter.render();
            let pwriter = net_1.PackageStreamWriter.fromPackage(SYNC_CMD_TYPE.header, { count: headerCount, request: req, error: respErr }, rawHeaders.length);
            conn.addPendingWriter(pwriter);
            pwriter.writeData(rawHeaders);
            return error_code_1.ErrorCode.RESULT_OK;
        }
        else {
            return error_code_1.ErrorCode.RESULT_INVALID_PARAM;
        }
    }
}
exports.ChainNode = ChainNode;
