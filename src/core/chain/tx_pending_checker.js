"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const index_1 = require("../index");
const util_1 = require("util");
function createTokenChecker(tx) {
    let input = tx.input;
    let tokenid = index_1.addressFromPublicKey(index_1.encodeAddressAndNonce(tx.address, tx.nonce));
    if (!input || !input.tokenid || !input.name || !input.symbol || !tx.value.isEqualTo(new index_1.BigNumber(0)) || util_1.isNullOrUndefined(input.amount) || !util_1.isString(input.amount)) {
        return index_1.ErrorCode.RESULT_INVALID_PARAM;
    }
    if (!index_1.isValidAddress(input.tokenid) || tokenid !== input.tokenid) {
        return index_1.ErrorCode.RESULT_INVALID_ADDRESS;
    }
    if (!(new index_1.BigNumber(input.amount).isInteger())) {
        return index_1.ErrorCode.RESULT_NOT_INTEGER;
    }
    if (new index_1.BigNumber(input.amount).isNegative()) {
        return index_1.ErrorCode.RESULT_CANT_BE_LESS_THAN_ZERO;
    }
    if (new index_1.BigNumber(input.amount).gt(new index_1.BigNumber(1e+36))) {
        return index_1.ErrorCode.RESULT_OUT_OF_RANGE;
    }
    return index_1.ErrorCode.RESULT_OK;
}
exports.createTokenChecker = createTokenChecker;
function transferTokenToChecker(tx) {
    let input = tx.input;
    if (!input || !input.tokenid || !input.to || !tx.value.isEqualTo(new index_1.BigNumber(0)) || util_1.isNullOrUndefined(input.amount) || !util_1.isString(input.amount)) {
        return index_1.ErrorCode.RESULT_INVALID_PARAM;
    }
    if (!index_1.isValidAddress(input.tokenid) || !index_1.isValidAddress(input.to)) {
        return index_1.ErrorCode.RESULT_INVALID_ADDRESS;
    }
    if (!(new index_1.BigNumber(input.amount).isInteger())) {
        return index_1.ErrorCode.RESULT_NOT_INTEGER;
    }
    if (new index_1.BigNumber(input.amount).isNegative()) {
        return index_1.ErrorCode.RESULT_CANT_BE_LESS_THAN_ZERO;
    }
    return index_1.ErrorCode.RESULT_OK;
}
exports.transferTokenToChecker = transferTokenToChecker;
function transferFromChecker(tx) {
    let input = tx.input;
    if (!input || !input.tokenid || !input.from || !input.to || !tx.value.isEqualTo(new index_1.BigNumber(0)) || util_1.isNullOrUndefined(input.amount) || !util_1.isString(input.amount)) {
        return index_1.ErrorCode.RESULT_INVALID_PARAM;
    }
    if (!index_1.isValidAddress(input.tokenid) || !index_1.isValidAddress(input.from) || !index_1.isValidAddress(input.to)) {
        return index_1.ErrorCode.RESULT_INVALID_ADDRESS;
    }
    if (!(new index_1.BigNumber(input.amount).isInteger())) {
        return index_1.ErrorCode.RESULT_NOT_INTEGER;
    }
    if (new index_1.BigNumber(input.amount).isNegative()) {
        return index_1.ErrorCode.RESULT_CANT_BE_LESS_THAN_ZERO;
    }
    return index_1.ErrorCode.RESULT_OK;
}
exports.transferFromChecker = transferFromChecker;
function approveChecker(tx) {
    let input = tx.input;
    if (!input || !input.tokenid || !input.spender || !tx.value.isEqualTo(new index_1.BigNumber(0)) || util_1.isNullOrUndefined(input.amount) || !util_1.isString(input.amount)) {
        return index_1.ErrorCode.RESULT_INVALID_PARAM;
    }
    if (!index_1.isValidAddress(input.tokenid) || !index_1.isValidAddress(input.spender)) {
        return index_1.ErrorCode.RESULT_INVALID_ADDRESS;
    }
    if (!(new index_1.BigNumber(input.amount).isInteger())) {
        return index_1.ErrorCode.RESULT_NOT_INTEGER;
    }
    if (new index_1.BigNumber(input.amount).isNegative()) {
        return index_1.ErrorCode.RESULT_CANT_BE_LESS_THAN_ZERO;
    }
    return index_1.ErrorCode.RESULT_OK;
}
exports.approveChecker = approveChecker;
function freezeAccountChecker(tx) {
    let input = tx.input;
    if (!input || !input.tokenid || !input.freezeAddress || !tx.value.isEqualTo(new index_1.BigNumber(0))) {
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
    if (!input || !input.tokenid || !tx.value.isEqualTo(new index_1.BigNumber(0)) || util_1.isNullOrUndefined(input.amount) || !util_1.isString(input.amount)) {
        return index_1.ErrorCode.RESULT_INVALID_PARAM;
    }
    if (!index_1.isValidAddress(input.tokenid)) {
        return index_1.ErrorCode.RESULT_INVALID_ADDRESS;
    }
    if (!(new index_1.BigNumber(input.amount).isInteger())) {
        return index_1.ErrorCode.RESULT_NOT_INTEGER;
    }
    if (new index_1.BigNumber(input.amount).isNegative()) {
        return index_1.ErrorCode.RESULT_CANT_BE_LESS_THAN_ZERO;
    }
    return index_1.ErrorCode.RESULT_OK;
}
exports.burnChecker = burnChecker;
function mintTokenChecker(tx) {
    let input = tx.input;
    if (!input || !input.tokenid || !tx.value.isEqualTo(new index_1.BigNumber(0)) || util_1.isNullOrUndefined(input.amount) || !util_1.isString(input.amount)) {
        return index_1.ErrorCode.RESULT_INVALID_PARAM;
    }
    if (!index_1.isValidAddress(input.tokenid)) {
        return index_1.ErrorCode.RESULT_INVALID_ADDRESS;
    }
    if (!(new index_1.BigNumber(input.amount).isInteger())) {
        return index_1.ErrorCode.RESULT_NOT_INTEGER;
    }
    if (new index_1.BigNumber(input.amount).isNegative()) {
        return index_1.ErrorCode.RESULT_CANT_BE_LESS_THAN_ZERO;
    }
    return index_1.ErrorCode.RESULT_OK;
}
exports.mintTokenChecker = mintTokenChecker;
function transferOwnershipChecker(tx) {
    let input = tx.input;
    if (!input || !input.tokenid || !input.newOwner || !tx.value.isEqualTo(new index_1.BigNumber(0))) {
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
    if (!input || !input.to) {
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
    if (!input || !util_1.isArray(input.candidates) || !tx.value.isEqualTo(new index_1.BigNumber(0))) {
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
    if (!input || !tx.value.isEqualTo(input.amount) || util_1.isNullOrUndefined(input.amount) || !util_1.isString(input.amount)) {
        return index_1.ErrorCode.RESULT_INVALID_PARAM;
    }
    if (!(new index_1.BigNumber(input.amount).isInteger())) {
        return index_1.ErrorCode.RESULT_NOT_INTEGER;
    }
    if (new index_1.BigNumber(input.amount).isNegative()) {
        return index_1.ErrorCode.RESULT_CANT_BE_LESS_THAN_ZERO;
    }
    return index_1.ErrorCode.RESULT_OK;
}
exports.mortgageChecker = mortgageChecker;
function unmortgageChecker(tx) {
    let input = tx.input;
    if (!input || !tx.value.isEqualTo(new index_1.BigNumber(0)) || util_1.isNullOrUndefined(input.amount) || !util_1.isString(input.amount)) {
        return index_1.ErrorCode.RESULT_INVALID_PARAM;
    }
    if (!(new index_1.BigNumber(input.amount).isInteger())) {
        return index_1.ErrorCode.RESULT_NOT_INTEGER;
    }
    if (new index_1.BigNumber(input.amount).isNegative()) {
        return index_1.ErrorCode.RESULT_CANT_BE_LESS_THAN_ZERO;
    }
    return index_1.ErrorCode.RESULT_OK;
}
exports.unmortgageChecker = unmortgageChecker;
function registerChecker(tx) {
    let input = tx.input;
    if (!input || !input.coinbase || !tx.value.isEqualTo(new index_1.BigNumber(0))) {
        return index_1.ErrorCode.RESULT_INVALID_PARAM;
    }
    if (!index_1.isValidAddress(input.coinbase)) {
        return index_1.ErrorCode.RESULT_INVALID_ADDRESS;
    }
    return index_1.ErrorCode.RESULT_OK;
}
exports.registerChecker = registerChecker;
function publishChecker(tx) {
    let input = tx.input;
    if (!input || !input.name || util_1.isNullOrUndefined(input.name) || !input.duation || input.duation <= 0 || !input.lowest || !(input.lowest instanceof index_1.BigNumber)) {
        return index_1.ErrorCode.RESULT_INVALID_PARAM;
    }
    return index_1.ErrorCode.RESULT_OK;
}
exports.publishChecker = publishChecker;
function bidChecker(tx) {
    let input = tx.input;
    if (!input || !input.name || util_1.isNullOrUndefined(input.name)) {
        return index_1.ErrorCode.RESULT_INVALID_PARAM;
    }
    return index_1.ErrorCode.RESULT_OK;
}
exports.bidChecker = bidChecker;
function lockAccountChecker(tx) {
    let input = tx.input;
    let lockBalance = new index_1.BigNumber(0);
    let contractid = index_1.addressFromPublicKey(index_1.encodeAddressAndNonce(tx.address, tx.nonce));
    if (!input || !input.contractid || !input.lockaddress || !input.schedule || !util_1.isArray(input.schedule) || (input.schedule.length > 20)) {
        return index_1.ErrorCode.RESULT_INVALID_PARAM;
    }
    if (!index_1.isValidAddress(input.contractid) || !index_1.isValidAddress(input.lockaddress) || contractid !== input.contractid) {
        return index_1.ErrorCode.RESULT_INVALID_ADDRESS;
    }
    for (let item of input.schedule) {
        if (!util_1.isObject(item) || util_1.isNullOrUndefined(item.time) || util_1.isNullOrUndefined(item.value) || !util_1.isNumber(item.time) || (item.time.toString().length < 13) || !util_1.isString(item.value)) {
            return index_1.ErrorCode.RESULT_INVALID_PARAM;
        }
        if (!(new index_1.BigNumber(item.value).isInteger())) {
            return index_1.ErrorCode.RESULT_NOT_INTEGER;
        }
        if ((new index_1.BigNumber(item.value).isNegative())) {
            return index_1.ErrorCode.RESULT_CANT_BE_LESS_THAN_ZERO;
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
    if (!input || !input.contractid || !tx.value.isEqualTo(new index_1.BigNumber(0))) {
        return index_1.ErrorCode.RESULT_INVALID_PARAM;
    }
    if (!index_1.isValidAddress(input.contractid)) {
        return index_1.ErrorCode.RESULT_INVALID_ADDRESS;
    }
    return index_1.ErrorCode.RESULT_OK;
}
exports.transferFromLockAccountChecker = transferFromLockAccountChecker;
