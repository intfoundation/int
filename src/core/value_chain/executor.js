"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const bignumber_js_1 = require("bignumber.js");
const error_code_1 = require("../error_code");
const address_1 = require("../address");
const chain_1 = require("../chain");
const context_1 = require("./context");
const transaction_1 = require("./transaction");
const chain_2 = require("./chain");
const calculate_tx_limit_1 = require("../executor/calculate_tx_limit");
const util_1 = require("util");
const assert = require('assert');
class ValueBlockExecutor extends chain_1.BlockExecutor {
    _newTransactionExecutor(l, tx) {
        return new ValueTransactionExecutor(this.m_handler, l, tx, this.m_logger);
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
            return { err };
        }
        return await super.executePreBlockEvent();
    }
}
exports.ValueBlockExecutor = ValueBlockExecutor;
class ValueTransactionExecutor extends chain_1.TransactionExecutor {
    constructor(handler, listener, tx, logger) {
        super(handler, listener, tx, logger);
        this.m_options = {
            maxTxLimit: new bignumber_js_1.BigNumber(7000000),
            minTxLimit: new bignumber_js_1.BigNumber(25000),
            maxTxPrice: new bignumber_js_1.BigNumber(2000000000000),
            minTxPrice: new bignumber_js_1.BigNumber(200000000000) //单笔 tx 最小price
        };
        this.m_totalCost = new bignumber_js_1.BigNumber(0);
        this.m_calcTxLimit = new calculate_tx_limit_1.CalcuateLimit();
    }
    async prepareContext(blockHeader, storage, externContext) {
        let context = await super.prepareContext(blockHeader, storage, externContext);
        let txTotalLimit = this.m_calcTxLimit.calcTxLimit(this.m_tx.method, this.m_tx.input);
        Object.defineProperty(context, 'value', {
            writable: false,
            value: this.m_tx.value
        });
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
    async execute(blockHeader, storage, externContext, flag) {
        if (!(flag && flag.ignoreNoce)) {
            let nonceErr = await this._dealNonce(this.m_tx, storage);
            if (nonceErr !== error_code_1.ErrorCode.RESULT_OK) {
                return { err: nonceErr };
            }
        }
        let bt = this.baseMethodChecker(this.m_tx);
        if (bt) {
            this.m_logger.error(`execute baseMethodChecker failed for ${bt}, hash=${this.m_tx.hash}`);
            return { err: bt };
        }
        let kvBalance = (await storage.getKeyValue(chain_1.Chain.dbSystem, chain_2.ValueChain.kvBalance)).kv;
        let fromAddress = this.m_tx.address;
        let nToValue = this.m_tx.value;
        let receipt = new transaction_1.ValueReceipt();
        receipt.setSource({ sourceType: chain_1.ReceiptSourceType.transaction, txHash: this.m_tx.hash });
        let ve = new context_1.Context(kvBalance);
        if ((await ve.getBalance(fromAddress)).lt(nToValue)) {
            this.m_logger.error(`methodexecutor failed for value not enough need ${nToValue.toString()} but ${(await ve.getBalance(fromAddress)).toString()} address=${this.m_tx.address}, hash=${this.m_tx.hash}`);
            receipt.returnCode = error_code_1.ErrorCode.RESULT_NOT_ENOUGH;
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
    baseMethodChecker(tx) {
        if (util_1.isNullOrUndefined(tx.limit) || util_1.isNullOrUndefined(tx.price) || util_1.isNullOrUndefined(tx.value)) {
            return error_code_1.ErrorCode.RESULT_INVALID_PARAM;
        }
        if (!bignumber_js_1.BigNumber.isBigNumber(tx.limit) || !bignumber_js_1.BigNumber.isBigNumber(tx.price) || !bignumber_js_1.BigNumber.isBigNumber(tx.value)) {
            return error_code_1.ErrorCode.RESULT_NOT_BIGNUMBER;
        }
        if (!tx.limit.isInteger() || !tx.price.isInteger() || !tx.value.isInteger()) {
            return error_code_1.ErrorCode.RESULT_NOT_INTEGER;
        }
        if (tx.limit.isNegative() || tx.price.isNegative() || tx.value.isNegative()) {
            return error_code_1.ErrorCode.RESULT_CANT_BE_LESS_THAN_ZERO;
        }
        if (tx.price.gt(this.m_options.maxTxPrice)) {
            return error_code_1.ErrorCode.RESULT_PRICE_TOO_BIG;
        }
        if (tx.price.lt(this.m_options.minTxPrice)) {
            return error_code_1.ErrorCode.RESULT_PRICE_TOO_SMALL;
        }
        if (tx.limit.gt(this.m_options.maxTxLimit)) {
            return error_code_1.ErrorCode.RESULT_LIMIT_TOO_BIG;
        }
        let txLimit = this.m_calcTxLimit.calcTxLimit(tx.method, tx.input);
        if (tx.limit.lt(this.m_options.minTxLimit) || tx.limit.lt(txLimit)) {
            return error_code_1.ErrorCode.RESULT_LIMIT_TOO_SMALL;
        }
        return error_code_1.ErrorCode.RESULT_OK;
    }
}
exports.ValueTransactionExecutor = ValueTransactionExecutor;
