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
        this.m_minTxFee = new bignumber_js_1.BigNumber(5000000000000000);
        this.m_maxTxFee = new bignumber_js_1.BigNumber(5000000000000000000);
        // protected m_bytes = new BigNumber(0);
        // protected m_totalLimit = new BigNumber(0);
        this.m_baseLimit = new bignumber_js_1.BigNumber(500);
        this.m_getLimit = new bignumber_js_1.BigNumber(20);
        this.m_setLimit = new bignumber_js_1.BigNumber(100);
        this.m_createLimit = new bignumber_js_1.BigNumber(50000);
        this.m_inputLimit = new bignumber_js_1.BigNumber(5);
        this.m_coefficient = new bignumber_js_1.BigNumber(40);
    }
    async addTransaction(tx) {
        // 设置bignumber 小数位数为0
        bignumber_js_1.BigNumber.set({ DECIMAL_PLACES: 0 });
        let br = await this.getBalance(tx.address);
        if (br.err) {
            return br.err;
        }
        let balance = br.value;
        let totalUse = tx.value;
        let txLimit = tx.limit;
        // if (balance.lt(totalUse.plus(tx.fee))) {
        if (balance.lt(totalUse.plus(tx.limit.times(tx.price)))) {
            this.m_logger.error(`addTransaction failed, need fee ${tx.limit.times(tx.price).toString()} but balance ${balance.toString()}`);
            return error_code_1.ErrorCode.RESULT_NOT_ENOUGH;
        }
        if (((tx.value.toString()).indexOf('.') !== -1) || ((tx.limit.toString()).indexOf('.') !== -1) || ((tx.price.toString()).indexOf('.') !== -1)) {
            this.m_logger.error(`addTransaction failed, params can't have decimals`);
            return error_code_1.ErrorCode.RESULT_INVALID_PARAM;
        }
        if (!bignumber_js_1.BigNumber.isBigNumber(tx.value)) {
            this.m_logger.error(`addTransaction failed, value must be BigNumber`);
            return error_code_1.ErrorCode.RESULT_INVALID_PARAM;
        }
        if (!bignumber_js_1.BigNumber.isBigNumber(tx.limit)) {
            this.m_logger.error(`addTransaction failed, limit must be BigNumber`);
            return error_code_1.ErrorCode.RESULT_INVALID_PARAM;
        }
        if (!bignumber_js_1.BigNumber.isBigNumber(tx.price)) {
            this.m_logger.error(`addTransaction failed, price must be BigNumber`);
            return error_code_1.ErrorCode.RESULT_INVALID_PARAM;
        }
        // 单笔tx的 limit不能超过最大 limit 限制
        if (txLimit.gt(this.m_maxTxLimit)) {
            this.m_logger.error(`addTransaction failed, max transaction limit ${this.m_maxTxLimit.toString()}, but user defined limit ${tx.limit.toString()}`);
            return error_code_1.ErrorCode.RESULT_LIMIT_TOO_BIG;
        }
        // 单笔tx的最大 price
        if (tx.price.gt(this.m_maxTxFee.div(this.m_maxTxLimit))) {
            this.m_logger.error(`addTransaction failed, max transaction price ${(this.m_maxTxFee.div(this.m_maxTxLimit))}, but user defined price ${tx.price}`);
            return error_code_1.ErrorCode.RESULT_PRICE_OUT_OF_RANGE;
        }
        // 单笔tx的最小 price
        if (tx.price.lt(this.m_minTxFee.div(this.m_maxTxLimit))) {
            this.m_logger.error(`addTransaction failed, min transaction price ${(this.m_minTxFee.div(this.m_maxTxLimit))}, but user defined price ${tx.price}`);
            return error_code_1.ErrorCode.RESULT_PRICE_OUT_OF_RANGE;
        }
        let err = await super.addTransaction(tx);
        if (err) {
            return err;
        }
        return this._updateBalance(tx.address, balance.minus(totalUse));
    }
    async updateTipBlock(header) {
        let err = super.updateTipBlock(header);
        if (err) {
            return err;
        }
        this.m_balance = new Map();
        return err;
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
    async onReplaceTx(txNew, txOld) {
        let br = await this.getBalance(txNew.address);
        if (br.err) {
            return;
        }
        // await this._updateBalance(txNew.address as string, br.value!.plus(txOld.value).minus(txNew.value).plus(txOld.fee).minus(txNew.fee));
        await this._updateBalance(txNew.address, br.value.plus(txOld.value).minus(txNew.value).plus(txOld.limit.times(txOld.price)).minus(txNew.limit.times(txNew.price)));
        return;
    }
    popTransactionWithFee(maxLimit) {
        let txs = [];
        let total = new bignumber_js_1.BigNumber(0);
        while (true) {
            let pt = this._popTransaction(1);
            if (pt.length === 0) {
                break;
            }
            let txTotalLimit = this.calcTxLimit(pt[0].tx);
            // total = total.plus((pt[0].tx as ValueTransaction).limit.times((pt[0].tx as ValueTransaction).price));
            total = total.plus(txTotalLimit);
            if (total.gt(maxLimit)) {
                this.m_logger.info(`popTransactionWithFee finished, total limit ${total.toString()}, max limit ${maxLimit.toString()}`);
                this.m_transactions.unshift(pt[0]);
                break;
            }
            this.m_logger.info(`popTransactionWithFee, tx total limit ${txTotalLimit.toString()}, total limit ${total.toString()}`);
            txs.push(pt[0].tx);
        }
        return txs;
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
