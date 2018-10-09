"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const package_1 = require("./package");
const events_1 = require("events");
const error_code_1 = require("../error_code");
const msgpack = require('msgpack-lite');
const assert = require('assert');
var READER_STATE;
(function (READER_STATE) {
    READER_STATE[READER_STATE["error"] = -1] = "error";
    READER_STATE[READER_STATE["wait"] = 0] = "wait";
    READER_STATE[READER_STATE["header"] = 1] = "header";
    READER_STATE[READER_STATE["body"] = 2] = "body";
    READER_STATE[READER_STATE["data"] = 3] = "data";
})(READER_STATE || (READER_STATE = {}));
var READER_EVENT;
(function (READER_EVENT) {
    READER_EVENT["error"] = "error";
    READER_EVENT["pkg"] = "pkg";
})(READER_EVENT = exports.READER_EVENT || (exports.READER_EVENT = {}));
class PackageStreamReader extends events_1.EventEmitter {
    constructor() {
        super();
        this.m_stateInfo = {
            state: READER_STATE.wait,
            pkg: new package_1.Package(),
            pendingLength: 0,
            pending: [],
        };
        this.m_connection = null;
        this.m_dataListener = (buffers) => {
            let stateInfo = this.m_stateInfo;
            if (stateInfo.state === READER_STATE.wait) {
                stateInfo.pkg = new package_1.Package();
                stateInfo.pending = [];
                stateInfo.state = READER_STATE.header;
                stateInfo.pendingLength = 0;
            }
            this._pushPending(buffers);
            do {
                if (stateInfo.state === READER_STATE.wait) {
                    stateInfo.pkg = new package_1.Package();
                    stateInfo.state = READER_STATE.header;
                }
                if (stateInfo.state === READER_STATE.header) {
                    let headerBuffers = this._popPending(package_1.Package.headerLength);
                    if (!headerBuffers) {
                        break;
                    }
                    let headerBuffer = Buffer.concat(headerBuffers);
                    let header = stateInfo.pkg.header;
                    let offset = 0;
                    header.magic = headerBuffer.readUInt16BE(offset);
                    offset += 2;
                    if (header.magic !== package_1.Package.magic) {
                        stateInfo.state = READER_STATE.error;
                        setImmediate(() => this.emit('error', error_code_1.ErrorCode.RESULT_PARSE_ERROR, 'magic' // 标记一下触发error的字段
                        ));
                    }
                    header.version = headerBuffer.readUInt16BE(offset);
                    offset += 2;
                    header.flags = headerBuffer.readUInt16BE(offset);
                    offset += 2;
                    header.cmdType = headerBuffer.readUInt16BE(offset);
                    offset += 2;
                    header.totalLength = headerBuffer.readUInt32BE(offset);
                    offset += 4;
                    header.bodyLength = headerBuffer.readUInt32BE(offset);
                    offset += 4;
                    stateInfo.state = READER_STATE.body;
                }
                if (stateInfo.state === READER_STATE.body) {
                    if (stateInfo.pkg.header.bodyLength) {
                        let bodyBuffers = this._popPending(stateInfo.pkg.header.bodyLength);
                        if (!bodyBuffers) {
                            break;
                        }
                        let bodyBuffer = Buffer.concat(bodyBuffers);
                        Object.assign(stateInfo.pkg.body, msgpack.decode(bodyBuffer));
                    }
                    stateInfo.state = READER_STATE.data;
                }
                if (stateInfo.state === READER_STATE.data) {
                    let pkg;
                    if (stateInfo.pkg.dataLength) {
                        let dataBuffers = this._popPending(stateInfo.pkg.dataLength);
                        if (!dataBuffers) {
                            break;
                        }
                        stateInfo.pkg.data.push(...dataBuffers);
                        pkg = stateInfo.pkg;
                    }
                    else {
                        pkg = stateInfo.pkg;
                    }
                    stateInfo.state = READER_STATE.wait;
                    if (pkg) {
                        pkg.data[0] = Buffer.concat(pkg.data);
                        setImmediate(() => { this.emit(READER_EVENT.pkg, pkg); });
                    }
                }
            } while (stateInfo.pendingLength);
        };
    }
    _clearPending() {
        this.m_stateInfo.pendingLength = 0;
        this.m_stateInfo.pending = [];
    }
    _popPending(length) {
        let stateInfo = this.m_stateInfo;
        if (length > stateInfo.pendingLength) {
            return null;
        }
        let next = length;
        let spliceTo = 0;
        let popLast = null;
        for (; spliceTo < stateInfo.pending.length; ++spliceTo) {
            let buffer = stateInfo.pending[spliceTo];
            if (buffer.length === next) {
                spliceTo += 1;
                break;
            }
            else if (buffer.length > next) {
                popLast = Buffer.from(buffer.buffer, buffer.offset, next);
                stateInfo.pending[spliceTo] = Buffer.from(buffer.buffer, buffer.offset + next, buffer.length - next);
                break;
            }
            else {
                next -= buffer.length;
            }
        }
        let pop = stateInfo.pending.splice(0, spliceTo);
        if (popLast) {
            pop.push(popLast);
        }
        stateInfo.pendingLength -= length;
        return pop;
    }
    _pushPending(buffers) {
        for (let buffer of buffers) {
            this.m_stateInfo.pending.push(buffer);
            this.m_stateInfo.pendingLength += buffer.length;
        }
    }
    start(connection) {
        if (this.m_connection) {
            return;
        }
        this.m_connection = connection;
        this.m_connection.on('data', this.m_dataListener);
    }
    stop() {
        if (this.m_connection) {
            this.m_connection.removeListener('data', this.m_dataListener);
            this.m_connection = null;
        }
    }
    close() {
        this.stop();
    }
}
exports.PackageStreamReader = PackageStreamReader;
