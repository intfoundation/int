"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const index_1 = require("../index");
const util_1 = require("util");
function createTokenChecker(tx) {
    let input = tx.input;
    if (!input || !tx.value.isEqualTo(new index_1.BigNumber(0))) {
        return index_1.ErrorCode.RESULT_INVALID_PARAM;
    }
    if (!input.name || !util_1.isString(input.name) || input.name.length > 200) {
        return index_1.ErrorCode.RESULT_INVALID_PARAM;
    }
    if (!input.symbol || !util_1.isString(input.symbol) || input.symbol.length > 50) {
        return index_1.ErrorCode.RESULT_INVALID_PARAM;
    }
    let tokenid = index_1.addressFromPublicKey(index_1.encodeAddressAndNonce(tx.address, tx.nonce));
    if (!index_1.isValidAddress(input.tokenid) || tokenid !== input.tokenid) {
        return index_1.ErrorCode.RESULT_INVALID_ADDRESS;
    }
    return checkAmount(input.amount);
}
exports.createTokenChecker = createTokenChecker;
function transferTokenToChecker(tx) {
    let input = tx.input;
    if (!input || !tx.value.isEqualTo(new index_1.BigNumber(0))) {
        return index_1.ErrorCode.RESULT_INVALID_PARAM;
    }
    if (!index_1.isValidAddress(input.tokenid) || !index_1.isValidAddress(input.to)) {
        return index_1.ErrorCode.RESULT_INVALID_ADDRESS;
    }
    return checkAmount(input.amount);
}
exports.transferTokenToChecker = transferTokenToChecker;
function transferFromChecker(tx) {
    let input = tx.input;
    if (!input || !tx.value.isEqualTo(new index_1.BigNumber(0))) {
        return index_1.ErrorCode.RESULT_INVALID_PARAM;
    }
    if (!index_1.isValidAddress(input.tokenid) || !index_1.isValidAddress(input.from) || !index_1.isValidAddress(input.to)) {
        return index_1.ErrorCode.RESULT_INVALID_ADDRESS;
    }
    return checkAmount(input.amount);
}
exports.transferFromChecker = transferFromChecker;
function approveChecker(tx) {
    let input = tx.input;
    if (!input || !tx.value.isEqualTo(new index_1.BigNumber(0))) {
        return index_1.ErrorCode.RESULT_INVALID_PARAM;
    }
    if (!index_1.isValidAddress(input.tokenid) || !index_1.isValidAddress(input.spender)) {
        return index_1.ErrorCode.RESULT_INVALID_ADDRESS;
    }
    return checkAmount(input.amount);
}
exports.approveChecker = approveChecker;
function freezeAccountChecker(tx) {
    let input = tx.input;
    if (!input || !tx.value.isEqualTo(new index_1.BigNumber(0))) {
        return index_1.ErrorCode.RESULT_INVALID_PARAM;
    }
    if (util_1.isNullOrUndefined(input.freeze) || typeof input.freeze !== 'boolean') {
        return index_1.ErrorCode.RESULT_INVALID_PARAM;
    }
    if (!index_1.isValidAddress(input.tokenid) || !index_1.isValidAddress(input.freezeAddress)) {
        return index_1.ErrorCode.RESULT_INVALID_ADDRESS;
    }
    return index_1.ErrorCode.RESULT_OK;
}
exports.freezeAccountChecker = freezeAccountChecker;
function burnChecker(tx) {
    let input = tx.input;
    if (!input || !tx.value.isEqualTo(new index_1.BigNumber(0))) {
        return index_1.ErrorCode.RESULT_INVALID_PARAM;
    }
    if (!index_1.isValidAddress(input.tokenid)) {
        return index_1.ErrorCode.RESULT_INVALID_ADDRESS;
    }
    return checkAmount(input.amount);
}
exports.burnChecker = burnChecker;
function mintTokenChecker(tx) {
    let input = tx.input;
    if (!input || !tx.value.isEqualTo(new index_1.BigNumber(0))) {
        return index_1.ErrorCode.RESULT_INVALID_PARAM;
    }
    if (!index_1.isValidAddress(input.tokenid)) {
        return index_1.ErrorCode.RESULT_INVALID_ADDRESS;
    }
    return checkAmount(input.amount);
}
exports.mintTokenChecker = mintTokenChecker;
function transferOwnershipChecker(tx) {
    let input = tx.input;
    if (!input || !tx.value.isEqualTo(new index_1.BigNumber(0))) {
        return index_1.ErrorCode.RESULT_INVALID_PARAM;
    }
    if (!index_1.isValidAddress(input.tokenid) || !index_1.isValidAddress(input.newOwner)) {
        return index_1.ErrorCode.RESULT_INVALID_ADDRESS;
    }
    return index_1.ErrorCode.RESULT_OK;
}
exports.transferOwnershipChecker = transferOwnershipChecker;
function transferToChecker(tx) {
    let input = tx.input;
    if (!input) {
        return index_1.ErrorCode.RESULT_INVALID_PARAM;
    }
    if (!index_1.isValidAddress(input.to)) {
        return index_1.ErrorCode.RESULT_INVALID_ADDRESS;
    }
    return index_1.ErrorCode.RESULT_OK;
}
exports.transferToChecker = transferToChecker;
function voteChecker(tx) {
    let input = tx.input;
    if (!input || !tx.value.isEqualTo(new index_1.BigNumber(0))) {
        return index_1.ErrorCode.RESULT_INVALID_PARAM;
    }
    let candidates = input.candidates;
    if (!candidates || !util_1.isArray(candidates) || candidates.length > 20) {
        return index_1.ErrorCode.RESULT_INVALID_PARAM;
    }
    for (let value of input.candidates) {
        if (!index_1.isValidAddress(value)) {
            return index_1.ErrorCode.RESULT_INVALID_ADDRESS;
        }
    }
    return index_1.ErrorCode.RESULT_OK;
}
exports.voteChecker = voteChecker;
function mortgageChecker(tx) {
    let input = tx.input;
    if (!input) {
        return index_1.ErrorCode.RESULT_INVALID_PARAM;
    }
    let checkAmountResult = checkAmount(input.amount);
    if (checkAmountResult) {
        return checkAmountResult;
    }
    else if (!tx.value.isEqualTo(new index_1.BigNumber(input.amount))) {
        return index_1.ErrorCode.RESULT_INVALID_PARAM;
    }
    return index_1.ErrorCode.RESULT_OK;
}
exports.mortgageChecker = mortgageChecker;
function unmortgageChecker(tx) {
    let input = tx.input;
    if (!input || !tx.value.isEqualTo(new index_1.BigNumber(0))) {
        return index_1.ErrorCode.RESULT_INVALID_PARAM;
    }
    return checkAmount(input.amount);
}
exports.unmortgageChecker = unmortgageChecker;
function registerChecker(tx) {
    let input = tx.input;
    if (!input || !tx.value.isEqualTo(new index_1.BigNumber(0))) {
        return index_1.ErrorCode.RESULT_INVALID_PARAM;
    }
    if (!index_1.isValidAddress(input.coinbase)) {
        return index_1.ErrorCode.RESULT_INVALID_ADDRESS;
    }
    return index_1.ErrorCode.RESULT_OK;
}
exports.registerChecker = registerChecker;
function lockAccountChecker(tx) {
    let input = tx.input;
    let lockBalance = new index_1.BigNumber(0);
    if (!input) {
        return index_1.ErrorCode.RESULT_INVALID_PARAM;
    }
    let contractid = index_1.addressFromPublicKey(index_1.encodeAddressAndNonce(tx.address, tx.nonce));
    if (!index_1.isValidAddress(input.contractid) || !index_1.isValidAddress(input.lockaddress) || contractid !== input.contractid) {
        return index_1.ErrorCode.RESULT_INVALID_ADDRESS;
    }
    if (!input.schedule || !util_1.isArray(input.schedule) || (input.schedule.length > 20)) {
        return index_1.ErrorCode.RESULT_INVALID_PARAM;
    }
    for (let item of input.schedule) {
        if (!item || !util_1.isObject(item)) {
            return index_1.ErrorCode.RESULT_INVALID_PARAM;
        }
        if (util_1.isNullOrUndefined(item.time) || !util_1.isNumber(item.time) || (item.time < Math.pow(10, 13))) {
            return index_1.ErrorCode.RESULT_INVALID_PARAM;
        }
        let checkAmountResult = checkAmount(item.value);
        if (checkAmountResult) {
            return checkAmountResult;
        }
        lockBalance = lockBalance.plus(new index_1.BigNumber(item.value));
    }
    if (!tx.value.isEqualTo(lockBalance)) {
        return index_1.ErrorCode.RESULT_INVALID_PARAM;
    }
    return index_1.ErrorCode.RESULT_OK;
}
exports.lockAccountChecker = lockAccountChecker;
function transferFromLockAccountChecker(tx) {
    let input = tx.input;
    if (!input || !tx.value.isEqualTo(new index_1.BigNumber(0))) {
        return index_1.ErrorCode.RESULT_INVALID_PARAM;
    }
    if (!index_1.isValidAddress(input.contractid)) {
        return index_1.ErrorCode.RESULT_INVALID_ADDRESS;
    }
    return index_1.ErrorCode.RESULT_OK;
}
exports.transferFromLockAccountChecker = transferFromLockAccountChecker;
function checkAmount(amount) {
    if (util_1.isNullOrUndefined(amount) || !util_1.isString(amount)) {
        return index_1.ErrorCode.RESULT_INVALID_PARAM;
    }
    let bigAmount = new index_1.BigNumber(amount);
    if (!bigAmount.isInteger()) {
        return index_1.ErrorCode.RESULT_NOT_INTEGER;
    }
    if (bigAmount.isNegative()) {
        return index_1.ErrorCode.RESULT_CANT_BE_LESS_THAN_ZERO;
    }
    if (bigAmount.gt(new index_1.BigNumber(1e+36))) {
        return index_1.ErrorCode.RESULT_OUT_OF_RANGE;
    }
    return index_1.ErrorCode.RESULT_OK;
}
exports.checkAmount = checkAmount;
