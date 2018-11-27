"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const index_1 = require("../index");
const util_1 = require("util");
function createTokenChecker(tx) {
    let input = tx.input;
    if (!input || !input.tokenid || !input.amount || !input.name || !input.symbol) {
        return index_1.ErrorCode.RESULT_INVALID_PARAM;
    }
    if (!index_1.isValidAddress(input.tokenid)) {
        return index_1.ErrorCode.RESULT_INVALID_ADDRESS;
    }
    if (!index_1.BigNumber.isBigNumber(input.amount)) {
        return index_1.ErrorCode.RESULT_NOT_BIGNUMBER;
    }
    if (!input.amount.isInteger()) {
        return index_1.ErrorCode.RESULT_NOT_INTEGER;
    }
    if (input.amount.isNegative()) {
        return index_1.ErrorCode.RESULT_CANT_BE_LESS_THAN_ZERO;
    }
    return index_1.ErrorCode.RESULT_OK;
}
exports.createTokenChecker = createTokenChecker;
function transferTokenToChecker(tx) {
    let input = tx.input;
    if (!input || !input.tokenid || !input.to || !input.amount) {
        return index_1.ErrorCode.RESULT_INVALID_PARAM;
    }
    if (!index_1.isValidAddress(input.tokenid) || !index_1.isValidAddress(input.to)) {
        return index_1.ErrorCode.RESULT_INVALID_ADDRESS;
    }
    if (!index_1.BigNumber.isBigNumber(input.amount)) {
        return index_1.ErrorCode.RESULT_NOT_BIGNUMBER;
    }
    if (!input.amount.isInteger()) {
        return index_1.ErrorCode.RESULT_NOT_INTEGER;
    }
    if (input.amount.isNegative()) {
        return index_1.ErrorCode.RESULT_CANT_BE_LESS_THAN_ZERO;
    }
    return index_1.ErrorCode.RESULT_OK;
}
exports.transferTokenToChecker = transferTokenToChecker;
function transferFromChecker(tx) {
    let input = tx.input;
    if (!input || !input.tokenid || !input.from || !input.to || !input.amount) {
        return index_1.ErrorCode.RESULT_INVALID_PARAM;
    }
    if (!index_1.isValidAddress(input.tokenid) || !index_1.isValidAddress(input.from) || !index_1.isValidAddress(input.to)) {
        return index_1.ErrorCode.RESULT_INVALID_ADDRESS;
    }
    if (!index_1.BigNumber.isBigNumber(input.amount)) {
        return index_1.ErrorCode.RESULT_NOT_BIGNUMBER;
    }
    if (!input.amount.isInteger()) {
        return index_1.ErrorCode.RESULT_NOT_INTEGER;
    }
    if (input.amount.isNegative()) {
        return index_1.ErrorCode.RESULT_CANT_BE_LESS_THAN_ZERO;
    }
    return index_1.ErrorCode.RESULT_OK;
}
exports.transferFromChecker = transferFromChecker;
function approveChecker(tx) {
    let input = tx.input;
    if (!input || !input.tokenid || !input.spender || !input.amount) {
        return index_1.ErrorCode.RESULT_INVALID_PARAM;
    }
    if (!index_1.isValidAddress(input.tokenid) || !index_1.isValidAddress(input.spender)) {
        return index_1.ErrorCode.RESULT_INVALID_ADDRESS;
    }
    if (!index_1.BigNumber.isBigNumber(input.amount)) {
        return index_1.ErrorCode.RESULT_NOT_BIGNUMBER;
    }
    if (!input.amount.isInteger()) {
        return index_1.ErrorCode.RESULT_NOT_INTEGER;
    }
    if (input.amount.isNegative()) {
        return index_1.ErrorCode.RESULT_CANT_BE_LESS_THAN_ZERO;
    }
    return index_1.ErrorCode.RESULT_OK;
}
exports.approveChecker = approveChecker;
function freezeAccountChecker(tx) {
    let input = tx.input;
    if (!input || !input.tokenid || !input.freezeAddress) {
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
    if (!input || !input.tokenid || !input.amount) {
        return index_1.ErrorCode.RESULT_INVALID_PARAM;
    }
    if (!index_1.isValidAddress(input.tokenid)) {
        return index_1.ErrorCode.RESULT_INVALID_ADDRESS;
    }
    if (!index_1.BigNumber.isBigNumber(input.amount)) {
        return index_1.ErrorCode.RESULT_NOT_BIGNUMBER;
    }
    if (!input.amount.isInteger()) {
        return index_1.ErrorCode.RESULT_NOT_INTEGER;
    }
    if (input.amount.isNegative()) {
        return index_1.ErrorCode.RESULT_CANT_BE_LESS_THAN_ZERO;
    }
    return index_1.ErrorCode.RESULT_OK;
}
exports.burnChecker = burnChecker;
function mintTokenChecker(tx) {
    let input = tx.input;
    if (!input || !input.tokenid || !input.amount) {
        return index_1.ErrorCode.RESULT_INVALID_PARAM;
    }
    if (!index_1.isValidAddress(input.tokenid)) {
        return index_1.ErrorCode.RESULT_INVALID_ADDRESS;
    }
    if (!index_1.BigNumber.isBigNumber(input.amount)) {
        return index_1.ErrorCode.RESULT_NOT_BIGNUMBER;
    }
    if (!input.amount.isInteger()) {
        return index_1.ErrorCode.RESULT_NOT_INTEGER;
    }
    if (input.amount.isNegative()) {
        return index_1.ErrorCode.RESULT_CANT_BE_LESS_THAN_ZERO;
    }
    return index_1.ErrorCode.RESULT_OK;
}
exports.mintTokenChecker = mintTokenChecker;
function transferOwnershipChecker(tx) {
    let input = tx.input;
    if (!input || !input.tokenid || !input.newOwner) {
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
    if (!input || !util_1.isArray(input.candidates)) {
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
    if (!input || !input.amount) {
        return index_1.ErrorCode.RESULT_INVALID_PARAM;
    }
    if (!index_1.BigNumber.isBigNumber(input.amount)) {
        return index_1.ErrorCode.RESULT_NOT_BIGNUMBER;
    }
    if (!input.amount.isInteger()) {
        return index_1.ErrorCode.RESULT_NOT_INTEGER;
    }
    if (input.amount.isNegative()) {
        return index_1.ErrorCode.RESULT_CANT_BE_LESS_THAN_ZERO;
    }
    return index_1.ErrorCode.RESULT_OK;
}
exports.mortgageChecker = mortgageChecker;
function unmortgageChecker(tx) {
    let input = tx.input;
    if (!input || !input.amount) {
        return index_1.ErrorCode.RESULT_INVALID_PARAM;
    }
    if (!index_1.BigNumber.isBigNumber(input.amount)) {
        return index_1.ErrorCode.RESULT_NOT_BIGNUMBER;
    }
    if (!input.amount.isInteger()) {
        return index_1.ErrorCode.RESULT_NOT_INTEGER;
    }
    if (input.amount.isNegative()) {
        return index_1.ErrorCode.RESULT_CANT_BE_LESS_THAN_ZERO;
    }
    return index_1.ErrorCode.RESULT_OK;
}
exports.unmortgageChecker = unmortgageChecker;
function registerChecker(tx) {
    let input = tx.input;
    if (!input || !input.coinbase) {
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
