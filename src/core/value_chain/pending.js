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
    async _onCheck(txTime, txOld) {
        let ret = await super._onCheck(txTime, txOld);
        if (ret) {
            return ret;
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
    async _onAddedTx(txTime, txOld) {
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
        return await super._onAddedTx(txTime);
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
    async _checkSmallNonceTx(txNew, txOld) {
        if ((txNew.price).gt(txOld.price)) {
            return error_code_1.ErrorCode.RESULT_OK;
        }
        return error_code_1.ErrorCode.RESULT_FEE_TOO_SMALL;
    }
    _addToQueue(txTime, pos) {
        pos = 0;
        for (let i = 0; i < this.m_transactions.length; i++) {
            if (this.m_transactions[i].tx.address === txTime.tx.address) {
                pos = this.m_transactions[i].tx.nonce < txTime.tx.nonce ? i + 1 : i;
            }
            else {
                pos = this.m_transactions[i].tx.price.lt(txTime.tx.price) ? i : i + 1;
            }
        }
        this.m_transactions.splice(pos, 0, txTime);
    }
    async popTransactionWithFee(maxLimit) {
        let txs = [];
        let addressNonceMap = new Map();
        let total = new bignumber_js_1.BigNumber(0);
        let nonce = 0;
        for (let pos = 0; pos < this.m_transactions.length; pos++) {
            let transaction = this.m_transactions[pos].tx;
            if (addressNonceMap.has(transaction.address)) {
                nonce = addressNonceMap.get(transaction.address);
            }
            else {
                let nonceResult = await this.getStorageNonce(transaction.address);
                if (nonceResult.err) {
                    this.m_logger.error(`push tx getStorageNonce error,hash=${transaction.hash},address = ${transaction.address}`);
                    continue;
                }
                nonce = nonceResult.nonce;
            }
            if (nonce + 1 != transaction.nonce) {
                this.m_logger.error(`push tx nonce error,need ${nonce + 1} ,but ${transaction.nonce},hash=${transaction.hash},address = ${transaction.address}`);
                continue;
            }
            let totalTxLimit = this.m_calcTxLimit.calcTxLimit(transaction.method, transaction.input);
            this.m_logger.debug(`popTransactionWithFee hash ${transaction.hash}, method ${transaction.method}, input ${transaction.input}, txlimit ${totalTxLimit.toString()}`);
            total = total.plus(totalTxLimit);
            if (total.gt(maxLimit)) {
                this.m_logger.debug(`popTransactionWithFee finished, total limit ${total.toString()}, max limit ${maxLimit.toString()}`);
                break;
            }
            txs.push(transaction);
            addressNonceMap.set(transaction.address, transaction.nonce);
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
