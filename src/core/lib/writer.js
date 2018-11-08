/*!
 * writer.js - buffer writer for bcoin
 * Copyright (c) 2014-2015, Fedor Indutny (MIT License)
 * Copyright (c) 2014-2017, Christopher Jeffrey (MIT License).
 * https://github.com/bcoin-org/bcoin
 */
'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require("assert");
const encoding_1 = require("./encoding");
const digest = require("./digest");
/*
 * Constants
 */
const SEEK = 0;
const UI8 = 1;
const UI16 = 2;
const UI16BE = 3;
const UI32 = 4;
const UI32BE = 5;
const UI64 = 6;
const UI64BE = 7;
const I8 = 10;
const I16 = 11;
const I16BE = 12;
const I32 = 13;
const I32BE = 14;
const I64 = 15;
const I64BE = 16;
const FL = 19;
const FLBE = 20;
const DBL = 21;
const DBLBE = 22;
const VARINT = 23;
const VARINT2 = 25;
const BYTES = 27;
const STR = 28;
const CHECKSUM = 29;
const FILL = 30;
/**
 * An object that allows writing of buffers in a
 * sane manner. This buffer writer is extremely
 * optimized since it does not actually write
 * anything until `render` is called. It makes
 * one allocation: at the end, once it knows the
 * size of the buffer to be allocated. Because
 * of this, it can also act as a size calculator
 * which is useful for guaging block size
 * without actually serializing any data.
 * @alias module:utils.BufferWriter
 * @constructor
 */
class BufferWriter {
    constructor() {
        if (!(this instanceof BufferWriter)) {
            return new BufferWriter();
        }
        this.ops = [];
        this.offset = 0;
    }
    /**
     * Allocate and render the final buffer.
     * @returns {Buffer} Rendered buffer.
     */
    render() {
        const data = Buffer.allocUnsafe(this.offset);
        let off = 0;
        for (const op of this.ops) {
            switch (op.type) {
                case SEEK:
                    off += op.value;
                    break;
                case UI8:
                    off = data.writeUInt8(op.value, off, true);
                    break;
                case UI16:
                    off = data.writeUInt16LE(op.value, off, true);
                    break;
                case UI16BE:
                    off = data.writeUInt16BE(op.value, off, true);
                    break;
                case UI32:
                    off = data.writeUInt32LE(op.value, off, true);
                    break;
                case UI32BE:
                    off = data.writeUInt32BE(op.value, off, true);
                    break;
                case UI64:
                    off = encoding_1.Encoding.writeU64(data, op.value, off);
                    break;
                case UI64BE:
                    off = encoding_1.Encoding.writeU64BE(data, op.value, off);
                    break;
                case I8:
                    off = data.writeInt8(op.value, off, true);
                    break;
                case I16:
                    off = data.writeInt16LE(op.value, off, true);
                    break;
                case I16BE:
                    off = data.writeInt16BE(op.value, off, true);
                    break;
                case I32:
                    off = data.writeInt32LE(op.value, off, true);
                    break;
                case I32BE:
                    off = data.writeInt32BE(op.value, off, true);
                    break;
                case I64:
                    off = encoding_1.Encoding.writeI64(data, op.value, off);
                    break;
                case I64BE:
                    off = encoding_1.Encoding.writeI64BE(data, op.value, off);
                    break;
                case FL:
                    off = data.writeFloatLE(op.value, off, true);
                    break;
                case FLBE:
                    off = data.writeFloatBE(op.value, off, true);
                    break;
                case DBL:
                    off = data.writeDoubleLE(op.value, off, true);
                    break;
                case DBLBE:
                    off = data.writeDoubleBE(op.value, off, true);
                    break;
                case VARINT:
                    off = encoding_1.Encoding.writeVarint(data, op.value, off);
                    break;
                case VARINT2:
                    off = encoding_1.Encoding.writeVarint2(data, op.value, off);
                    break;
                case BYTES:
                    off += op.value.copy(data, off);
                    break;
                case STR:
                    off += data.write(op.value, off, op.enc);
                    break;
                case CHECKSUM:
                    off += digest.hash256(data.slice(0, off)).copy(data, off, 0, 4);
                    break;
                case FILL:
                    data.fill(op.value, off, off + op.size);
                    off += op.size;
                    break;
                default:
                    assert(false, 'Bad type.');
                    break;
            }
        }
        assert(off === data.length);
        this.destroy();
        return data;
    }
    /**
     * Get size of data written so far.
     * @returns {Number}
     */
    getSize() {
        return this.offset;
    }
    /**
     * Seek to relative offset.
     * @param {Number} offset
     */
    seek(offset) {
        this.offset += offset;
        this.ops.push(new WriteOp(SEEK, offset));
    }
    /**
     * Destroy the buffer writer. Remove references to `ops`.
     */
    destroy() {
        this.ops.length = 0;
        this.offset = 0;
    }
    /**
     * Write uint8.
     * @param {Number} value
     */
    writeU8(value) {
        this.offset += 1;
        this.ops.push(new WriteOp(UI8, value));
    }
    /**
     * Write uint16le.
     * @param {Number} value
     */
    writeU16(value) {
        this.offset += 2;
        this.ops.push(new WriteOp(UI16, value));
    }
    /**
     * Write uint16be.
     * @param {Number} value
     */
    writeU16BE(value) {
        this.offset += 2;
        this.ops.push(new WriteOp(UI16BE, value));
    }
    /**
     * Write uint32le.
     * @param {Number} value
     */
    writeU32(value) {
        this.offset += 4;
        this.ops.push(new WriteOp(UI32, value));
    }
    /**
     * Write uint32be.
     * @param {Number} value
     */
    writeU32BE(value) {
        this.offset += 4;
        this.ops.push(new WriteOp(UI32BE, value));
    }
    /**
     * Write uint64le.
     * @param {Number} value
     */
    writeU64(value) {
        this.offset += 8;
        this.ops.push(new WriteOp(UI64, value));
    }
    /**
     * Write uint64be.
     * @param {Number} value
     */
    writeU64BE(value) {
        this.offset += 8;
        this.ops.push(new WriteOp(UI64BE, value));
    }
    /**
     * Write int8.
     * @param {Number} value
     */
    writeI8(value) {
        this.offset += 1;
        this.ops.push(new WriteOp(I8, value));
    }
    /**
     * Write int16le.
     * @param {Number} value
     */
    writeI16(value) {
        this.offset += 2;
        this.ops.push(new WriteOp(I16, value));
    }
    /**
     * Write int16be.
     * @param {Number} value
     */
    writeI16BE(value) {
        this.offset += 2;
        this.ops.push(new WriteOp(I16BE, value));
    }
    /**
     * Write int32le.
     * @param {Number} value
     */
    writeI32(value) {
        this.offset += 4;
        this.ops.push(new WriteOp(I32, value));
    }
    /**
     * Write int32be.
     * @param {Number} value
     */
    writeI32BE(value) {
        this.offset += 4;
        this.ops.push(new WriteOp(I32BE, value));
    }
    /**
     * Write int64le.
     * @param {Number} value
     */
    writeI64(value) {
        this.offset += 8;
        this.ops.push(new WriteOp(I64, value));
    }
    /**
     * Write int64be.
     * @param {Number} value
     */
    writeI64BE(value) {
        this.offset += 8;
        this.ops.push(new WriteOp(I64BE, value));
    }
    /**
     * Write float le.
     * @param {Number} value
     */
    writeFloat(value) {
        this.offset += 4;
        this.ops.push(new WriteOp(FL, value));
    }
    /**
     * Write float be.
     * @param {Number} value
     */
    writeFloatBE(value) {
        this.offset += 4;
        this.ops.push(new WriteOp(FLBE, value));
    }
    /**
     * Write double le.
     * @param {Number} value
     */
    writeDouble(value) {
        this.offset += 8;
        this.ops.push(new WriteOp(DBL, value));
    }
    /**
     * Write double be.
     * @param {Number} value
     */
    writeDoubleBE(value) {
        this.offset += 8;
        this.ops.push(new WriteOp(DBLBE, value));
    }
    /**
     * Write a varint.
     * @param {Number} value
     */
    writeVarint(value) {
        this.offset += encoding_1.Encoding.sizeVarint(value);
        this.ops.push(new WriteOp(VARINT, value));
    }
    /**
     * Write a varint (type 2).
     * @param {Number} value
     */
    writeVarint2(value) {
        this.offset += encoding_1.Encoding.sizeVarint2(value);
        this.ops.push(new WriteOp(VARINT2, value));
    }
    /**
     * Write bytes.
     * @param {Buffer} value
     */
    writeBytes(value) {
        if (value.length === 0) {
            return;
        }
        this.offset += value.length;
        this.ops.push(new WriteOp(BYTES, value));
    }
    /**
     * Write bytes with a varint length before them.
     * @param {Buffer} value
     */
    writeVarBytes(value) {
        this.offset += encoding_1.Encoding.sizeVarint(value.length);
        this.ops.push(new WriteOp(VARINT, value.length));
        if (value.length === 0) {
            return;
        }
        this.offset += value.length;
        this.ops.push(new WriteOp(BYTES, value));
    }
    writeBigNumber(value) {
        return this.writeVarString(value.toString());
    }
    /**
     * Copy bytes.
     * @param {Buffer} value
     * @param {Number} start
     * @param {Number} end
     */
    copy(value, start, end) {
        assert(end >= start);
        value = value.slice(start, end);
        this.writeBytes(value);
    }
    /**
     * Write string to buffer.
     * @param {String} value
     * @param {String?} enc - Any buffer-supported Encoding.
     */
    writeString(value, enc) {
        if (value.length === 0) {
            return;
        }
        this.offset += Buffer.byteLength(value, enc);
        this.ops.push(new WriteOp(STR, value, enc));
    }
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
        this.writeString(value, 'hex');
    }
    /**
     * Write a string with a varint length before it.
     * @param {String}
     * @param {String?} enc - Any buffer-supported Encoding.
     */
    writeVarString(value, enc) {
        if (value.length === 0) {
            this.offset += encoding_1.Encoding.sizeVarint(0);
            this.ops.push(new WriteOp(VARINT, 0));
            return;
        }
        const size = Buffer.byteLength(value, enc);
        this.offset += encoding_1.Encoding.sizeVarint(size);
        this.offset += size;
        this.ops.push(new WriteOp(VARINT, size));
        this.ops.push(new WriteOp(STR, value, enc));
    }
    /**
     * Write a null-terminated string.
     * @param {String|Buffer}
     * @param {String?} enc - Any buffer-supported Encoding.
     */
    writeNullString(value, enc) {
        this.writeString(value, enc);
        this.writeU8(0);
    }
    /**
     * Calculate and write a checksum for the data written so far.
     */
    writeChecksum() {
        this.offset += 4;
        this.ops.push(new WriteOp(CHECKSUM));
    }
    /**
     * Fill N bytes with value.
     * @param {Number} value
     * @param {Number} size
     */
    fill(value, size) {
        assert(size >= 0);
        if (size === 0) {
            return;
        }
        this.offset += size;
        this.ops.push(new WriteOp(FILL, value, null, size));
    }
}
exports.BufferWriter = BufferWriter;
/*
 * Helpers
 */
class WriteOp {
    constructor(type, value, enc, size) {
        this.type = type;
        this.value = value;
        this.enc = enc;
        this.size = size;
    }
}
