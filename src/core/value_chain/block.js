"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const chain_1 = require("../chain");
const error_code_1 = require("../error_code");
class ValueBlockHeader extends chain_1.BlockHeader {
    constructor() {
        super();
        this.m_coinbase = '';
    }
    get coinbase() {
        return this.m_coinbase;
    }
    set coinbase(coinbase) {
        this.m_coinbase = coinbase;
    }
    _encodeHashContent(writer) {
        let err = super._encodeHashContent(writer);
        if (err) {
            return err;
        }
        try {
            writer.writeVarString(this.m_coinbase);
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
            this.m_coinbase = reader.readVarString('utf-8');
        }
        catch (e) {
            return error_code_1.ErrorCode.RESULT_INVALID_FORMAT;
        }
        return error_code_1.ErrorCode.RESULT_OK;
    }
    stringify() {
        let obj = super.stringify();
        obj.coinbase = this.coinbase;
        return obj;
    }
}
exports.ValueBlockHeader = ValueBlockHeader;
