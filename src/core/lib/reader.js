/*!
 * reader.js - buffer reader for bcoin
 * Copyright (c) 2014-2015, Fedor Indutny (MIT License)
 * Copyright (c) 2014-2017, Christopher Jeffrey (MIT License).
 * https://github.com/bcoin-org/bcoin
 */
'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require("assert");
const encoding_1 = require("./encoding");
const digest = require("./digest");
const bignumber_js_1 = require("bignumber.js");
const EMPTY = Buffer.alloc(0);
/**
 * An object that allows reading of buffers in a sane manner.
 * @alias module:utils.BufferReader
 * @constructor
 * @param {Buffer} data
 * @param {Boolean?} zeroCopy - Do not reallocate buffers when
 * slicing. Note that this can lead to memory leaks if not used
 * carefully.
 */
class BufferReader {
    constructor(data, zeroCopy) {
        if (!(this instanceof BufferReader)) {
            return new BufferReader(data, zeroCopy);
        }
        assert(Buffer.isBuffer(data), 'Must pass a Buffer.');
        this.data = data;
        this.offset = 0;
        this.zeroCopy = zeroCopy || false;
        this.stack = [];
    }
    /**
     * Assertion.
     * @param {Boolean} value
     */
    assert(value) {
        if (!value) {
            throw new encoding_1.EncodingError(this.offset, 'Out of bounds read', assert);
        }
    }
    /**
     * Assertion.
     * @param {Boolean} value
     * @param {String} reason
     */
    enforce(value, reason) {
        if (!value) {
            throw new encoding_1.EncodingError(this.offset, reason);
        }
    }
    /**
     * Get total size of passed-in Buffer.
     * @returns {Buffer}
     */
    getSize() {
        return this.data.length;
    }
    /**
     * Calculate number of bytes left to read.
     * @returns {Number}
     */
    left() {
        this.assert(this.offset <= this.data.length);
        return this.data.length - this.offset;
    }
    /**
     * Seek to a position to read from by offset.
     * @param {Number} off - Offset (positive or negative).
     */
    seek(off) {
        this.assert(this.offset + off >= 0);
        this.assert(this.offset + off <= this.data.length);
        this.offset += off;
        return off;
    }
    /**
     * Mark the current starting position.
     */
    start() {
        this.stack.push(this.offset);
        return this.offset;
    }
    /**
     * Stop reading. Pop the start position off the stack
     * and calculate the size of the data read.
     * @returns {Number} Size.
     * @throws on empty stack.
     */
    end() {
        assert(this.stack.length > 0);
        const start = this.stack.pop();
        return this.offset - start;
    }
    /**
     * Stop reading. Pop the start position off the stack
     * and return the data read.
     * @param {Bolean?} zeroCopy - Do a fast buffer
     * slice instead of allocating a new buffer (warning:
     * may cause memory leaks if not used with care).
     * @returns {Buffer} Data read.
     * @throws on empty stack.
     */
    endData(zeroCopy) {
        assert(this.stack.length > 0);
        const start = this.stack.pop();
        const end = this.offset;
        const size = end - start;
        const data = this.data;
        if (size === data.length) {
            return data;
        }
        if (this.zeroCopy || zeroCopy) {
            return data.slice(start, end);
        }
        const ret = Buffer.allocUnsafe(size);
        data.copy(ret, 0, start, end);
        return ret;
    }
    /**
     * Destroy the reader. Remove references to the data.
     */
    destroy() {
        this.data = EMPTY;
        this.offset = 0;
        this.stack.length = 0;
    }
    /**
     * Read uint8.
     * @returns {Number}
     */
    readU8() {
        this.assert(this.offset + 1 <= this.data.length);
        const ret = this.data[this.offset];
        this.offset += 1;
        return ret;
    }
    /**
     * Read uint16le.
     * @returns {Number}
     */
    readU16() {
        this.assert(this.offset + 2 <= this.data.length);
        const ret = this.data.readUInt16LE(this.offset, true);
        this.offset += 2;
        return ret;
    }
    /**
     * Read uint16be.
     * @returns {Number}
     */
    readU16BE() {
        this.assert(this.offset + 2 <= this.data.length);
        const ret = this.data.readUInt16BE(this.offset, true);
        this.offset += 2;
        return ret;
    }
    /**
     * Read uint32le.
     * @returns {Number}
     */
    readU32() {
        this.assert(this.offset + 4 <= this.data.length);
        const ret = this.data.readUInt32LE(this.offset, true);
        this.offset += 4;
        return ret;
    }
    /**
     * Read uint32be.
     * @returns {Number}
     */
    readU32BE() {
        this.assert(this.offset + 4 <= this.data.length);
        const ret = this.data.readUInt32BE(this.offset, true);
        this.offset += 4;
        return ret;
    }
    /**
     * Read uint64le as a js number.
     * @returns {Number}
     * @throws on num > MAX_SAFE_INTEGER
     */
    readU64() {
        this.assert(this.offset + 8 <= this.data.length);
        const ret = encoding_1.Encoding.readU64(this.data, this.offset);
        this.offset += 8;
        return ret;
    }
    /**
     * Read uint64be as a js number.
     * @returns {Number}
     * @throws on num > MAX_SAFE_INTEGER
     */
    readU64BE() {
        this.assert(this.offset + 8 <= this.data.length);
        const ret = encoding_1.Encoding.readU64BE(this.data, this.offset);
        this.offset += 8;
        return ret;
    }
    /**
     * Read int8.
     * @returns {Number}
     */
    readI8() {
        this.assert(this.offset + 1 <= this.data.length);
        const ret = this.data.readInt8(this.offset, true);
        this.offset += 1;
        return ret;
    }
    /**
     * Read int16le.
     * @returns {Number}
     */
    readI16() {
        this.assert(this.offset + 2 <= this.data.length);
        const ret = this.data.readInt16LE(this.offset, true);
        this.offset += 2;
        return ret;
    }
    /**
     * Read int16be.
     * @returns {Number}
     */
    readI16BE() {
        this.assert(this.offset + 2 <= this.data.length);
        const ret = this.data.readInt16BE(this.offset, true);
        this.offset += 2;
        return ret;
    }
    /**
     * Read int32le.
     * @returns {Number}
     */
    readI32() {
        this.assert(this.offset + 4 <= this.data.length);
        const ret = this.data.readInt32LE(this.offset, true);
        this.offset += 4;
        return ret;
    }
    /**
     * Read int32be.
     * @returns {Number}
     */
    readI32BE() {
        this.assert(this.offset + 4 <= this.data.length);
        const ret = this.data.readInt32BE(this.offset, true);
        this.offset += 4;
        return ret;
    }
    /**
     * Read int64le as a js number.
     * @returns {Number}
     * @throws on num > MAX_SAFE_INTEGER
     */
    readI64() {
        this.assert(this.offset + 8 <= this.data.length);
        const ret = encoding_1.Encoding.readI64(this.data, this.offset);
        this.offset += 8;
        return ret;
    }
    /**
     * Read int64be as a js number.
     * @returns {Number}
     * @throws on num > MAX_SAFE_INTEGER
     */
    readI64BE() {
        this.assert(this.offset + 8 <= this.data.length);
        const ret = encoding_1.Encoding.readI64BE(this.data, this.offset);
        this.offset += 8;
        return ret;
    }
    /**
     * Read float le.
     * @returns {Number}
     */
    readFloat() {
        this.assert(this.offset + 4 <= this.data.length);
        const ret = this.data.readFloatLE(this.offset, true);
        this.offset += 4;
        return ret;
    }
    /**
     * Read float be.
     * @returns {Number}
     */
    readFloatBE() {
        this.assert(this.offset + 4 <= this.data.length);
        const ret = this.data.readFloatBE(this.offset, true);
        this.offset += 4;
        return ret;
    }
    /**
     * Read double float le.
     * @returns {Number}
     */
    readDouble() {
        this.assert(this.offset + 8 <= this.data.length);
        const ret = this.data.readDoubleLE(this.offset, true);
        this.offset += 8;
        return ret;
    }
    /**
     * Read double float be.
     * @returns {Number}
     */
    readDoubleBE() {
        this.assert(this.offset + 8 <= this.data.length);
        const ret = this.data.readDoubleBE(this.offset, true);
        this.offset += 8;
        return ret;
    }
    /**
     * Read a varint.
     * @returns {Number}
     */
    readVarint() {
        const { size, value } = encoding_1.Encoding.readVarint(this.data, this.offset);
        this.offset += size;
        return value;
    }
    /**
     * Read a varint (type 2).
     * @returns {Number}
     */
    readVarint2() {
        const { size, value } = encoding_1.Encoding.readVarint2(this.data, this.offset);
        this.offset += size;
        return value;
    }
    /**
     * Read N bytes (will do a fast slice if zero copy).
     * @param {Number} size
     * @param {Bolean?} zeroCopy - Do a fast buffer
     * slice instead of allocating a new buffer (warning:
     * may cause memory leaks if not used with care).
     * @returns {Buffer}
     */
    readBytes(size, zeroCopy) {
        assert(size >= 0);
        this.assert(this.offset + size <= this.data.length);
        let ret;
        if (this.zeroCopy || zeroCopy) {
            ret = this.data.slice(this.offset, this.offset + size);
        }
        else {
            ret = Buffer.allocUnsafe(size);
            this.data.copy(ret, 0, this.offset, this.offset + size);
        }
        this.offset += size;
        return ret;
    }
    /**
     * Read a varint number of bytes (will do a fast slice if zero copy).
     * @param {Bolean?} zeroCopy - Do a fast buffer
     * slice instead of allocating a new buffer (warning:
     * may cause memory leaks if not used with care).
     * @returns {Buffer}
     */
    readVarBytes(zeroCopy) {
        return this.readBytes(this.readVarint(), zeroCopy);
    }
    /**
     * Read a string.
     * @param {String} enc - Any buffer-supported Encoding.
     * @param {Number} size
     * @returns {String}
     */
    readString(enc, size) {
        assert(size >= 0);
        this.assert(this.offset + size <= this.data.length);
        const ret = this.data.toString(enc, this.offset, this.offset + size);
        this.offset += size;
        return ret;
    }
    readHash(enc) {
        if (enc) {
            return this.readString(enc, 32);
        }
        return this.readBytes(32);
    }
    /**
     * Read string of a varint length.
     * @param {String} enc - Any buffer-supported Encoding.
     * @param {Number?} limit - Size limit.
     * @returns {String}
     */
    readVarString(enc, limit) {
        const size = this.readVarint();
        this.enforce(!limit || size <= limit, 'String exceeds limit.');
        return this.readString(enc, size);
    }
    readBigNumber() {
        let str = this.readVarString();
        return new bignumber_js_1.BigNumber(str);
    }
    /**
     * Read a null-terminated string.
     * @param {String} enc - Any buffer-supported Encoding.
     * @returns {String}
     */
    readNullString(enc) {
        this.assert(this.offset + 1 <= this.data.length);
        let i = this.offset;
        for (; i < this.data.length; i++) {
            if (this.data[i] === 0) {
                break;
            }
        }
        this.assert(i !== this.data.length);
        const ret = this.readString(enc, i - this.offset);
        this.offset = i + 1;
        return ret;
    }
    /**
     * Create a checksum from the last start position.
     * @returns {Number} Checksum.
     */
    createChecksum() {
        let start = 0;
        if (this.stack.length > 0) {
            start = this.stack[this.stack.length - 1];
        }
        const data = this.data.slice(start, this.offset);
        return digest.hash256(data).readUInt32LE(0, true);
    }
    /**
     * Verify a 4-byte checksum against a calculated checksum.
     * @returns {Number} checksum
     * @throws on bad checksum
     */
    verifyChecksum() {
        const chk = this.createChecksum();
        const checksum = this.readU32();
        this.enforce(chk === checksum, 'Checksum mismatch.');
        return checksum;
    }
}
exports.BufferReader = BufferReader;
