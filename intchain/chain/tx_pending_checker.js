"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("../../src/core");
const util_1 = require("util");
class baseChecker {
    constructor() {
        this.m_maxTxLimit = new core_1.BigNumber(7000000); // 单笔 tx 最大 limit
        this.m_minTxLimit = new core_1.BigNumber(0); // 单笔 tx 最小 limit
        this.m_maxTxPrice = new core_1.BigNumber(200000000000); // 单笔 tx 最小price
        this.m_minTxPrice = new core_1.BigNumber(2000000000000); // 单笔 tx 最大price
    }
    baseMethodChecker(tx) {
        if (!core_1.BigNumber.isBigNumber(tx.limit) || !core_1.BigNumber.isBigNumber(tx.price) || !core_1.BigNumber.isBigNumber(tx.value)) {
            return core_1.ErrorCode.RESULT_INVALID_PARAM;
        }
        if (tx.limit.gt(this.m_maxTxLimit)) {
            return core_1.ErrorCode.RESULT_LIMIT_TOO_BIG;
        }
        if (tx.limit.lt(this.m_minTxLimit)) {
            return core_1.ErrorCode.RESULT_LIMIT_TOO_SMALL;
        }
        if (tx.price.gt(this.m_maxTxPrice)) {
            return core_1.ErrorCode.RESULT_PRICE_TOO_BIG;
        }
        if (tx.price.gt(this.m_minTxPrice)) {
            return core_1.ErrorCode.RESULT_PRICE_TOO_SMALL;
        }
        return core_1.ErrorCode.RESULT_OK;
    }
}
exports.baseChecker = baseChecker;
class txPendingChecker {
    constructor() {
        this.m_maxTxLimit = new core_1.BigNumber(7000000); // 单笔 tx 最大 limit
        this.m_minTxLimit = new core_1.BigNumber(0); // 单笔 tx 最小 limit
        this.m_maxTxPrice = new core_1.BigNumber(200000000000); // 单笔 tx 最小price
        this.m_minTxPrice = new core_1.BigNumber(2000000000000); // 单笔 tx 最大price
    }
    baseMethodChecker(tx) {
        if (!core_1.BigNumber.isBigNumber(tx.limit) || !core_1.BigNumber.isBigNumber(tx.price) || !core_1.BigNumber.isBigNumber(tx.value)) {
            return core_1.ErrorCode.RESULT_INVALID_PARAM;
        }
        if (tx.limit.gt(this.m_maxTxLimit)) {
            return core_1.ErrorCode.RESULT_LIMIT_TOO_BIG;
        }
        if (tx.limit.lt(this.m_minTxLimit)) {
            return core_1.ErrorCode.RESULT_LIMIT_TOO_SMALL;
        }
        if (tx.price.gt(this.m_maxTxPrice)) {
            return core_1.ErrorCode.RESULT_PRICE_TOO_BIG;
        }
        if (tx.price.gt(this.m_minTxPrice)) {
            return core_1.ErrorCode.RESULT_PRICE_TOO_SMALL;
        }
        return core_1.ErrorCode.RESULT_OK;
    }
    createTokenChecker(tx) {
        let input = tx.input;
        let err = this.baseMethodChecker(tx);
        if (err) {
            return err;
        }
        if (!input || !input.tokenid || !input.amount || !input.name || !input.symbol) {
            return core_1.ErrorCode.RESULT_INVALID_PARAM;
        }
        if (!core_1.isValidAddress(input.tokenid)) {
            return core_1.ErrorCode.RESULT_INVALID_ADDRESS;
        }
        if (!core_1.BigNumber.isBigNumber(input.amount) || input.amount.lt(new core_1.BigNumber(0))) {
            return core_1.ErrorCode.RESULT_INVALID_PARAM;
        }
        if (core_1.hasDecimals(new core_1.BigNumber(input.amount))) {
            return core_1.ErrorCode.RESULT_INVALID_PARAM;
        }
        return core_1.ErrorCode.RESULT_OK;
    }
    transferTokenToChecker(tx) {
        let input = tx.input;
        let err = this.baseMethodChecker(tx);
        if (err) {
            return err;
        }
        if (!input || !input.tokenid || !input.to || !input.amount) {
            return core_1.ErrorCode.RESULT_INVALID_PARAM;
        }
        if (!core_1.isValidAddress(input.tokenid) || !core_1.isValidAddress(input.to)) {
            return core_1.ErrorCode.RESULT_INVALID_ADDRESS;
        }
        if (!core_1.BigNumber.isBigNumber(input.amount) || input.amount.lt(new core_1.BigNumber(0))) {
            return core_1.ErrorCode.RESULT_INVALID_PARAM;
        }
        if (core_1.hasDecimals(new core_1.BigNumber(input.amount))) {
            return core_1.ErrorCode.RESULT_INVALID_PARAM;
        }
        return core_1.ErrorCode.RESULT_OK;
    }
    transferFromChecker(tx) {
        let input = tx.input;
        let err = this.baseMethodChecker(tx);
        if (err) {
            return err;
        }
        if (!input || !input.tokenid || !input.from || !input.to || !input.amount) {
            return core_1.ErrorCode.RESULT_INVALID_PARAM;
        }
        if (!core_1.isValidAddress(input.tokenid) || !core_1.isValidAddress(input.from) || !core_1.isValidAddress(input.to)) {
            return core_1.ErrorCode.RESULT_INVALID_ADDRESS;
        }
        if (!core_1.BigNumber.isBigNumber(input.amount) || input.amount.lt(new core_1.BigNumber(0))) {
            return core_1.ErrorCode.RESULT_INVALID_PARAM;
        }
        if (core_1.hasDecimals(new core_1.BigNumber(input.amount))) {
            return core_1.ErrorCode.RESULT_INVALID_PARAM;
        }
        return core_1.ErrorCode.RESULT_OK;
    }
    approveChecker(tx) {
        let input = tx.input;
        let err = this.baseMethodChecker(tx);
        if (err) {
            return err;
        }
        if (!input || !input.tokenid || !input.spender || !input.amount) {
            return core_1.ErrorCode.RESULT_INVALID_PARAM;
        }
        if (!core_1.isValidAddress(input.tokenid) || !core_1.isValidAddress(input.spender)) {
            return core_1.ErrorCode.RESULT_INVALID_ADDRESS;
        }
        if (!core_1.BigNumber.isBigNumber(input.amount) || input.amount.lt(new core_1.BigNumber(0))) {
            return core_1.ErrorCode.RESULT_INVALID_PARAM;
        }
        if (core_1.hasDecimals(new core_1.BigNumber(input.amount))) {
            return core_1.ErrorCode.RESULT_INVALID_PARAM;
        }
        return core_1.ErrorCode.RESULT_OK;
    }
    freezeAccountChecker(tx) {
        let input = tx.input;
        let err = this.baseMethodChecker(tx);
        if (err) {
            return err;
        }
        if (!input || !input.tokenid || !input.freezeAddress) {
            return core_1.ErrorCode.RESULT_INVALID_PARAM;
        }
        if (util_1.isNullOrUndefined(input.freeze) || typeof input.freeze !== 'boolean') {
            return core_1.ErrorCode.RESULT_INVALID_PARAM;
        }
        if (!core_1.isValidAddress(input.tokenid) || !core_1.isValidAddress(input.from) || !core_1.isValidAddress(input.to)) {
            return core_1.ErrorCode.RESULT_INVALID_ADDRESS;
        }
        if (!core_1.BigNumber.isBigNumber(input.amount) || input.amount.lt(new core_1.BigNumber(0))) {
            return core_1.ErrorCode.RESULT_INVALID_PARAM;
        }
        if (core_1.hasDecimals(new core_1.BigNumber(input.amount))) {
            return core_1.ErrorCode.RESULT_INVALID_PARAM;
        }
        return core_1.ErrorCode.RESULT_OK;
    }
    burnChecker(tx) {
        let input = tx.input;
        let err = this.baseMethodChecker(tx);
        if (err) {
            return err;
        }
        if (!input || !input.tokenid || !input.amount) {
            return core_1.ErrorCode.RESULT_INVALID_PARAM;
        }
        if (!core_1.isValidAddress(input.tokenid)) {
            return core_1.ErrorCode.RESULT_INVALID_ADDRESS;
        }
        if (!core_1.BigNumber.isBigNumber(input.amount) || input.amount.lt(new core_1.BigNumber(0))) {
            return core_1.ErrorCode.RESULT_INVALID_PARAM;
        }
        if (core_1.hasDecimals(new core_1.BigNumber(input.amount))) {
            return core_1.ErrorCode.RESULT_INVALID_PARAM;
        }
        return core_1.ErrorCode.RESULT_OK;
    }
    mintTokenChecker(tx) {
        let input = tx.input;
        let err = this.baseMethodChecker(tx);
        if (err) {
            return err;
        }
        if (!input || !input.tokenid || !input.amount) {
            return core_1.ErrorCode.RESULT_INVALID_PARAM;
        }
        if (!core_1.isValidAddress(input.tokenid)) {
            return core_1.ErrorCode.RESULT_INVALID_ADDRESS;
        }
        if (!core_1.BigNumber.isBigNumber(input.amount) || input.amount.lt(new core_1.BigNumber(0))) {
            return core_1.ErrorCode.RESULT_INVALID_PARAM;
        }
        if (core_1.hasDecimals(new core_1.BigNumber(input.amount))) {
            return core_1.ErrorCode.RESULT_INVALID_PARAM;
        }
        return core_1.ErrorCode.RESULT_OK;
    }
    transferOwnershipChecker(tx) {
        let input = tx.input;
        let err = this.baseMethodChecker(tx);
        if (err) {
            return err;
        }
        if (!input || !input.tokenid || !input.newOwner) {
            return core_1.ErrorCode.RESULT_INVALID_PARAM;
        }
        if (!core_1.isValidAddress(input.tokenid) || !core_1.isValidAddress(input.newOwner)) {
            return core_1.ErrorCode.RESULT_INVALID_ADDRESS;
        }
        return core_1.ErrorCode.RESULT_OK;
    }
    transferToChecker(tx) {
        let input = tx.input;
        let err = this.baseMethodChecker(tx);
        if (err) {
            return err;
        }
        if (!input || !input.to) {
            return core_1.ErrorCode.RESULT_INVALID_PARAM;
        }
        if (!core_1.isValidAddress(input.to)) {
            return core_1.ErrorCode.RESULT_INVALID_ADDRESS;
        }
        return core_1.ErrorCode.RESULT_OK;
    }
    voteChecker(tx) {
        let input = tx.input;
        let err = this.baseMethodChecker(tx);
        if (err) {
            return err;
        }
        if (!input || !util_1.isArray(input.candidates)) {
            return core_1.ErrorCode.RESULT_INVALID_PARAM;
        }
        for (let value of input) {
            if (!core_1.isValidAddress(value)) {
                return core_1.ErrorCode.RESULT_INVALID_ADDRESS;
            }
        }
        return core_1.ErrorCode.RESULT_OK;
    }
    mortgageChecker(tx) {
        let input = tx.input;
        let err = this.baseMethodChecker(tx);
        if (err) {
            return err;
        }
        if (!input || !input.amount) {
            return core_1.ErrorCode.RESULT_INVALID_PARAM;
        }
        if (!core_1.BigNumber.isBigNumber(input.amount) || input.amount.lt(new core_1.BigNumber(0))) {
            return core_1.ErrorCode.RESULT_INVALID_PARAM;
        }
        if (core_1.hasDecimals(new core_1.BigNumber(input.amount))) {
            return core_1.ErrorCode.RESULT_INVALID_PARAM;
        }
        return core_1.ErrorCode.RESULT_OK;
    }
    unmortgageChecker(tx) {
        let input = tx.input;
        let err = this.baseMethodChecker(tx);
        if (err) {
            return err;
        }
        if (!input || !input.amount) {
            return core_1.ErrorCode.RESULT_INVALID_PARAM;
        }
        if (!core_1.BigNumber.isBigNumber(input.amount) || input.amount.lt(new core_1.BigNumber(0))) {
            return core_1.ErrorCode.RESULT_INVALID_PARAM;
        }
        if (core_1.hasDecimals(new core_1.BigNumber(input.amount))) {
            return core_1.ErrorCode.RESULT_INVALID_PARAM;
        }
        return core_1.ErrorCode.RESULT_OK;
    }
    registerChecker(tx) {
        let err = this.baseMethodChecker(tx);
        if (err) {
            return err;
        }
        return core_1.ErrorCode.RESULT_OK;
    }
    publishChecker(tx) {
        let input = tx.input;
        let err = this.baseMethodChecker(tx);
        if (err) {
            return err;
        }
        if (!input || !input.name || util_1.isNullOrUndefined(input.name) || !input.duation || input.duation <= 0 || !input.lowest || !(input.lowest instanceof core_1.BigNumber)) {
            return core_1.ErrorCode.RESULT_INVALID_PARAM;
        }
        return core_1.ErrorCode.RESULT_OK;
    }
    bidChecker(tx) {
        let input = tx.input;
        let err = this.baseMethodChecker(tx);
        if (err) {
            return err;
        }
        if (!input || !input.name || util_1.isNullOrUndefined(input.name)) {
            return core_1.ErrorCode.RESULT_INVALID_PARAM;
        }
        return core_1.ErrorCode.RESULT_OK;
    }
}
exports.txPendingChecker = txPendingChecker;
