"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const bignumber_js_1 = require("bignumber.js");
const error_code_1 = require("../error_code");
const address_1 = require("../address");
const chain_1 = require("../chain");
const context_1 = require("./context");
const transaction_1 = require("./transaction");
const chain_2 = require("./chain");
const util_1 = require("util");
const serializable_1 = require("../serializable");
const assert = require('assert');
class ValueBlockExecutor extends chain_1.BlockExecutor {
    _newTransactionExecutor(l, tx) {
        return new ValueTransactionExecutor(l, tx, this.m_logger);
    }
    async executeMinerWageEvent() {
        let l = this.m_handler.getMinerWageListener();
        let wage = await l(this.m_block.number);
        let kvBalance = (await this.m_storage.getKeyValue(chain_1.Chain.dbSystem, chain_2.ValueChain.kvBalance)).kv;
        let ve = new context_1.Context(kvBalance);
        let coinbase = this.m_block.header.coinbase;
        assert(address_1.isValidAddress(coinbase), `block ${this.m_block.hash} has no coinbase set`);
        if (!address_1.isValidAddress(coinbase)) {
            coinbase = chain_2.ValueChain.sysAddress;
        }
        return await ve.issue(coinbase, wage);
    }
    async executePreBlockEvent() {
        const err = await this.executeMinerWageEvent();
        if (err) {
            return err;
        }
        return await super.executePreBlockEvent();
    }
}
exports.ValueBlockExecutor = ValueBlockExecutor;
class ValueTransactionExecutor extends chain_1.TransactionExecutor {
    constructor(listener, tx, logger) {
        super(listener, tx, logger);
        this.m_totalCost = new bignumber_js_1.BigNumber(0);
        this.m_maxTxLimit = new bignumber_js_1.BigNumber(7000000); // 单笔 tx 最大 limit
        this.m_minTxLimit = new bignumber_js_1.BigNumber(0); // 单笔 tx 最小 limit
        this.m_minTxPrice = new bignumber_js_1.BigNumber(200000000000); // 单笔 tx 最小price
        this.m_maxTxPrice = new bignumber_js_1.BigNumber(2000000000000); // 单笔 tx 最大price
        this.m_baseLimit = new bignumber_js_1.BigNumber(500); // 基础交易费用
        this.m_getLimit = new bignumber_js_1.BigNumber(20); // get操作费用
        this.m_setLimit = new bignumber_js_1.BigNumber(100); // set操作费用
        this.m_createLimit = new bignumber_js_1.BigNumber(50000); // 建表操作费用
        this.m_inputLimit = new bignumber_js_1.BigNumber(5); // input数据每个字节费用
        this.m_coefficient = new bignumber_js_1.BigNumber(40); // 调整系数
    }
    async prepareContext(blockHeader, storage, externContext) {
        let context = await super.prepareContext(blockHeader, storage, externContext);
        let txTotalLimit = this.calcTxLimit(this.m_tx);
        Object.defineProperty(context, 'value', {
            writable: false,
            value: this.m_tx.value
        });
        // Object.defineProperty(
        //     context, 'fee', {
        //         writable: false,
        //         value: (this.m_tx as ValueTransaction).fee
        //     }
        //
        // );
        Object.defineProperty(context, 'limit', {
            writable: false,
            value: this.m_tx.limit
        });
        Object.defineProperty(context, 'price', {
            writable: false,
            value: this.m_tx.price
        });
        Object.defineProperty(context, 'totallimit', {
            writable: false,
            value: txTotalLimit
        });
        context.cost = (fee) => {
            let totalCost = this.m_totalCost;
            let txFee = (this.m_tx.limit).times(this.m_tx.price);
            totalCost = totalCost.plus(fee);
            if (totalCost.gt(txFee)) {
                this.m_totalCost = txFee;
                this.m_logger.error(`context cost failed, tx hash ${this.m_tx.hash} total cost ${totalCost.toString()}, but fee ${txFee.toString()}`);
                return error_code_1.ErrorCode.RESULT_TX_FEE_NOT_ENOUGH;
            }
            else {
                this.m_totalCost = totalCost;
                return error_code_1.ErrorCode.RESULT_OK;
            }
        };
        return context;
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
    async execute(blockHeader, storage, externContext, flag) {
        if (!(flag && flag.ignoreNoce)) {
            let nonceErr = await this._dealNonce(this.m_tx, storage);
            if (nonceErr !== error_code_1.ErrorCode.RESULT_OK) {
                return { err: nonceErr };
            }
        }
        let kvBalance = (await storage.getKeyValue(chain_1.Chain.dbSystem, chain_2.ValueChain.kvBalance)).kv;
        let fromAddress = this.m_tx.address;
        let nToValue = this.m_tx.value;
        let receipt = new transaction_1.ValueReceipt();
        let ve = new context_1.Context(kvBalance);
        if ((await ve.getBalance(fromAddress)).lt(nToValue)) {
            this.m_logger.error(`methodexecutor failed for value not enough need ${nToValue.toString()} but ${(await ve.getBalance(fromAddress)).toString()} address=${this.m_tx.address}, hash=${this.m_tx.hash}`);
            receipt.returnCode = error_code_1.ErrorCode.RESULT_NOT_ENOUGH;
            receipt.transactionHash = this.m_tx.hash;
            return { err: error_code_1.ErrorCode.RESULT_OK, receipt };
        }
        let context = await this.prepareContext(blockHeader, storage, externContext);
        let work = await storage.beginTransaction();
        if (work.err) {
            this.m_logger.error(`methodexecutor failed for beginTransaction failed,address=${this.m_tx.address}, hash=${this.m_tx.hash}`);
            return { err: work.err };
        }
        let err = await ve.transferTo(fromAddress, chain_2.ValueChain.sysAddress, nToValue);
        if (err) {
            this.m_logger.error(`methodexecutor failed for transferTo sysAddress failed,address=${this.m_tx.address}, hash=${this.m_tx.hash}`);
            await work.value.rollback();
            return { err };
        }
        receipt.returnCode = await this._execute(context, this.m_tx.input);
        receipt.cost = this.m_totalCost;
        assert(util_1.isNumber(receipt.returnCode), `invalid handler return code ${receipt.returnCode}`);
        if (!util_1.isNumber(receipt.returnCode)) {
            this.m_logger.error(`methodexecutor failed for invalid handler return code type, return=${receipt.returnCode},address=${this.m_tx.address}, hash=${this.m_tx.hash}`);
            return { err: error_code_1.ErrorCode.RESULT_INVALID_PARAM };
        }
        receipt.transactionHash = this.m_tx.hash;
        if (receipt.returnCode) {
            await work.value.rollback();
        }
        else {
            receipt.eventLogs = this.m_logs;
            err = await work.value.commit();
        }
        let coinbase = blockHeader.coinbase;
        assert(address_1.isValidAddress(coinbase), `block ${blockHeader.hash} has no coinbase set`);
        if (!address_1.isValidAddress(coinbase)) {
            coinbase = chain_2.ValueChain.sysAddress;
        }
        err = await ve.transferTo(fromAddress, coinbase, receipt.cost);
        if (err) {
            return { err };
        }
        return { err: error_code_1.ErrorCode.RESULT_OK, receipt };
    }
}
exports.ValueTransactionExecutor = ValueTransactionExecutor;
