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
        this.m_baseLimit = new bignumber_js_1.BigNumber(500); // 基础交易费用
        this.m_getLimit = new bignumber_js_1.BigNumber(20); // get操作费用
        this.m_setLimit = new bignumber_js_1.BigNumber(100); // set操作费用
        this.m_createLimit = new bignumber_js_1.BigNumber(50000); // 建表操作费用
        this.m_inputLimit = new bignumber_js_1.BigNumber(5); // input数据每个字节费用
        this.m_coefficient = new bignumber_js_1.BigNumber(40); // 调整系数
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
        // if (txNew.fee.gt(txOld.fee)) {
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
            let totalTxLimit = this.calcTxLimit(this.m_transactions[pos].tx);
            total = total.plus(totalTxLimit);
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
    // 计算执行tx的 limit
    calcTxLimit(tx) {
        let txTotalLimit = new bignumber_js_1.BigNumber(0);
        switch (tx.method) {
            case 'transferTo':
                txTotalLimit = this.calcLimit(tx.input, 2, 2, false);
                break;
            case 'createToken':
                txTotalLimit = this.calcLimit(tx.input, 6, 0, true);
                break;
            case 'transferTokenTo':
                txTotalLimit = this.calcLimit(tx.input, 2, 4, false);
                break;
            case 'transferFrom':
                txTotalLimit = this.calcLimit(tx.input, 3, 6, false);
                break;
            case 'approve':
                txTotalLimit = this.calcLimit(tx.input, 2, 2, false);
                break;
            case 'freezeAccount':
                txTotalLimit = this.calcLimit(tx.input, 1, 1, false);
                break;
            case 'burn':
                txTotalLimit = this.calcLimit(tx.input, 2, 2, false);
                break;
            case 'mintToken':
                txTotalLimit = this.calcLimit(tx.input, 2, 3, false);
                break;
            case 'transferOwnership':
                txTotalLimit = this.calcLimit(tx.input, 1, 1, false);
                break;
            case 'vote':
                txTotalLimit = this.calcLimit(tx.input, 2, 5, false);
                break;
            case 'mortgage':
                txTotalLimit = this.calcLimit(tx.input, 2, 2, false);
                break;
            case 'unmortgage':
                txTotalLimit = this.calcLimit(tx.input, 3, 2, false);
                break;
            case 'register':
                txTotalLimit = this.calcLimit(tx.input, 1, 1, false);
                break;
            case 'publish':
                txTotalLimit = this.calcLimit(tx.input, 3, 1, false);
                break;
            case 'bid':
                txTotalLimit = this.calcLimit(tx.input, 1, 1, false);
                break;
            default:
                txTotalLimit = this.calcLimit(tx.input, 0, 0, false);
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
    calcLimit(input, setN, getN, create) {
        let txTotalLimit = new bignumber_js_1.BigNumber(0);
        let txInputBytes = new bignumber_js_1.BigNumber(this.objectToBuffer(input).length);
        txTotalLimit = txTotalLimit.plus(this.m_baseLimit).plus(this.m_setLimit.times(new bignumber_js_1.BigNumber(setN))).plus(this.m_getLimit.times(new bignumber_js_1.BigNumber(getN))).plus(txInputBytes.times(this.m_inputLimit));
        if (create) {
            txTotalLimit = txTotalLimit.plus(this.m_createLimit);
        }
        txTotalLimit = txTotalLimit.times(this.m_coefficient);
        return txTotalLimit;
    }
}
exports.ValuePendingTransactions = ValuePendingTransactions;
