"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const package_1 = require("./package");
const events_1 = require("events");
const msgpack = require('msgpack-lite');
const assert = require('assert');
var WRITER_EVENT;
(function (WRITER_EVENT) {
    WRITER_EVENT["error"] = "error";
    WRITER_EVENT["finish"] = "finish";
})(WRITER_EVENT = exports.WRITER_EVENT || (exports.WRITER_EVENT = {}));
class PackageStreamWriter extends events_1.EventEmitter {
    constructor() {
        super();
        this.m_pending = [];
        this.m_toSendLength = 0;
        this.m_writtenLength = 0;
        this.m_sentLength = 0;
    }
    static fromPackage(cmdType, body, dataLength = 0) {
        let writer = new PackageStreamWriter();
        let writeHeader = {
            version: 0,
            magic: package_1.Package.magic,
            flags: 0,
            bodyLength: 0,
            totalLength: 0,
            cmdType,
        };
        let bodyBuffer = null;
        writeHeader.bodyLength = 0;
        if (body) {
            bodyBuffer = msgpack.encode(body);
            writeHeader.bodyLength = bodyBuffer.length;
        }
        writeHeader.totalLength = package_1.Package.headerLength + writeHeader.bodyLength + dataLength;
        let headerBuffer = Buffer.alloc(package_1.Package.headerLength);
        let offset = 0;
        offset = headerBuffer.writeUInt16BE(writeHeader.magic, offset);
        offset = headerBuffer.writeUInt16BE(writeHeader.version, offset);
        offset = headerBuffer.writeUInt16BE(writeHeader.flags, offset);
        offset = headerBuffer.writeUInt16BE(writeHeader.cmdType, offset);
        offset = headerBuffer.writeUInt32BE(writeHeader.totalLength, offset);
        offset = headerBuffer.writeUInt32BE(writeHeader.bodyLength, offset);
        writer.m_toSendLength = writeHeader.totalLength;
        writer.m_writtenLength = package_1.Package.headerLength + writeHeader.bodyLength;
        writer.m_pending.push(headerBuffer);
        if (bodyBuffer) {
            writer.m_pending.push(bodyBuffer);
        }
        return writer;
    }
    bind(connection) {
        assert(!this.m_connection);
        if (this.m_connection) {
            return this;
        }
        this.m_connection = connection;
        this._doSend();
        return this;
    }
    clone() {
        let writer = new PackageStreamWriter();
        for (let buf of this.m_pending) {
            let _buf = buf;
            writer.m_pending.push(Buffer.from(_buf.buffer, _buf.offset, _buf.length));
        }
        writer.m_toSendLength = this.m_toSendLength;
        writer.m_writtenLength = 0;
        writer.m_sentLength = 0;
        writer.m_drainListener = undefined;
        return writer;
    }
    writeData(buffer) {
        if (!buffer.length) {
            return this;
        }
        if (this.m_writtenLength + buffer.length > this.m_toSendLength) {
            return this;
        }
        this.m_writtenLength += buffer.length;
        this.m_pending.push(buffer);
        this._doSend();
        return this;
    }
    async _doSend() {
        if (!this.m_connection) {
            return;
        }
        if (this.m_drainListener) {
            return;
        }
        let spliceTo = 0;
        for (; spliceTo < this.m_pending.length; ++spliceTo) {
            let buffer = this.m_pending[spliceTo];
            let sent = this.m_connection.send(buffer);
            this.m_sentLength += sent;
            if (sent < buffer.length) {
                assert(!this.m_drainListener);
                this.m_drainListener = () => {
                    this.m_drainListener = undefined;
                    this._doSend();
                };
                this.m_pending[spliceTo] = Buffer.from(buffer.buffer, buffer.offset + sent, buffer.length - sent);
                this.m_connection.once('drain', this.m_drainListener);
                break;
            }
        }
        this.m_pending.splice(0, spliceTo);
        assert(this.m_sentLength <= this.m_toSendLength);
        if (this.m_sentLength === this.m_toSendLength) {
            setImmediate(() => { this.emit(WRITER_EVENT.finish); });
        }
    }
    close() {
        if (this.m_connection && this.m_drainListener) {
            this.m_connection.removeListener('drain', this.m_drainListener);
        }
        this.removeAllListeners(WRITER_EVENT.finish);
        this.removeAllListeners(WRITER_EVENT.error);
        this.m_connection = undefined;
        this.m_drainListener = undefined;
        return;
    }
}
exports.PackageStreamWriter = PackageStreamWriter;
