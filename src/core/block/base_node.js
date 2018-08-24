"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require('assert');
const events_1 = require("events");
const error_code_1 = require("../error_code");
const node_storage_1 = require("./node_storage");
const block_1 = require("./block");
const { LogShim } = require('../lib/log_shim');
var BAN_LEVEL;
(function (BAN_LEVEL) {
    BAN_LEVEL[BAN_LEVEL["minute"] = 1] = "minute";
    BAN_LEVEL[BAN_LEVEL["hour"] = 60] = "hour";
    BAN_LEVEL[BAN_LEVEL["day"] = 1440] = "day";
    BAN_LEVEL[BAN_LEVEL["month"] = 43200] = "month";
    BAN_LEVEL[BAN_LEVEL["forever"] = 0] = "forever";
})(BAN_LEVEL = exports.BAN_LEVEL || (exports.BAN_LEVEL = {}));
class BaseNode extends events_1.EventEmitter {
    constructor(options) {
        super();
        this.m_connecting = new Set();
        this.m_blockHeaderType = options.blockHeaderType;
        this.m_transactionType = options.transactionType;
        this.m_node = options.node;
        this.m_logger = new LogShim(options.logger).bind(`[peerid: ${this.peerid}]`, true).log;
        this.m_headerStorage = options.headerStorage;
        this.m_node.on('error', (conn, err) => {
            this.emit('error', conn.getRemote());
        });
        // 收到net/node的ban事件, 调用 ChainNode的banConnection方法做封禁处理
        // 日期先设置为按天
        this.m_node.on('ban', (remote) => {
            this.banConnection(remote, BAN_LEVEL.day);
        });
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
        return super.once(event, listener);
    }
    prependListener(event, listener) {
        return super.prependListener(event, listener);
    }
    prependOnceListener(event, listener) {
        return super.prependOnceListener(event, listener);
    }
    async init() {
        // 读取创始块的hash值， 并将其传入 net/node
        const result = await this.m_headerStorage.getHeader(0);
        const genesis_hash = result.header.hash;
        this.m_node.genesisHash = genesis_hash;
        await this.m_node.init();
    }
    uninit() {
        return this.m_node.uninit();
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
    async initialOutbounds() {
        return error_code_1.ErrorCode.RESULT_OK;
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
    get headerStorage() {
        return this.m_headerStorage;
    }
    async _connectTo(willConn, callback) {
        if (!willConn.size) {
            if (callback) {
                callback(0);
            }
            return error_code_1.ErrorCode.RESULT_OK;
        }
        let ops = [];
        for (let peer of willConn) {
            if (this._onWillConnectTo(peer)) {
                this.m_connecting.add(peer);
                ops.push(this.m_node.connectTo(peer));
            }
        }
        if (ops.length === 0) {
            if (callback) {
                callback(0);
            }
            return error_code_1.ErrorCode.RESULT_OK;
        }
        Promise.all(ops).then((results) => {
            let connCount = 0;
            for (let r of results) {
                this.m_connecting.delete(r.peerid);
                this.logger.debug(`connect to ${r.peerid} err: `, r.err);
                if (r.conn) {
                    this.m_nodeStorage.add(r.conn.getRemote());
                    this.emit('outbound', r.conn);
                    ++connCount;
                }
                else {
                    if (r.err !== error_code_1.ErrorCode.RESULT_ALREADY_EXIST) {
                        this.m_nodeStorage.remove(r.peerid);
                    }
                    if (r.err === error_code_1.ErrorCode.RESULT_VER_NOT_SUPPORT) {
                        this.m_nodeStorage.ban(r.peerid, BAN_LEVEL.month);
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
                this.logger.warn(`new inbound from ${inbound.getRemote()} ignored for ban`);
                this.m_node.closeConnection(inbound);
            }
            else {
                this.logger.info(`new inbound from `, inbound.getRemote());
                this.emit('inbound', inbound);
            }
        });
        return await this.m_node.listen();
    }
    banConnection(remote, level) {
        this.m_logger.warn(`banned peer ${remote} for ${level}`);
        this.m_nodeStorage.ban(remote, level);
        this.m_node.banConnection(remote);
        this.emit('ban', remote);
    }
    _onWillConnectTo(peerid) {
        if (this.m_nodeStorage.isBan(peerid)) {
            return false;
        }
        if (this.m_node.getConnection(peerid)) {
            return false;
        }
        if (this.m_connecting.has(peerid)) {
            return false;
        }
        return true;
    }
}
exports.BaseNode = BaseNode;
