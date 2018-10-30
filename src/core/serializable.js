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
function MapToObject(input) {
    if (!(input instanceof Map)) {
        throw new Error('input MUST be a Map');
    }
    let ret = {};
    for (const [k, v] of input) {
        if (!util_1.isString(k)) {
            throw new Error('input Map`s key MUST be string');
        }
        ret[k] = v;
    }
    return ret;
}
exports.MapToObject = MapToObject;
function SetToArray(input) {
    if (!(input instanceof Set)) {
        throw new Error('input MUST be a Set');
    }
    let ret = new Array();
    for (const item of input) {
        ret.push(item);
    }
    return ret;
}
exports.SetToArray = SetToArray;
function SetFromObject(input) {
    if (!util_1.isObject(input)) {
        throw new Error('input MUST be a Object');
    }
    let ret = new Set();
    do {
        const item = input.shift();
        ret.add(item);
    } while (input.length > 0);
    return ret;
}
exports.SetFromObject = SetFromObject;
function MapFromObject(input) {
    if (!util_1.isObject(input)) {
        throw new Error('input MUST be a Object');
    }
    let ret = new Map();
    for (const k of Object.keys(input)) {
        ret.set(k, input[k]);
    }
    return ret;
}
exports.MapFromObject = MapFromObject;
function deepCopy(o) {
    if (util_1.isUndefined(o) || util_1.isNull(o)) {
        return o;
    }
    else if (util_1.isNumber(o) || util_1.isBoolean(o)) {
        return o;
    }
    else if (util_1.isString(o)) {
        return o;
    }
    else if (o instanceof bignumber_js_1.BigNumber) {
        return new bignumber_js_1.BigNumber(o);
    }
    else if (util_1.isBuffer(o)) {
        return Buffer.from(o);
    }
    else if (util_1.isArray(o) || o instanceof Array) {
        let s = [];
        for (let e of o) {
            s.push(deepCopy(e));
        }
        return s;
    }
    else if (o instanceof Map) {
        let s = new Map();
        for (let k of o.keys()) {
            s.set(k, deepCopy(o.get(k)));
        }
        return s;
    }
    else if (util_1.isObject(o)) {
        let s = Object.create(null);
        for (let k of Object.keys(o)) {
            s[k] = deepCopy(o[k]);
        }
        return s;
    }
    else {
        throw new Error('not JSONable');
    }
}
exports.deepCopy = deepCopy;
function toEvalText(o) {
    if (util_1.isUndefined(o) || util_1.isNull(o)) {
        return JSON.stringify(o);
    }
    else if (util_1.isNumber(o) || util_1.isBoolean(o)) {
        return JSON.stringify(o);
    }
    else if (util_1.isString(o)) {
        return JSON.stringify(o);
    }
    else if (o instanceof bignumber_js_1.BigNumber) {
        return `new BigNumber('${o.toString()}')`;
    }
    else if (util_1.isBuffer(o)) {
        return `Buffer.from('${o.toString('hex')}', 'hex')`;
    }
    else if (util_1.isArray(o) || o instanceof Array) {
        let s = [];
        for (let e of o) {
            s.push(toEvalText(e));
        }
        return `[${s.join(',')}]`;
    }
    else if (o instanceof Map) {
        throw new Error(`use MapToObject before toStringifiable`);
    }
    else if (o instanceof Set) {
        throw new Error(`use SetToArray before toStringifiable`);
    }
    else if (util_1.isObject(o)) {
        let s = [];
        for (let k of Object.keys(o)) {
            s.push(`'${k}':${toEvalText(o[k])}`);
        }
        return `{${s.join(',')}}`;
    }
    else {
        throw new Error('not JSONable');
    }
}
exports.toEvalText = toEvalText;
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
    else if (o instanceof Map) {
        throw new Error(`use MapToObject before toStringifiable`);
    }
    else if (o instanceof Set) {
        throw new Error(`use SetToArray before toStringifiable`);
    }
    else if (util_1.isObject(o)) {
        let s = Object.create(null);
        for (let k of Object.keys(o)) {
            s[k] = toStringifiable(o[k], parsable);
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
