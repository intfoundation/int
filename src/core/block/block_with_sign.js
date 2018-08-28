"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const error_code_1 = require("../error_code");
const Address = require("../address");
const encoding_1 = require("../lib/encoding");
const writer_1 = require("../lib/writer");
const digest = require("../lib/digest");
function instance(superClass) {
    return class extends superClass {
        constructor(...args) {
            super(args[0]);
            // Uint8Array(33)
            this.m_pubkey = new Buffer(33);
            // Uint8Array(64)
            this.m_sign = encoding_1.Encoding.ZERO_SIG64;
        }
        get pubkey() {
            return this.m_pubkey;
        }
        get miner() {
            return Address.addressFromPublicKey(this.m_pubkey);
        }
        _encodeHashContent(writer) {
            let err = super._encodeHashContent(writer);
            if (err) {
                return err;
            }
            try {
                writer.writeBytes(this.m_pubkey);
                writer.writeBytes(this.m_sign);
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
            this.m_pubkey = reader.readBytes(33);
            this.m_sign = reader.readBytes(64);
            return error_code_1.ErrorCode.RESULT_OK;
        }
        signBlock(secret) {
            this.m_pubkey = Address.publicKeyFromSecretKey(secret);
            let writer = new writer_1.BufferWriter();
            let err = this._encodeSignContent(writer);
            if (err) {
                return err;
            }
            let content;
            try {
                content = writer.render();
            }
            catch (e) {
                return error_code_1.ErrorCode.RESULT_INVALID_FORMAT;
            }
            let signHash = digest.hash256(content);
            this.m_sign = Address.signBufferMsg(signHash, secret);
            return error_code_1.ErrorCode.RESULT_OK;
        }
        _encodeSignContent(writer) {
            let err = super._encodeHashContent(writer);
            if (err) {
                return err;
            }
            try {
                writer.writeBytes(this.m_pubkey);
            }
            catch (e) {
                return error_code_1.ErrorCode.RESULT_INVALID_FORMAT;
            }
            return error_code_1.ErrorCode.RESULT_OK;
        }
        _verifySign() {
            let writer = new writer_1.BufferWriter();
            this._encodeSignContent(writer);
            let signHash = digest.hash256(writer.render());
            return Address.verifyBufferMsg(signHash, this.m_sign, this.m_pubkey);
        }
    };
}
exports.instance = instance;
