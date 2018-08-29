"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const writer_1 = require("./lib/writer");
var writer_2 = require("./lib/writer");
exports.BufferWriter = writer_2.BufferWriter;
var reader_1 = require("./lib/reader");
exports.BufferReader = reader_1.BufferReader;
const error_code_1 = require("./error_code");
var error_code_2 = require("./error_code");
exports.ErrorCode = error_code_2.ErrorCode;
const encoding_1 = require("./lib/encoding");
const digest = require("./lib/digest");
const bignumber_js_1 = require("bignumber.js");
const util_1 = require("util");
function toStringifiable(o, parsable = false) {
    if (util_1.isUndefined(o) || util_1.isNull(o)) {
        return o;
    }
    else if (util_1.isNumber(o) || util_1.isBoolean(o)) {
        return o;
    }
    else if (util_1.isString(o)) {
        return parsable ? 's' + o : o;
    }
    else if (o instanceof bignumber_js_1.BigNumber) {
        return parsable ? 'n' + o.toString() : o.toString();
    }
    else if (util_1.isBuffer(o)) {
        return parsable ? 'b' + o.toString('hex') : o.toString('hex');
    }
    else if (util_1.isArray(o) || o instanceof Array) {
        let s = [];
        for (let e of o) {
            s.push(toStringifiable(e, parsable));
        }
        return s;
    }
    else if (util_1.isObject(o)) {
        let s = Object.create(null);
        for (let k of Object.keys(o)) {
            s[k] = toStringifiable(o[k], parsable);
        }
        return s;
    }
    else if (o instanceof Map) {
        let s = Object.create(null);
        for (let k of o.keys()) {
            s[k] = toStringifiable(o.get(k), parsable);
        }
        return s;
    }
    else {
        throw new Error('not JSONable');
    }
}
exports.toStringifiable = toStringifiable;
function fromStringifiable(o) {
    // let value = JSON.parse(o);
    function __convertValue(v) {
        if (util_1.isString(v)) {
            if (v.charAt(0) === 's') {
                return v.substring(1);
            }
            else if (v.charAt(0) === 'b') {
                return Buffer.from(v.substring(1), 'hex');
            }
            else if (v.charAt(0) === 'n') {
                return new bignumber_js_1.BigNumber(v.substring(1));
            }
            else {
                throw new Error(`invalid parsable value ${v}`);
            }
        }
        else if (util_1.isArray(v) || v instanceof Array) {
            for (let i = 0; i < v.length; ++i) {
                v[i] = __convertValue(v[i]);
            }
            return v;
        }
        else if (util_1.isObject(v)) {
            for (let k of Object.keys(v)) {
                v[k] = __convertValue(v[k]);
            }
            return v;
        }
        else {
            return v;
        }
    }
    return __convertValue(o);
}
exports.fromStringifiable = fromStringifiable;
class SerializableWithHash {
    constructor() {
        this.m_hash = encoding_1.Encoding.NULL_HASH;
    }
    get hash() {
        return this.m_hash;
    }
    _encodeHashContent(writer) {
        return error_code_1.ErrorCode.RESULT_OK;
    }
    _decodeHashContent(reader) {
        return error_code_1.ErrorCode.RESULT_OK;
    }
    encode(writer) {
        // writer.writeHash(this.hash);
        return this._encodeHashContent(writer);
    }
    decode(reader) {
        // this.m_hash = reader.readHash('hex');
        let err = this._decodeHashContent(reader);
        this.updateHash();
        return err;
    }
    updateHash() {
        this.m_hash = this._genHash();
    }
    _genHash() {
        let contentWriter = new writer_1.BufferWriter();
        this._encodeHashContent(contentWriter);
        let content = contentWriter.render();
        return digest.hash256(content).toString('hex');
    }
    _verifyHash() {
        return this.hash === this._genHash();
    }
    stringify() {
        return { hash: this.hash };
    }
}
exports.SerializableWithHash = SerializableWithHash;
