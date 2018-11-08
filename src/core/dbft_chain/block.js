"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const error_code_1 = require("../error_code");
const value_chain_1 = require("../value_chain");
const libAddress = require("../address");
const context_1 = require("./context");
class DbftBlockHeader extends value_chain_1.BlockWithSign(value_chain_1.ValueBlockHeader) {
    constructor() {
        super(...arguments);
        // 签名部分不进入hash计算
        this.m_dbftSigns = [];
        this.m_view = 0;
    }
    set view(v) {
        this.m_view = v;
    }
    get view() {
        return this.m_view;
    }
    _encodeHashContent(writer) {
        let err = super._encodeHashContent(writer);
        if (err) {
            return err;
        }
        try {
            writer.writeU32(this.m_view);
        }
        catch (e) {
            return error_code_1.ErrorCode.RESULT_INVALID_PARAM;
        }
        return error_code_1.ErrorCode.RESULT_OK;
    }
    _decodeHashContent(reader) {
        let err = super._decodeHashContent(reader);
        if (err) {
            return err;
        }
        try {
            this.m_view = reader.readU32();
        }
        catch (e) {
            return error_code_1.ErrorCode.RESULT_EXCEPTION;
        }
        return error_code_1.ErrorCode.RESULT_OK;
    }
    encode(writer) {
        let err = super.encode(writer);
        if (err) {
            return err;
        }
        writer.writeU16(this.m_dbftSigns.length);
        for (let s of this.m_dbftSigns) {
            writer.writeBytes(s.pubkey);
            writer.writeBytes(s.sign);
        }
        return error_code_1.ErrorCode.RESULT_OK;
    }
    decode(reader) {
        let err = super.decode(reader);
        if (err) {
            return err;
        }
        try {
            let n = reader.readU16();
            for (let i = 0; i < n; i++) {
                let pubkey = reader.readBytes(33);
                let sign = reader.readBytes(64);
                this.m_dbftSigns.push({ pubkey, sign });
            }
        }
        catch (e) {
            return error_code_1.ErrorCode.RESULT_INVALID_FORMAT;
        }
        return error_code_1.ErrorCode.RESULT_OK;
    }
    setSigns(signs) {
        this.m_dbftSigns = [];
        this.m_dbftSigns.push(...signs);
    }
    verifySign() {
        return this._verifySign();
    }
    async verify(chain) {
        // 先验证签名是否正确
        if (!this._verifySign()) {
            chain.logger.error(`verify block ${this.number} sign error!`);
            return { err: error_code_1.ErrorCode.RESULT_OK, valid: false };
        }
        // 从某个设施验证pubkey是否在列表中,是否轮到这个节点出块
        return await this._verifySigns(chain);
    }
    async _verifySigns(chain) {
        let gm = await chain.dbftHeaderStorage.getMiners(this);
        if (gm.err) {
            return { err: gm.err };
        }
        let gdr = await chain.dbftHeaderStorage.getDueMiner(this, gm.miners);
        if (gdr.err) {
            return { err: gdr.err };
        }
        if (this.miner !== gdr.miner) {
            return { err: error_code_1.ErrorCode.RESULT_OK, valid: false };
        }
        let miners = new Set(gm.miners);
        let verified = new Set();
        for (let s of this.m_dbftSigns) {
            let address = libAddress.addressFromPublicKey(s.pubkey);
            if (miners.has(address) && !verified.has(address)) {
                if (libAddress.verify(this.hash, s.sign, s.pubkey)) {
                    verified.add(address);
                }
            }
        }
        const valid = context_1.DbftContext.isAgreeRateReached(chain.globalOptions, miners.size, verified.size);
        return { err: error_code_1.ErrorCode.RESULT_OK, valid };
    }
}
exports.DbftBlockHeader = DbftBlockHeader;
