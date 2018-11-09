"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const error_code_1 = require("../error_code");
const connection_1 = require("./connection");
const writer_1 = require("./writer");
const reader_1 = require("./reader");
const events_1 = require("events");
let assert = require('assert');
const version_1 = require("./version");
const reader_2 = require("../lib/reader");
const writer_2 = require("../lib/writer");
const logger_util_1 = require("../lib/logger_util");
var CMD_TYPE;
(function (CMD_TYPE) {
    CMD_TYPE[CMD_TYPE["version"] = 1] = "version";
    CMD_TYPE[CMD_TYPE["versionAck"] = 2] = "versionAck";
    CMD_TYPE[CMD_TYPE["userCmd"] = 16] = "userCmd";
})(CMD_TYPE = exports.CMD_TYPE || (exports.CMD_TYPE = {}));
class INode extends events_1.EventEmitter {
    constructor(options) {
        super();
        this.m_inConn = [];
        this.m_outConn = [];
        this.m_remoteMap = new Map();
        this.m_peerid = options.peerid;
        this.m_network = options.network;
        this.m_logger = logger_util_1.initLogger(options);
    }
    async randomPeers(count, excludes) {
        return { err: error_code_1.ErrorCode.RESULT_NO_IMP, peers: [] };
    }
    static isValidPeerid(peerid) {
        return -1 === peerid.indexOf('^');
    }
    static isValidNetwork(network) {
        return -1 === network.indexOf('^');
    }
    static fullPeerid(network, peerid) {
        return `${network}^${peerid}`;
    }
    static splitFullPeerid(fpeerid) {
        const spliter = fpeerid.indexOf('^');
        if (-1 === spliter) {
            return undefined;
        }
        const parts = fpeerid.split('^');
        return { network: parts[0], peerid: parts[1] };
    }
    set genesisHash(genesis_hash) {
        this.m_genesis = genesis_hash;
    }
    set logger(logger) {
        this.m_logger = logger;
    }
    get peerid() {
        return this.m_peerid;
    }
    get network() {
        return this.m_network;
    }
    async init() {
    }
    dumpConns() {
        let ret = [];
        this.m_inConn.forEach((element) => {
            ret.push(` <= ${element.remote}`);
        });
        this.m_outConn.forEach((element) => {
            ret.push(` => ${element.remote}`);
        });
        return ret;
    }
    uninit() {
        this.removeAllListeners('inbound');
        this.removeAllListeners('error');
        this.removeAllListeners('ban');
        let ops = [];
        for (let conn of this.m_inConn) {
            ops.push(conn.destroy());
        }
        for (let conn of this.m_outConn) {
            ops.push(conn.destroy());
        }
        this.m_inConn = [];
        this.m_outConn = [];
        this.m_remoteMap.clear();
        return Promise.all(ops);
    }
    async listen() {
        return error_code_1.ErrorCode.RESULT_NO_IMP;
    }
    async connectTo(peerid) {
        let result = await this._connectTo(peerid);
        if (!result.conn) {
            return { err: result.err, peerid };
        }
        let conn = result.conn;
        conn.remote = peerid;
        conn.network = this.network;
        let ver = new version_1.Version();
        conn.version = ver;
        if (!this.m_genesis || !this.m_peerid) {
            this.m_logger.error(`connectTo failed for genesis or peerid not set`);
            assert(false, `${this.m_peerid} has not set genesis`);
            return { err: error_code_1.ErrorCode.RESULT_INVALID_STATE, peerid };
        }
        ver.genesis = this.m_genesis;
        ver.peerid = this.m_peerid;
        let err = await new Promise((resolve) => {
            conn.once('pkg', (pkg) => {
                conn.removeListener('error', fn);
                if (pkg.header.cmdType === CMD_TYPE.versionAck) {
                    if (pkg.body.isSupport) {
                        // 忽略网络传输时间
                        let nTimeDelta = pkg.body.timestamp - Date.now();
                        conn.setTimeDelta(nTimeDelta);
                        resolve(error_code_1.ErrorCode.RESULT_OK);
                    }
                    else {
                        conn.close();
                        resolve(error_code_1.ErrorCode.RESULT_VER_NOT_SUPPORT);
                    }
                }
                else {
                    conn.close();
                    resolve(error_code_1.ErrorCode.RESULT_INVALID_STATE);
                }
            });
            let writer = new writer_2.BufferWriter();
            let encodeErr = ver.encode(writer);
            if (encodeErr) {
                this.m_logger.error(`version instance encode failed `, ver);
                resolve(encodeErr);
                return;
            }
            let buf = writer.render();
            let verWriter = writer_1.PackageStreamWriter.fromPackage(CMD_TYPE.version, {}, buf.length).writeData(buf);
            conn.addPendingWriter(verWriter);
            let fn = (_conn, _err) => {
                _conn.close();
                resolve(_err);
            };
            conn.once('error', fn);
        });
        if (err) {
            return { err, peerid };
        }
        let other = this.getConnection(peerid);
        if (other) {
            if (conn.version.compare(other.version) > 0) {
                conn.close();
                return { err: error_code_1.ErrorCode.RESULT_ALREADY_EXIST, peerid };
            }
            else {
                this.closeConnection(other);
            }
        }
        this.m_outConn.push(result.conn);
        this.m_remoteMap.set(peerid, result.conn);
        conn.on('error', (_conn, _err) => {
            this.closeConnection(result.conn);
            this.emit('error', result.conn, _err);
        });
        return { err: error_code_1.ErrorCode.RESULT_OK, peerid, conn };
    }
    async broadcast(writer, options) {
        let nSend = 0;
        let nMax = 999999999;
        if (options && options.count) {
            nMax = options.count;
        }
        let sent = new Map();
        for (let conn of this.m_inConn) {
            if (nSend === nMax) {
                return { err: error_code_1.ErrorCode.RESULT_OK, count: nSend };
            }
            if (sent.has(conn.remote)) {
                continue;
            }
            if (!options || !options.filter || options.filter(conn)) {
                conn.addPendingWriter(writer.clone());
                nSend++;
                sent.set(conn.remote, 1);
            }
        }
        for (let conn of this.m_outConn) {
            if (nSend === nMax) {
                return { err: error_code_1.ErrorCode.RESULT_OK, count: nSend };
            }
            if (sent.has(conn.remote)) {
                continue;
            }
            if (!options || !options.filter || options.filter(conn)) {
                conn.addPendingWriter(writer.clone());
                nSend++;
                sent.set(conn.remote, 1);
            }
        }
        return { err: error_code_1.ErrorCode.RESULT_OK, count: nSend };
    }
    isInbound(conn) {
        for (let c of this.m_inConn) {
            if (c === conn) {
                return true;
            }
        }
        return false;
    }
    getOutbounds() {
        const c = this.m_outConn;
        return c;
    }
    getInbounds() {
        const c = this.m_inConn;
        return c;
    }
    getConnnectionCount() {
        return this.m_outConn.length + this.m_inConn.length;
    }
    getConnection(remote) {
        return this.m_remoteMap.get(remote);
    }
    isOutbound(conn) {
        for (let c of this.m_outConn) {
            if (c === conn) {
                return true;
            }
        }
        return false;
    }
    banConnection(remote) {
        let conn = this.m_remoteMap.get(remote);
        if (conn) {
            this.closeConnection(conn, true);
        }
    }
    closeConnection(conn, destroy = false) {
        conn.removeAllListeners('error');
        conn.removeAllListeners('pkg');
        let index = 0;
        do {
            for (let c of this.m_outConn) {
                if (c === conn) {
                    this.m_outConn.splice(index, 1);
                    break;
                }
                index++;
            }
            index = 0;
            for (let c of this.m_inConn) {
                if (c === conn) {
                    this.m_inConn.splice(index, 1);
                    break;
                }
                index++;
            }
        } while (false);
        this.m_remoteMap.delete(conn.remote);
        if (destroy) {
            conn.destroy();
        }
        else {
            conn.close();
        }
    }
    on(event, listener) {
        return super.on(event, listener);
    }
    once(event, listener) {
        return super.once(event, listener);
    }
    _onInbound(inbound) {
        inbound.once('pkg', (pkg) => {
            inbound.removeListener('error', fn);
            if (pkg.header.cmdType === CMD_TYPE.version) {
                let buff = pkg.data[0];
                let dataReader = new reader_2.BufferReader(buff);
                let ver = new version_1.Version();
                inbound.version = ver;
                let err = ver.decode(dataReader);
                if (err) {
                    this.m_logger.warn(`recv version in invalid format from ${inbound.remote} `);
                    inbound.close();
                    return;
                }
                // 检查对方包里的genesis_hash是否对应得上
                if (ver.genesis !== this.m_genesis) {
                    this.m_logger.warn(`recv version genesis ${ver.genesis} not match ${this.m_genesis} from ${inbound.remote} `);
                    inbound.close();
                    return;
                }
                // 忽略网络传输时间
                let nTimeDelta = ver.timestamp - Date.now();
                inbound.remote = ver.peerid;
                inbound.network = this.network;
                inbound.setTimeDelta(nTimeDelta);
                let isSupport = true;
                let ackWriter = writer_1.PackageStreamWriter.fromPackage(CMD_TYPE.versionAck, { isSupport, timestamp: Date.now() }, 0);
                inbound.addPendingWriter(ackWriter);
                if (!isSupport) {
                    inbound.close();
                    return;
                }
                let other = this.getConnection(inbound.remote);
                if (other) {
                    if (inbound.version.compare(other.version) > 0) {
                        inbound.close();
                        return;
                    }
                    else {
                        this.closeConnection(other);
                    }
                }
                this.m_inConn.push(inbound);
                this.m_remoteMap.set(ver.peerid, inbound);
                inbound.on('error', (conn, _err) => {
                    this.closeConnection(inbound);
                    this.emit('error', inbound, _err);
                });
                this.emit('inbound', inbound);
            }
            else {
                inbound.close();
            }
        });
        let fn = () => {
            inbound.close();
        };
        inbound.once('error', fn);
    }
    async _connectTo(peerid) {
        return { err: error_code_1.ErrorCode.RESULT_NO_IMP };
    }
    _connectionType() {
        return connection_1.IConnection;
    }
    _nodeConnectionType() {
        let superClass = this._connectionType();
        return class extends superClass {
            constructor(...args) {
                assert(args.length);
                let thisNode = args[0];
                super(...(args.slice(1)));
                this.m_pendingWriters = [];
                this.m_reader = new reader_1.PackageStreamReader();
                this.m_reader.start(this);
                this.m_reader.on('pkg', (pkg) => {
                    super.emit('pkg', pkg);
                });
                // 接收到 reader的传出来的error 事件后, emit ban事件, 给上层的chain_node去做处理
                // 这里只需要emit给上层, 最好不要处理其他逻辑
                this.m_reader.on('error', (err, column) => {
                    let remote = this.remote;
                    thisNode.emit('ban', remote);
                });
            }
            get fullRemote() {
                return INode.fullPeerid(this.network, this.remote);
            }
            addPendingWriter(writer) {
                let onFinish = () => {
                    let _writer = this.m_pendingWriters.splice(0, 1)[0];
                    _writer.close();
                    if (this.m_pendingWriters.length) {
                        this.m_pendingWriters[0].on(writer_1.WRITER_EVENT.finish, onFinish);
                        this.m_pendingWriters[0].on(writer_1.WRITER_EVENT.error, onFinish);
                        this.m_pendingWriters[0].bind(this);
                    }
                };
                if (!this.m_pendingWriters.length) {
                    writer.on(writer_1.WRITER_EVENT.finish, onFinish);
                    writer.on(writer_1.WRITER_EVENT.error, onFinish);
                    writer.bind(this);
                }
                this.m_pendingWriters.push(writer);
            }
            async close() {
                for (let w of this.m_pendingWriters) {
                    w.close();
                }
                this.m_pendingWriters = [];
                return await super.close();
            }
        };
    }
}
exports.INode = INode;
