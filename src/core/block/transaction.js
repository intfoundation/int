"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const serializable_1 = require("../serializable");
const encoding_1 = require("../lib/encoding");
const Address = require("../address");
class Transaction extends serializable_1.SerializableWithHash {
    constructor() {
        super();
        this.m_publicKey = encoding_1.Encoding.ZERO_KEY;
        this.m_signature = encoding_1.Encoding.ZERO_SIG64;
        this.m_method = '';
        this.m_nonce = -1;
    }
    get address() {
        return Address.addressFromPublicKey(this.m_publicKey);
    }
    get method() {
        return this.m_method;
    }
    set method(s) {
        this.m_method = s;
    }
    get nonce() {
        return this.m_nonce;
    }
    set nonce(n) {
        this.m_nonce = n;
    }
    get input() {
        const input = this.m_input;
        return input;
    }
    set input(i) {
        this.m_input = i;
    }
    /**
     *  virtual验证交易的签名段
     */
    verifySignature() {
        if (!this.m_publicKey) {
            return false;
        }
        return Address.verify(this.m_hash, this.m_signature, this.m_publicKey);
    }
    sign(privateKey) {
        let pubkey = Address.publicKeyFromSecretKey(privateKey);
        this.m_publicKey = pubkey;
        this.updateHash();
        this.m_signature = Address.sign(this.m_hash, privateKey);
    }
    _encodeHashContent(writer) {
        try {
            writer.writeVarString(this.m_method);
            writer.writeU32(this.m_nonce);
            writer.writeBytes(this.m_publicKey);
            this._encodeInput(writer);
        }
        catch (e) {
            return serializable_1.ErrorCode.RESULT_INVALID_FORMAT;
        }
        return serializable_1.ErrorCode.RESULT_OK;
    }
    encode(writer) {
        let err = super.encode(writer);
        if (err) {
            return err;
        }
        try {
            writer.writeBytes(this.m_signature);
        }
        catch (e) {
            return serializable_1.ErrorCode.RESULT_INVALID_FORMAT;
        }
        return serializable_1.ErrorCode.RESULT_OK;
    }
    _decodeHashContent(reader) {
        try {
            this.m_method = reader.readVarString();
            this.m_nonce = reader.readU32();
            this.m_publicKey = reader.readBytes(33, false);
            this._decodeInput(reader);
        }
        catch (e) {
            return serializable_1.ErrorCode.RESULT_INVALID_FORMAT;
        }
        return serializable_1.ErrorCode.RESULT_OK;
    }
    decode(reader) {
        let err = super.decode(reader);
        if (err) {
            return err;
        }
        try {
            this.m_signature = reader.readBytes(64, false);
        }
        catch (e) {
            return serializable_1.ErrorCode.RESULT_INVALID_FORMAT;
        }
        return serializable_1.ErrorCode.RESULT_OK;
    }
    _encodeInput(writer) {
        let input;
        if (this.m_input) {
            input = JSON.stringify(serializable_1.toStringifiable(this.m_input, true));
        }
        else {
            input = JSON.stringify({});
        }
        writer.writeVarString(input);
        return writer;
    }
    _decodeInput(reader) {
        this.m_input = serializable_1.fromStringifiable(JSON.parse(reader.readVarString()));
        return serializable_1.ErrorCode.RESULT_OK;
    }
    stringify() {
        let obj = super.stringify();
        obj.method = this.method;
        obj.input = this.input;
        obj.nonce = this.nonce;
        obj.caller = this.address;
        return obj;
    }
}
exports.Transaction = Transaction;
class EventLog {
    constructor() {
        this.m_event = '';
    }
    set name(n) {
        this.m_event = n;
    }
    get name() {
        return this.m_event;
    }
    set param(p) {
        this.m_params = p;
    }
    get param() {
        const param = this.m_params;
        return param;
    }
    encode(writer) {
        let input;
        try {
            if (this.m_params) {
                input = JSON.stringify(serializable_1.toStringifiable(this.m_params, true));
            }
            else {
                input = JSON.stringify({});
            }
            writer.writeVarString(input);
        }
        catch (e) {
            return serializable_1.ErrorCode.RESULT_INVALID_FORMAT;
        }
        return serializable_1.ErrorCode.RESULT_OK;
    }
    decode(reader) {
        try {
            this.m_params = serializable_1.fromStringifiable(JSON.parse(reader.readVarString()));
        }
        catch (e) {
            return serializable_1.ErrorCode.RESULT_INVALID_FORMAT;
        }
        return serializable_1.ErrorCode.RESULT_OK;
    }
    stringify() {
        let obj = Object.create(null);
        obj.name = this.name;
        obj.param = this.param;
        return obj;
    }
}
exports.EventLog = EventLog;
class Receipt {
    constructor() {
        this.m_transactionHash = '';
        this.m_returnCode = 0;
        this.m_eventLogs = new Array();
    }
    set transactionHash(s) {
        this.m_transactionHash = s;
    }
    get transactionHash() {
        return this.m_transactionHash;
    }
    set returnCode(n) {
        this.m_returnCode = n;
    }
    get returnCode() {
        return this.m_returnCode;
    }
    set eventLogs(logs) {
        this.m_eventLogs = logs;
    }
    get eventLogs() {
        const l = this.m_eventLogs;
        return l;
    }
    encode(writer) {
        try {
            writer.writeVarString(this.m_transactionHash);
            writer.writeI32(this.m_returnCode);
            writer.writeU16(this.m_eventLogs.length);
        }
        catch (e) {
            return serializable_1.ErrorCode.RESULT_INVALID_FORMAT;
        }
        for (let log of this.m_eventLogs) {
            let err = log.encode(writer);
            if (err) {
                return err;
            }
        }
        return serializable_1.ErrorCode.RESULT_OK;
    }
    decode(reader) {
        this.m_transactionHash = reader.readVarString();
        this.m_returnCode = reader.readI32();
        let nCount = reader.readU16();
        for (let i = 0; i < nCount; i++) {
            let log = new EventLog();
            let err = log.decode(reader);
            if (err) {
                return err;
            }
            this.m_eventLogs.push(log);
        }
        return serializable_1.ErrorCode.RESULT_OK;
    }
    stringify() {
        let obj = Object.create(null);
        obj.transactionHash = this.m_transactionHash;
        obj.returnCode = this.m_returnCode;
        obj.logs = [];
        for (let l of this.eventLogs) {
            obj.logs.push(l.stringify());
        }
        return obj;
    }
}
exports.Receipt = Receipt;
