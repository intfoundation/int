"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const error_code_1 = require("../error_code");
const value_chain_1 = require("../value_chain");
const writer_1 = require("../lib/writer");
const digest = require('../lib/digest');
const dbftProxy_1 = require("./dbftProxy");
class DbftBlockHeader extends value_chain_1.BlockWithSign(value_chain_1.ValueBlockHeader) {
    constructor() {
        super(...arguments);
        // 签名部分不进入hash计算
        this.m_dbftSigns = [];
    }
    _encodeHashContent(writer) {
        let err = super._encodeHashContent(writer);
        if (err) {
            return err;
        }
        writer.writeU16(this.m_dbftSigns.length);
        for (let s of this.m_dbftSigns) {
            writer.writeVarString(s.address);
            writer.writeVarString(s.sign);
        }
        return error_code_1.ErrorCode.RESULT_OK;
    }
    _decodeHashContent(reader) {
        let err = super._decodeHashContent(reader);
        if (err !== error_code_1.ErrorCode.RESULT_OK) {
            return err;
        }
        try {
            let n = reader.readU16();
            for (let i = 0; i < n; i++) {
                let address = reader.readVarString();
                let sign = reader.readVarString();
                this.m_dbftSigns.push({ address, sign });
            }
        }
        catch (e) {
            return error_code_1.ErrorCode.RESULT_INVALID_FORMAT;
        }
        return error_code_1.ErrorCode.RESULT_OK;
    }
    // protected _encodeSignContent(): Buffer {
    //     // 用supper，计算的时候不算m_dbftSigns部分
    //     let writer = super._encodeHashContent(new BufferWriter());
    //     writer.writeBytes(this.pubkey);
    //     return writer.render();
    // }
    _genHash() {
        let contentWriter = new writer_1.BufferWriter();
        // 用supper，计算的时候不算m_dbftSigns部分
        super._encodeHashContent(contentWriter);
        let content = contentWriter.render();
        return digest.hash256(content).toString('hex');
    }
    addSigns(signs) {
        this.m_dbftSigns = [];
        this.m_dbftSigns = this.m_dbftSigns.concat(signs);
    }
    async verify(chain) {
        // 先验证签名是否正确
        if (!this._verifySign()) {
            chain.logger.error(`verify block ${this.number} sign error!`);
            return { err: error_code_1.ErrorCode.RESULT_OK, valid: false };
        }
        // 从某个设施验证pubkey是否在列表中,是否轮到这个节点出块
        return await this._verifyMiner(chain);
    }
    async _verifyMiner(chain) {
        let gm = await chain.getMiners(this);
        if (gm.err) {
            return { err: gm.err };
        }
        let minerMap = new Map();
        gm.miners.forEach((v) => {
            minerMap.set(v.address, Buffer.from(v.pubkey, 'hex'));
        });
        let m = Math.floor(this.m_dbftSigns.length * 2 / 3);
        if (m * 3 < this.m_dbftSigns.length * 2) {
            m = m + 1;
        }
        if (m === 0) {
            return { err: error_code_1.ErrorCode.RESULT_FAILED };
        }
        let succSign = new Map();
        let count = 0;
        for (let s of this.m_dbftSigns) {
            if (succSign.has(s.address)) {
                continue;
            }
            if (!minerMap.has(s.address)) {
                continue;
            }
            if (await dbftProxy_1.DBFTSProxy.verifySign(Buffer.from(this.hash, 'hex'), minerMap.get(s.address), Buffer.from(s.sign, 'hex')) === error_code_1.ErrorCode.RESULT_OK) {
                succSign.set(s.address, 1);
                count++;
            }
        }
        if (count >= m) {
            return { err: error_code_1.ErrorCode.RESULT_OK, valid: true };
        }
        return { err: error_code_1.ErrorCode.RESULT_FAILED, valid: false };
    }
}
exports.DbftBlockHeader = DbftBlockHeader;
