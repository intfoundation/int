const msgpack = require('msgpack-lite');
const EventEmitter = require('events');
const assert = require('assert');
const bdt = require('../../bdt/bdt');

class DPackageStreamReader extends EventEmitter {
    constructor() {
        super();
        this.m_stateInfo = {
            state: DPackageStreamReader.STATE.wait,
            pkg: null,
            pendingLength: 0,
            pending: [],
        };
        this.m_connection = null;
        this.m_dataListener = (buffers)=>{
            let stateInfo = this.m_stateInfo;
            if (stateInfo.state === DPackageStreamReader.STATE.wait) {
                stateInfo.pkg = new DPackage();
                stateInfo.pending = [];
                stateInfo.state = DPackageStreamReader.STATE.header;
                stateInfo.pendingLength = 0;
            } 
            this._pushPending(buffers);

            do {
                if (stateInfo.state === DPackageStreamReader.STATE.wait) {
                    stateInfo.pkg = new DPackage();
                    stateInfo.state = DPackageStreamReader.STATE.header;   
                } 
                if (stateInfo.state === DPackageStreamReader.STATE.header) {
                    let headerBuffers = this._popPending(DPackage.headerLength);
                    if (!headerBuffers) {
                        break;
                    }
                    let headerBuffer = Buffer.concat(headerBuffers);
                    let header = stateInfo.pkg.header;
                    let offset = 0;
                    header.magic = headerBuffer.readUInt16BE(offset);
                    offset += 2;
                    if (header.magic !== DPackage.magic) {
                        stateInfo.state = DPackageStreamReader.STATE.error;
                        setImmediate(()=>{this.emit('error', DPackage.ERROR.unmatchPackage);});
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
                    stateInfo.state = DPackageStreamReader.STATE.body;
                } 
                if (stateInfo.state === DPackageStreamReader.STATE.body) {
                    if (stateInfo.pkg.header.bodyLength) {
                        let bodyBuffers = this._popPending(stateInfo.pkg.header.bodyLength);
                        if (!bodyBuffers) {
                            break;
                        }
                        let bodyBuffer = Buffer.concat(bodyBuffers);
                        Object.assign(stateInfo.pkg.body, msgpack.decode(bodyBuffer));
                    }
                    stateInfo.state = DPackageStreamReader.STATE.data;
                } 
                if (stateInfo.state === DPackageStreamReader.STATE.data) {
                    let pkg = null;
                    if (stateInfo.pkg.dataLength) {
                        let dataBuffers = this._popPending(stateInfo.pkg.dataLength);
                        if (!dataBuffers) {
                            break;
                        }
                        stateInfo.pkg.data.push(...dataBuffers);
                        pkg = stateInfo.pkg;
                    } else {
                        pkg = stateInfo.pkg;
                    }
                    stateInfo.pkg = null;
                    stateInfo.state = DPackageStreamReader.STATE.wait;
                    if (pkg) {
                        pkg.data[0] = Buffer.concat(pkg.data);
                        setImmediate(()=>{this.emit(DPackageStreamReader.EVENT.pkg, pkg);}); 
                    }
                }
            } while(stateInfo.pendingLength);
        };
    }

    _clearPending() {
        this.m_stateInfo.pkg = null;
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
            } else if (buffer.length > next) {
                popLast = Buffer.from(buffer.buffer, buffer.offset, next);
                stateInfo.pending[spliceTo] = Buffer.from(buffer.buffer, buffer.offset + next, buffer.length - next);
                break;
            } else {
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
            return ;
        }
        this.m_connection = connection;
        this.m_connection.on(bdt.Connection.EVENT.data, this.m_dataListener);
    }

    stop() {
        if (this.m_connection) {
            this.m_connection.removeListener(bdt.Connection.EVENT.data, this.m_dataListener);
            this.m_connection = null;
        }
    }

    close() {
        this.stop();
    }
}


DPackageStreamReader.STATE = {
    error: -1,
    wait: 0,
    header: 1,
    body: 2,
    data: 3,
};

DPackageStreamReader.EVENT = {
    error: 'error',
    pkg: 'package'
};


class DPackageStreamWriter extends EventEmitter {
    constructor() {
        super();
        this.m_connection = null;
        this.m_pending = [];
        this.m_toSendLength = 0;
        this.m_writtenLength = 0;
        this.m_sentLength = 0;
        this.m_drainListener = null;
    }

    static fromPackage(header, body, dataLength=0) {
        let writer = new DPackageStreamWriter(null);
        let writeHeader = {};
        Object.assign(writeHeader, header);
        writeHeader.version = 0;
        writeHeader.magic = DPackage.magic;
        writeHeader.flags = 0;
        let bodyBuffer = null;
        writeHeader.bodyLength = 0;
        if (body) {
            bodyBuffer = msgpack.encode(body);
            writeHeader.bodyLength = bodyBuffer.length;
        }
        writeHeader.dataLength = dataLength;
        writeHeader.totalLength = DPackage.headerLength + writeHeader.bodyLength + dataLength;
        let headerBuffer = Buffer.alloc(DPackage.headerLength);
        let offset = 0;
        offset = headerBuffer.writeUInt16BE(writeHeader.magic, offset);
        offset = headerBuffer.writeUInt16BE(writeHeader.version, offset);
        offset = headerBuffer.writeUInt16BE(writeHeader.flags, offset);
        offset = headerBuffer.writeUInt16BE(writeHeader.cmdType, offset);
        offset = headerBuffer.writeUInt32BE(writeHeader.totalLength, offset);
        offset = headerBuffer.writeUInt32BE(writeHeader.bodyLength, offset);

        writer.m_toSendLength = writeHeader.totalLength;
        writer.m_writtenLength = DPackage.headerLength + writeHeader.bodyLength;
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
        let writer = new DPackageStreamWriter();
        for (let buf of this.m_pending) {
            writer.m_pending.push(Buffer.from(buf.buffer, buf.offset, buf.length));
        }
        writer.m_toSendLength = this.m_toSendLength;
        writer.m_writtenLength = 0;
        writer.m_sentLength = 0;
        writer.m_drainListener = null;
        return writer;
    }

    writeData(buffer) {
        if (this.m_writtenLength + buffer.length > this.m_toSendLength) {
            return ;
        }
        this.m_writtenLength += buffer.length;
        this.m_pending.push(buffer);
        this._doSend();
        return this;
    }

    _doSend() {
        if (!this.m_connection) {
            return ;
        }
        if (this.m_drainListener) {
            return ;
        }
        let spliceTo = 0;
        for (; spliceTo < this.m_pending.length; ++spliceTo) {
            let buffer = this.m_pending[spliceTo];
            let sent = this.m_connection.send(buffer);
            this.m_sentLength += sent;
            if (sent < buffer.length) {
                assert(!this.m_drainListener);
                this.m_drainListener = ()=>{
                    this.m_drainListener = null;
                    this._doSend();
                };
                this.m_pending[spliceTo] = Buffer.from(buffer.buffer, buffer.offset+sent, buffer.length - sent);
                this.m_connection.once(bdt.Connection.EVENT.drain, this.m_drainListener);
                break;
            } 
        }
        this.m_pending.splice(0, spliceTo);
        assert(this.m_sentLength <= this.m_toSendLength);
        if (this.m_sentLength === this.m_toSendLength) {
            setImmediate(()=>{this.emit(DPackageStreamWriter.EVENT.finish);});
        }
    }

    close() {
        return;
    }
}

DPackageStreamWriter.EVENT = {
    error: 'error',
    finish: 'finish'
};

class DPackage {
    static createStreamReader(connection) {
        let reader = new DPackageStreamReader();
        reader.start(connection);
        return reader;
    }

    static createStreamWriter(header, body=null, dataLength=0) {
        return DPackageStreamWriter.fromPackage(header, body, dataLength);
    }

    constructor() {
        this.m_header = {};
        this.m_body = {};
        this.m_data = [];
    }

    get header() {
        return this.m_header;
    }

    get body() {
        return this.m_body;
    }

    get data() {
        return this.m_data;
    }

    get dataLength() {
        const header = this.m_header;
        return header.totalLength - DPackage.headerLength - header.bodyLength;
    }
}

DPackage.headerLength = 16;
DPackage.magic = 0x8083;

DPackage.ERROR = {
    success: 0,
    unmatchPackage: 1 
};

DPackage.Reader = DPackageStreamReader;
DPackage.Writer = DPackageStreamWriter;


DPackage.CMD_TYPE = {
    version: 0x01,
    versionAck: 0x02,

    getMetaHeader:0x3,
    metaHeader:0x4,
    getMetaBlock:0x5,
    metaBlock:0x6,
    getHeader: 0x10,
    header: 0x11,
    getBlock: 0x12,
    block: 0x13,
    getTX: 0x14,
    tx: 0x15,
    getUTXO: 0x16,
    utxo: 0x17,
    broadcastBlock: 0x18,

    check: 0x30,
    checkResp: 0x31,
    checkResult: 0x32,

    dbft: 0x50,
    dbftResp: 0x51,

    login:0x70,
    loginResp:0x71,
    proof:0x72,
    proofResp:0x73,

    register:0x80,
    registerResp:0x81,
}

module.exports = DPackage;