"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const bignumber_js_1 = require("bignumber.js");
function toWei(value) {
    return new bignumber_js_1.BigNumber(value).multipliedBy(new bignumber_js_1.BigNumber(10).pow(18));
}
exports.toWei = toWei;
function fromWei(value) {
    return new bignumber_js_1.BigNumber(value).div(new bignumber_js_1.BigNumber(10).pow(18));
}
exports.fromWei = fromWei;
function toCoin(value) {
    return new bignumber_js_1.BigNumber(value).div(new bignumber_js_1.BigNumber(10).pow(18));
}
exports.toCoin = toCoin;
function fromCoin(value) {
    return new bignumber_js_1.BigNumber(value).multipliedBy(new bignumber_js_1.BigNumber(10).pow(18));
}
exports.fromCoin = fromCoin;
