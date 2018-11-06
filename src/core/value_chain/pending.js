"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const chain_1 = require("../chain");
const error_code_1 = require("../error_code");
const bignumber_js_1 = require("bignumber.js");
const chain_2 = require("./chain");
const serializable_1 = require("../serializable");
class ValuePendingTransactions extends chain_1.PendingTransactions {
    constructor() {
        super(...arguments);
        this.m_balance = new Map();
        this.m_maxTxLimit = new bignumber_js_1.BigNumber(7000000);
        this.m_minTxPrice = new bignumber_js_1.BigNumber(200000000000);
        this.m_maxTxPrice = new bignumber_js_1.BigNumber(2000000000000);
        // protected m_bytes = new BigNumber(0);
        // protected m_totalLimit = new BigNumber(0);
        this.m_baseLimit = new bignumber_js_1.BigNumber(500);
        this.m_getLimit = new bignumber_js_1.BigNumber(20);
        this.m_setLimit = new bignumber_js_1.BigNumber(100);
        this.m_createLimit = new bignumber_js_1.BigNumber(50000);
        this.m_inputLimit = new bignumber_js_1.BigNumber(5);
        this.m_coefficient = new bignumber_js_1.BigNumber(40);
    }
    async onCheck(txTime, txOld) {
        let ret = await super.onCheck(txTime, txOld);
        if (ret) {
            return ret;
        }
        let br = await this.getBalance(txTime.tx.address);
        if (br.err) {
            return br.err;
        }
        let balance = br.value;
        let txValue = txTime.tx;
        let txLimit = txValue.limit;
        let txTotalLimit = this.calcTxLimit(txValue);
        if (!bignumber_js_1.BigNumber.isBigNumber(txValue.value)) {
            this.m_logger.error(`onCheck failed, value must be BigNumber`);
            return error_code_1.ErrorCode.RESULT_INVALID_PARAM;
        }
        if (!bignumber_js_1.BigNumber.isBigNumber(txValue.limit)) {
            this.m_logger.error(`onCheck failed, limit must be BigNumber`);
            return error_code_1.ErrorCode.RESULT_INVALID_PARAM;
        }
        if (!bignumber_js_1.BigNumber.isBigNumber(txValue.price)) {
            this.m_logger.error(`onCheck failed, price must be BigNumber`);
            return error_code_1.ErrorCode.RESULT_INVALID_PARAM;
        }
        // 单笔tx的 limit不能超过最大 limit 限制
        if (txLimit.gt(this.m_maxTxLimit)) {
            this.m_logger.error(`onCheck failed, max transaction limit ${this.m_maxTxLimit.toString()}, but user defined limit ${txValue.limit.toString()}`);
            return error_code_1.ErrorCode.RESULT_LIMIT_TOO_BIG;
        }
        // 单笔tx的最大 price
        if (txValue.price.gt(this.m_maxTxPrice)) {
            this.m_logger.error(`onCheck failed, max transaction price ${(this.m_maxTxPrice.toString())}, but user defined price ${txValue.price.toString()}`);
            return error_code_1.ErrorCode.RESULT_PRICE_TOO_BIG;
        }
        // 单笔tx的最小 price
        if (txValue.price.lt(this.m_minTxPrice)) {
            this.m_logger.error(`onCheck failed, min transaction price ${(this.m_minTxPrice.toString())}, but user defined price ${txValue.price.toString()}`);
            return error_code_1.ErrorCode.RESULT_PRICE_TOO_SMALL;
        }
        if (txLimit.lt(txTotalLimit)) {
            this.m_logger.error(`onCheck failed, need limit ${txTotalLimit}, but limit ${txLimit}`);
            return error_code_1.ErrorCode.RESULT_LIMIT_NOT_ENOUGH;
        }
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
    // 计算单笔tx的 limit
    calcTxLimit(tx) {
        let txTotalLimit = new bignumber_js_1.BigNumber(0);
        let txInputBytes = new bignumber_js_1.BigNumber(this.objectToBuffer(tx.input).length);
        switch (tx.method) {
            case 'transferTo':
                txTotalLimit = txTotalLimit.plus(this.m_baseLimit).plus(this.m_setLimit.times(new bignumber_js_1.BigNumber(2))).plus(this.m_getLimit.times(new bignumber_js_1.BigNumber(2))).plus(txInputBytes.times(this.m_inputLimit)).times(this.m_coefficient);
                break;
            case 'createToken':
                txTotalLimit = txTotalLimit.plus(this.m_baseLimit).plus(this.m_setLimit.times(new bignumber_js_1.BigNumber(6))).plus(this.m_createLimit).plus(txInputBytes.times(this.m_inputLimit)).times(this.m_coefficient);
                break;
            case 'transferTokenTo':
                txTotalLimit = txTotalLimit.plus(this.m_baseLimit).plus(this.m_setLimit.times(new bignumber_js_1.BigNumber(2))).plus(this.m_getLimit.times(new bignumber_js_1.BigNumber(4))).plus(txInputBytes.times(this.m_inputLimit)).times(this.m_coefficient);
                break;
            case 'transferFrom':
                txTotalLimit = txTotalLimit.plus(this.m_baseLimit).plus(this.m_setLimit.times(new bignumber_js_1.BigNumber(3))).plus(this.m_getLimit.times(new bignumber_js_1.BigNumber(6))).plus(txInputBytes.times(this.m_inputLimit)).times(this.m_coefficient);
                break;
            case 'approve':
                txTotalLimit = txTotalLimit.plus(this.m_baseLimit).plus(this.m_setLimit.times(new bignumber_js_1.BigNumber(2))).plus(this.m_getLimit.times(new bignumber_js_1.BigNumber(2))).plus(txInputBytes.times(this.m_inputLimit)).times(this.m_coefficient);
                break;
            case 'freezeAccount':
                txTotalLimit = txTotalLimit.plus(this.m_baseLimit).plus(this.m_setLimit.times(new bignumber_js_1.BigNumber(1))).plus(this.m_getLimit.times(new bignumber_js_1.BigNumber(1))).plus(txInputBytes.times(this.m_inputLimit)).times(this.m_coefficient);
                break;
            case 'burn':
                txTotalLimit = txTotalLimit.plus(this.m_baseLimit).plus(this.m_setLimit.times(new bignumber_js_1.BigNumber(2))).plus(this.m_getLimit.times(new bignumber_js_1.BigNumber(2))).plus(txInputBytes.times(this.m_inputLimit)).times(this.m_coefficient);
                break;
            case 'mintToken':
                txTotalLimit = txTotalLimit.plus(this.m_baseLimit).plus(this.m_setLimit.times(new bignumber_js_1.BigNumber(2))).plus(this.m_getLimit.times(new bignumber_js_1.BigNumber(3))).plus(txInputBytes.times(this.m_inputLimit)).times(this.m_coefficient);
                break;
            case 'transferOwnership':
                txTotalLimit = txTotalLimit.plus(this.m_baseLimit).plus(this.m_setLimit.times(new bignumber_js_1.BigNumber(1))).plus(this.m_getLimit.times(new bignumber_js_1.BigNumber(1))).plus(txInputBytes.times(this.m_inputLimit)).times(this.m_coefficient);
                break;
            case 'vote':
                txTotalLimit = txTotalLimit.plus(this.m_baseLimit).plus(this.m_setLimit.times(new bignumber_js_1.BigNumber(2))).plus(this.m_getLimit.times(new bignumber_js_1.BigNumber(5))).plus(txInputBytes.times(this.m_inputLimit)).times(this.m_coefficient);
                break;
            case 'mortgage':
                txTotalLimit = txTotalLimit.plus(this.m_baseLimit).plus(this.m_setLimit.times(new bignumber_js_1.BigNumber(2))).plus(this.m_getLimit.times(new bignumber_js_1.BigNumber(2))).plus(txInputBytes.times(this.m_inputLimit)).times(this.m_coefficient);
                break;
            case 'unmortgage':
                txTotalLimit = txTotalLimit.plus(this.m_baseLimit).plus(this.m_setLimit.times(new bignumber_js_1.BigNumber(3))).plus(this.m_getLimit.times(new bignumber_js_1.BigNumber(2))).plus(txInputBytes.times(this.m_inputLimit)).times(this.m_coefficient);
                break;
            case 'register':
                txTotalLimit = txTotalLimit.plus(this.m_baseLimit).plus(this.m_setLimit.times(new bignumber_js_1.BigNumber(1))).plus(this.m_getLimit.times(new bignumber_js_1.BigNumber(1))).plus(txInputBytes.times(this.m_inputLimit)).times(this.m_coefficient);
                break;
            case 'publish':
                txTotalLimit = txTotalLimit.plus(this.m_baseLimit).plus(this.m_setLimit.times(new bignumber_js_1.BigNumber(3))).plus(this.m_getLimit.times(new bignumber_js_1.BigNumber(1))).plus(txInputBytes.times(this.m_inputLimit)).times(this.m_coefficient);
                break;
            case 'bid':
                txTotalLimit = txTotalLimit.plus(this.m_baseLimit).plus(this.m_setLimit.times(new bignumber_js_1.BigNumber(1))).plus(this.m_getLimit.times(new bignumber_js_1.BigNumber(1))).plus(txInputBytes.times(this.m_inputLimit)).times(this.m_coefficient);
                break;
            default:
                txTotalLimit = txTotalLimit.plus(this.m_baseLimit).times(this.m_coefficient);
                break;
        }
        return txTotalLimit;
    }
    objectToBuffer(input) {
        let inputString;
        if (input) {
            inputString = JSON.stringify(serializable_1.toStringifiable(input, true));
        }
        else {
            inputString = JSON.stringify({});
        }
        return Buffer.from(inputString);
    }
}
exports.ValuePendingTransactions = ValuePendingTransactions;
