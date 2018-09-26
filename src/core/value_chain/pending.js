"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const chain_1 = require("../chain");
const error_code_1 = require("../error_code");
const bignumber_js_1 = require("bignumber.js");
const chain_2 = require("./chain");
class ValuePendingTransactions extends chain_1.PendingTransactions {
    constructor() {
        super(...arguments);
        this.m_balance = new Map();
    }
    async addTransaction(tx) {
        let br = await this.getBalance(tx.address);
        if (br.err) {
            return br.err;
        }
        let balance = br.value;
        let totalUse = tx.value;
        if (balance.lt(totalUse.plus(tx.fee))) {
            this.m_logger.error(`addTransaction failed, need fee ${tx.fee.toString()} but balance ${balance.toString()}`);
            return error_code_1.ErrorCode.RESULT_NOT_ENOUGH;
        }
        let err = await super.addTransaction(tx);
        if (!err) {
            return err;
        }
        return this._updateBalance(tx.address, balance.minus(totalUse));
    }
    async getStorageBalance(s) {
        try {
            let dbr = await this.m_storageView.getReadableDataBase(chain_1.Chain.dbSystem);
            if (dbr.err) {
                return { err: dbr.err };
            }
            let kvr = await dbr.value.getReadableKeyValue(chain_2.ValueChain.kvBalance);
            if (kvr.err !== error_code_1.ErrorCode.RESULT_OK) {
                return { err: kvr.err };
            }
            let ret = await kvr.kv.get(s);
            if (!ret.err) {
                return ret;
            }
            else if (ret.err === error_code_1.ErrorCode.RESULT_NOT_FOUND) {
                return { err: error_code_1.ErrorCode.RESULT_OK, value: new bignumber_js_1.BigNumber(0) };
            }
            else {
                return { err: ret.err };
            }
        }
        catch (error) {
            this.m_logger.error(`getStorageBalance error=${error}`);
            return { err: error_code_1.ErrorCode.RESULT_EXCEPTION };
        }
    }
    // 获取pending中的balance
    async getBalance(s) {
        if (this.m_balance.has(s)) {
            return { err: error_code_1.ErrorCode.RESULT_OK, value: this.m_balance.get(s) };
        }
        return this.getStorageBalance(s);
    }
    async checkSmallNonceTx(txNew, txOld) {
        if (txNew.fee.gt(txOld.fee)) {
            let br = await this.getBalance(txNew.address);
            if (br.err) {
                return br.err;
            }
            return this._updateBalance(txNew.address, br.value.plus(txOld.value).minus(txNew.value).plus(txOld.fee).minus(txNew.fee));
        }
        return error_code_1.ErrorCode.RESULT_FEE_TOO_SMALL;
    }
    async _updateBalance(address, v) {
        let br = await this.getStorageBalance(address);
        if (br.err) {
            return br.err;
        }
        if (br.value.isEqualTo(v) && this.m_balance.has(address)) {
            this.m_balance.delete(address);
        }
        else {
            this.m_balance.set(address, v);
        }
        return error_code_1.ErrorCode.RESULT_OK;
    }
    addToQueue(txTime) {
        let pos = 0;
        for (let i = 0; i < this.m_transactions.length; i++) {
            if (this.m_transactions[i].tx.address === txTime.tx.address) {
                pos = this.m_transactions[i].tx.nonce < txTime.tx.nonce ? i + 1 : i;
            }
            else {
                pos = this.m_transactions[i].tx.fee.lt(txTime.tx.fee) ? i : i + 1;
            }
        }
        this.m_transactions.splice(pos, 0, txTime);
        this.m_mapNonce.set(txTime.tx.address, txTime.tx.nonce);
    }
}
exports.ValuePendingTransactions = ValuePendingTransactions;
