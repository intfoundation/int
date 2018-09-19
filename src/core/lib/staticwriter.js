/*!
 * staticwriter.js - buffer writer for bcoin
 * Copyright (c) 2014-2017, Christopher Jeffrey (MIT License).
 * https://github.com/bcoin-org/bcoin
 */
'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require("assert");
const encoding_1 = require("./encoding");
const digest = require("./digest");
const EMPTY = Buffer.alloc(0);
const POOLSIZE = 100 << 10;
let POOL = null;
/**
 * Statically allocated buffer writer.
 * @alias module:utils.StaticWriter
 * @constructor
 * @param {Number} size
 */
class StaticWriter {
    constructor(size) {
        if (!(this instanceof StaticWriter))
            return new StaticWriter(size);
        this.data = size ? Buffer.allocUnsafe(size) : EMPTY;
        this.offset = 0;
    }
    /**
     * Allocate writer from preallocated 100kb pool.
     * @param {Number} size
     * @returns {StaticWriter}
     */
    static pool(size) {
        if (size <= POOLSIZE) {
            if (!POOL)
                POOL = Buffer.allocUnsafeSlow(POOLSIZE);
            const bw = new StaticWriter(0);
            bw.data = POOL.slice(0, size);
            return bw;
        }
        return new StaticWriter(size);
    }
    ;
    /**
     * Allocate and render the final buffer.
     * @returns {Buffer} Rendered buffer.
     */
    render() {
        const data = this.data;
        assert(this.offset === data.length);
        this.destroy();
        return data;
    }
    ;
    /**
     * Get size of data written so far.
     * @returns {Number}
     */
    getSize() {
        return this.offset;
    }
    ;
    /**
     * Seek to relative offset.
     * @param {Number} offset
     */
    seek(offset) {
        this.offset += offset;
    }
    ;
    /**
     * Destroy the buffer writer.
     */
    destroy() {
        this.data = EMPTY;
        this.offset = 0;
    }
    ;
    /**
     * Write uint8.
     * @param {Number} value
     */
    writeU8(value) {
        this.offset = this.data.writeUInt8(value, this.offset, true);
    }
    ;
    /**
     * Write uint16le.
     * @param {Number} value
     */
    writeU16(value) {
        this.offset = this.data.writeUInt16LE(value, this.offset, true);
    }
    ;
    /**
     * Write uint16be.
     * @param {Number} value
     */
    writeU16BE(value) {
        this.offset = this.data.writeUInt16BE(value, this.offset, true);
    }
    ;
    /**
     * Write uint32le.
     * @param {Number} value
     */
    writeU32(value) {
        this.offset = this.data.writeUInt32LE(value, this.offset, true);
    }
    ;
    /**
     * Write uint32be.
     * @param {Number} value
     */
    writeU32BE(value) {
        this.offset = this.data.writeUInt32BE(value, this.offset, true);
    }
    ;
    /**
     * Write uint64le.
     * @param {Number} value
     */
    writeU64(value) {
        this.offset = encoding_1.Encoding.writeU64(this.data, value, this.offset);
    }
    ;
    /**
     * Write uint64be.
     * @param {Number} value
     */
    writeU64BE(value) {
        this.offset = encoding_1.Encoding.writeU64BE(this.data, value, this.offset);
    }
    ;
    /**
     * Write int8.
     * @param {Number} value
     */
    writeI8(value) {
        this.offset = this.data.writeInt8(value, this.offset, true);
    }
    ;
    /**
     * Write int16le.
     * @param {Number} value
     */
    writeI16(value) {
        this.offset = this.data.writeInt16LE(value, this.offset, true);
    }
    ;
    /**
     * Write int16be.
     * @param {Number} value
     */
    writeI16BE(value) {
        this.offset = this.data.writeInt16BE(value, this.offset, true);
    }
    ;
    /**
     * Write int32le.
     * @param {Number} value
     */
    writeI32(value) {
        this.offset = this.data.writeInt32LE(value, this.offset, true);
    }
    ;
    /**
     * Write int32be.
     * @param {Number} value
     */
    writeI32BE(value) {
        this.offset = this.data.writeInt32BE(value, this.offset, true);
    }
    ;
    /**
     * Write int64le.
     * @param {Number} value
     */
    writeI64(value) {
        this.offset = encoding_1.Encoding.writeI64(this.data, value, this.offset);
    }
    ;
    /**
     * Write int64be.
     * @param {Number} value
     */
    writeI64BE(value) {
        this.offset = encoding_1.Encoding.writeI64BE(this.data, value, this.offset);
    }
    ;
    /**
     * Write float le.
     * @param {Number} value
     */
    writeFloat(value) {
        this.offset = this.data.writeFloatLE(value, this.offset, true);
    }
    ;
    /**
     * Write float be.
     * @param {Number} value
     */
    writeFloatBE(value) {
        this.offset = this.data.writeFloatBE(value, this.offset, true);
    }
    ;
    /**
     * Write double le.
     * @param {Number} value
     */
    writeDouble(value) {
        this.offset = this.data.writeDoubleLE(value, this.offset, true);
    }
    ;
    /**
     * Write double be.
     * @param {Number} value
     */
    writeDoubleBE(value) {
        this.offset = this.data.writeDoubleBE(value, this.offset, true);
    }
    ;
    /**
     * Write a varint.
     * @param {Number} value
     */
    writeVarint(value) {
        this.offset = encoding_1.Encoding.writeVarint(this.data, value, this.offset);
    }
    ;
    /**
     * Write a varint (type 2).
     * @param {Number} value
     */
    writeVarint2(value) {
        this.offset = encoding_1.Encoding.writeVarint2(this.data, value, this.offset);
    }
    ;
    /**
     * Write bytes.
     * @param {Buffer} value
     */
    writeBytes(value) {
        if (value.length === 0)
            return;
        value.copy(this.data, this.offset);
        this.offset += value.length;
    }
    ;
    /**
     * Write bytes with a varint length before them.
     * @param {Buffer} value
     */
    writeVarBytes(value) {
        this.writeVarint(value.length);
        this.writeBytes(value);
    }
    ;
    /**
     * Copy bytes.
     * @param {Buffer} value
     * @param {Number} start
     * @param {Number} end
     */
    copy(value, start, end) {
        const len = end - start;
        if (len === 0)
            return;
        value.copy(this.data, this.offset, start, end);
        this.offset += len;
    }
    ;
    /**
     * Write string to buffer.
     * @param {String} value
     * @param {String?} enc - Any buffer-supported encoding.
     */
    writeString(value, enc) {
        if (value.length === 0)
            return;
        const size = Buffer.byteLength(value, enc);
        this.data.write(value, this.offset, undefined, enc);
        this.offset += size;
    }
    ;
    /**
     * Write a 32 byte hash.
     * @param {Hash} value
     */
    writeHash(value) {
        if (typeof value !== 'string') {
            assert(value.length === 32);
            this.writeBytes(value);
            return;
        }
        assert(value.length === 64);
        this.data.write(value, this.offset, undefined, 'hex');
        this.offset += 32;
    }
    ;
    /**
     * Write a string with a varint length before it.
     * @param {String}
     * @param {String?} enc - Any buffer-supported encoding.
     */
    writeVarString(value, enc) {
        if (value.length === 0) {
            this.writeVarint(0);
            return;
        }
        const size = Buffer.byteLength(value, enc);
        this.writeVarint(size);
        this.data.write(value, this.offset, undefined, enc);
        this.offset += size;
    }
    ;
    /**
     * Write a null-terminated string.
     * @param {String|Buffer}
     * @param {String?} enc - Any buffer-supported encoding.
     */
    writeNullString(value, enc) {
        this.writeString(value, enc);
        this.writeU8(0);
    }
    ;
    /**
     * Calculate and write a checksum for the data written so far.
     */
    writeChecksum() {
        const data = this.data.slice(0, this.offset);
        const hash = digest.hash256(data);
        hash.copy(this.data, this.offset, 0, 4);
        this.offset += 4;
    }
    ;
    /**
     * Fill N bytes with value.
     * @param {Number} value
     * @param {Number} size
     */
    fill(value, size) {
        assert(size >= 0);
        if (size === 0)
            return;
        this.data.fill(value, this.offset, this.offset + size);
        this.offset += size;
    }
    ;
}
exports.StaticWriter = StaticWriter;
