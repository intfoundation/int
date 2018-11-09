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
        this.m_maxTxLimit = new bignumber_js_1.BigNumber(7000000); // 单笔 tx 最大 limit
        this.m_minTxLimit = new bignumber_js_1.BigNumber(0); // 单笔 tx 最小 limit
        this.m_minTxPrice = new bignumber_js_1.BigNumber(200000000000); // 单笔 tx 最小price
        this.m_maxTxPrice = new bignumber_js_1.BigNumber(2000000000000); // 单笔 tx 最大price
    }
    async onCheck(txTime, txOld) {
        let ret = await super.onCheck(txTime, txOld);
        if (ret) {
            return ret;
        }
        let bt = this.baseMethodChecker(txTime.tx);
        if (bt) {
            return bt;
        }
        let br = await this.getBalance(txTime.tx.address);
        if (br.err) {
            return br.err;
        }
        let balance = br.value;
        let txValue = txTime.tx;
        let totalUse = txValue.value.plus(txValue.limit.times(txValue.price));
        if (txOld) {
            let txOldValue = txOld.tx;
            totalUse = totalUse.minus(txOldValue.value).minus(txOldValue.limit.times(txOldValue.price));
        }
        if (balance.lt(totalUse)) {
            this.m_logger.error(`onCheck failed, need total ${totalUse.toString()} but balance ${balance.toString()}`);
            return error_code_1.ErrorCode.RESULT_NOT_ENOUGH;
        }
        return error_code_1.ErrorCode.RESULT_OK;
    }
    baseMethodChecker(tx) {
        if (!bignumber_js_1.BigNumber.isBigNumber(tx.limit) || !bignumber_js_1.BigNumber.isBigNumber(tx.price) || !bignumber_js_1.BigNumber.isBigNumber(tx.value)) {
            return error_code_1.ErrorCode.RESULT_INVALID_PARAM;
        }
        if (tx.limit.gt(this.m_maxTxLimit)) {
            return error_code_1.ErrorCode.RESULT_LIMIT_TOO_BIG;
        }
        if (tx.limit.lt(this.m_minTxLimit)) {
            return error_code_1.ErrorCode.RESULT_LIMIT_TOO_SMALL;
        }
        if (tx.price.gt(this.m_maxTxPrice)) {
            return error_code_1.ErrorCode.RESULT_PRICE_TOO_BIG;
        }
        if (tx.price.lt(this.m_minTxPrice)) {
            return error_code_1.ErrorCode.RESULT_PRICE_TOO_SMALL;
        }
        return error_code_1.ErrorCode.RESULT_OK;
    }
    async onAddedTx(txTime, txOld) {
        let br = await this.getBalance(txTime.tx.address);
        if (br.err) {
            return br.err;
        }
        let balance = br.value;
        let txValue = txTime.tx;
        let valueFee = txValue.limit.times(txValue.price);
        if (txOld) {
            let txOldValue = txOld.tx;
            let oldFee = txOldValue.limit.times(txOldValue.price);
            balance = balance.plus(oldFee).plus(txOldValue.value).minus(valueFee).minus(txValue.value);
        }
        else {
            balance = balance.minus(valueFee).minus(txValue.value);
        }
        this.m_balance.set(txTime.tx.address, balance);
        return await super.onAddedTx(txTime);
    }
    async updateTipBlock(header) {
        this.m_balance = new Map();
        return await super.updateTipBlock(header);
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
        // if (txNew.fee.gt(txOld.fee)) {
        if ((txNew.price).gt(txOld.price)) {
            return error_code_1.ErrorCode.RESULT_OK;
        }
        return error_code_1.ErrorCode.RESULT_FEE_TOO_SMALL;
    }
    addToQueue(txTime, pos) {
        pos = 0;
        for (let i = 0; i < this.m_transactions.length; i++) {
            if (this.m_transactions[i].tx.address === txTime.tx.address) {
                pos = this.m_transactions[i].tx.nonce < txTime.tx.nonce ? i + 1 : i;
            }
            else {
                // pos = (this.m_transactions[i].tx as ValueTransaction).fee.lt((txTime.tx as ValueTransaction).fee) ? i : i + 1;
                pos = this.m_transactions[i].tx.price.lt(txTime.tx.price) ? i : i + 1;
            }
        }
        this.m_transactions.splice(pos, 0, txTime);
    }
    popTransactionWithFee(maxLimit) {
        let txs = [];
        let total = new bignumber_js_1.BigNumber(0);
        for (let pos = 0; pos < this.m_transactions.length; pos++) {
            total = total.plus(this.m_transactions[pos].tx.limit);
            if (total.gt(maxLimit)) {
                this.m_logger.info(`popTransactionWithFee finished, total limit ${total.toString()}, max limit ${maxLimit.toString()}`);
                break;
            }
            txs.push(this.m_transactions[pos].tx);
        }
        return txs;
    }
    async getPendingTransactions() {
        let pt = await super.getPendingTransactions();
        let pendingTxs = [];
        if (pt.err) {
            return { err: pt.err };
        }
        for (let i = 0; i < pt.pendingTransactions.length; i++) {
            let tx = pt.pendingTransactions[i].tx.stringify();
            pendingTxs.push({ tx: tx, ct: pt.pendingTransactions[i].ct });
        }
        return { err: error_code_1.ErrorCode.RESULT_OK, pendingTransactions: pendingTxs };
    }
}
exports.ValuePendingTransactions = ValuePendingTransactions;
