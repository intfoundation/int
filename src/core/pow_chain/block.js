"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const writer_1 = require("../lib/writer");
const error_code_1 = require("../error_code");
const value_chain_1 = require("../value_chain");
const consensus = require("./consensus");
const assert = require("assert");
const digest = require("../lib/digest");
// type Constructor<T> = new () => T;
// export function blockHeaderClass<T extends BaseBlock.BlockHeader>(superBlockHeader: Constructor<T>) {
//     class BlockHeaderClass extends (superBlockHeader as Constructor<BaseBlock.BlockHeader>) {
class PowBlockHeader extends value_chain_1.ValueBlockHeader {
    constructor() {
        super();
        this.m_bits = 0;
        this.m_nonce = 0;
        this.m_nonce1 = 0;
        // this.m_bits = POWUtil.getTarget(prevheader);
    }
    get bits() {
        return this.m_bits;
    }
    set bits(bits) {
        this.m_bits = bits;
    }
    get nonce() {
        return this.m_nonce;
    }
    set nonce(_nonce) {
        assert(_nonce <= consensus.INT32_MAX);
        this.m_nonce = _nonce;
    }
    get nonce1() {
        return this.m_nonce1;
    }
    set nonce1(nonce) {
        assert(nonce <= consensus.INT32_MAX);
        this.m_nonce1 = nonce;
    }
    _encodeHashContent(writer) {
        let err = super._encodeHashContent(writer);
        if (err) {
            return err;
        }
        try {
            writer.writeU32(this.m_bits);
        }
        catch (e) {
            return error_code_1.ErrorCode.RESULT_INVALID_FORMAT;
        }
        return error_code_1.ErrorCode.RESULT_OK;
    }
    encode(writer) {
        let err = super.encode(writer);
        if (err) {
            return err;
        }
        try {
            writer.writeU32(this.m_nonce);
            writer.writeU32(this.m_nonce1);
        }
        catch (e) {
            return error_code_1.ErrorCode.RESULT_INVALID_FORMAT;
        }
        return error_code_1.ErrorCode.RESULT_OK;
    }
    _decodeHashContent(reader) {
        let err = super._decodeHashContent(reader);
        if (err !== error_code_1.ErrorCode.RESULT_OK) {
            return err;
        }
        try {
            this.m_bits = reader.readU32();
        }
        catch (e) {
            return error_code_1.ErrorCode.RESULT_INVALID_FORMAT;
        }
        return error_code_1.ErrorCode.RESULT_OK;
    }
    decode(reader) {
        let err = super.decode(reader);
        if (err !== error_code_1.ErrorCode.RESULT_OK) {
            return err;
        }
        try {
            this.m_nonce = reader.readU32();
            this.m_nonce1 = reader.readU32();
        }
        catch (e) {
            return error_code_1.ErrorCode.RESULT_INVALID_FORMAT;
        }
        return error_code_1.ErrorCode.RESULT_OK;
    }
    async verify(chain) {
        let vr = await super.verify(chain);
        if (vr.err || !vr.valid) {
            return vr;
        }
        // check bits
        let { err, target } = await consensus.getTarget(this, chain);
        if (err) {
            return { err };
        }
        if (this.m_bits !== target) {
            return { err: error_code_1.ErrorCode.RESULT_OK, valid: false };
        }
        // check POW
        return { err: error_code_1.ErrorCode.RESULT_OK, valid: this.verifyPOW() };
    }
    verifyPOW() {
        let writer = new writer_1.BufferWriter();
        if (this.encode(writer)) {
            return false;
        }
        let content = writer.render();
        return consensus.verifyPOW(digest.hash256(content), this.m_bits);
    }
    stringify() {
        let obj = super.stringify();
        obj.difficulty = this.bits;
        return obj;
    }
}
exports.PowBlockHeader = PowBlockHeader;
//     return BlockHeaderClass as Constructor<T & BlockHeaderClass>;
// }
