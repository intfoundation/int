"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const util_1 = require("util");
const BN = require('bn.js');
const assert = require("assert");
const error_code_1 = require("../error_code");
exports.INT32_MAX = 0xffffffff;
// 我们测试时保证1分钟一块，每10块调整一次难度
// //每次重新计算难度的间隔块，BTC为2016, 
// export const retargetInterval = 10;
// //每个难度的理想持续时间，BTC为14 * 24 * 60 * 60, 单位和timestamp单位相同，seconds
// export const targetTimespan = 1 * 60;
// //初始bits,BTC为486604799， 对应的hash值为'00000000ffff0000000000000000000000000000000000000000000000000000'
// //我们设定为'0000ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'
// export const basicBits = 520159231;
// //最小难度
// export const limit = new BN('0000ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff', 'hex');
function onCheckGlobalOptions(globalOptions) {
    if (util_1.isNullOrUndefined(globalOptions.retargetInterval)) {
        return false;
    }
    if (util_1.isNullOrUndefined(globalOptions.targetTimespan)) {
        return false;
    }
    if (util_1.isNullOrUndefined(globalOptions.basicBits)) {
        return false;
    }
    if (util_1.isNullOrUndefined(globalOptions.limit)) {
        return false;
    }
    return true;
}
exports.onCheckGlobalOptions = onCheckGlobalOptions;
/**
 * Convert a compact number to a big number.
 * Used for `block.bits` -> `target` conversion.
 * @param {Number} compact
 * @returns {BN}
 */
function fromCompact(compact) {
    if (compact === 0) {
        return new BN(0);
    }
    const exponent = compact >>> 24;
    const negative = (compact >>> 23) & 1;
    let mantissa = compact & 0x7fffff;
    let num;
    if (exponent <= 3) {
        mantissa >>>= 8 * (3 - exponent);
        num = new BN(mantissa);
    }
    else {
        num = new BN(mantissa);
        num.iushln(8 * (exponent - 3));
    }
    if (negative) {
        num.ineg();
    }
    return num;
}
exports.fromCompact = fromCompact;
/**
 * Convert a big number to a compact number.
 * Used for `target` -> `block.bits` conversion.
 * @param {BN} num
 * @returns {Number}
 */
function toCompact(num) {
    if (num.isZero()) {
        return 0;
    }
    let exponent = num.byteLength();
    let mantissa;
    if (exponent <= 3) {
        mantissa = num.toNumber();
        mantissa <<= 8 * (3 - exponent);
    }
    else {
        mantissa = num.ushrn(8 * (exponent - 3)).toNumber();
    }
    if (mantissa & 0x800000) {
        mantissa >>= 8;
        exponent++;
    }
    let compact = (exponent << 24) | mantissa;
    if (num.isNeg()) {
        compact |= 0x800000;
    }
    compact >>>= 0;
    return compact;
}
exports.toCompact = toCompact;
/**
 * Verify proof-of-work.
 * @param {Hash} hash
 * @param {Number} bits
 * @returns {Boolean}
 */
function verifyPOW(hash, bits) {
    let target = fromCompact(bits);
    if (target.isNeg() || target.isZero()) {
        return false;
    }
    let targetHash = target.toBuffer('be', 32);
    return hash.compare(targetHash) < 1;
}
exports.verifyPOW = verifyPOW;
function retarget(prevbits, actualTimespan, chain) {
    let target = fromCompact(prevbits);
    if (actualTimespan < (chain.globalOptions.targetTimespan / 4 | 0)) {
        actualTimespan = chain.globalOptions.targetTimespan / 4 | 0;
    }
    if (actualTimespan > chain.globalOptions.targetTimespa * 4) {
        actualTimespan = chain.globalOptions.targetTimespan * 4;
    }
    target.imuln(actualTimespan);
    target.idivn(chain.globalOptions.targetTimespan);
    if (target.gt(new BN(chain.globalOptions.limit, 'hex'))) {
        return chain.globalOptions.basicBits;
    }
    return toCompact(target);
}
exports.retarget = retarget;
async function getTarget(header, chain) {
    // Genesis
    if (header.number === 0) {
        return { err: error_code_1.ErrorCode.RESULT_OK, target: chain.globalOptions.basicBits };
    }
    let prevRet = await chain.getHeader(header.preBlockHash);
    // Genesis
    if (!prevRet.header) {
        return { err: error_code_1.ErrorCode.RESULT_INVALID_BLOCK };
    }
    // Do not retarget
    if ((header.number + 1) % chain.globalOptions.retargetInterval !== 0) {
        return { err: error_code_1.ErrorCode.RESULT_OK, target: prevRet.header.bits };
    }
    // Back 2 weeks
    const height = header.number - (chain.globalOptions.retargetInterval - 1);
    assert(height >= 0);
    let hr = await chain.getHeader(height);
    let retargetFrom;
    if (!hr.err) {
        assert(hr.header);
        retargetFrom = hr.header;
    }
    else if (hr.err === error_code_1.ErrorCode.RESULT_NOT_FOUND) {
        let ghr = await chain.getHeader(header, -(chain.globalOptions.retargetInterval - 1));
        if (ghr.err) {
            return { err: ghr.err };
        }
        assert(ghr.header);
        retargetFrom = ghr.header;
    }
    else {
        return { err: hr.err };
    }
    let newTraget = retarget(prevRet.header.bits, prevRet.header.timestamp - retargetFrom.timestamp, chain);
    return { err: error_code_1.ErrorCode.RESULT_OK, target: newTraget };
}
exports.getTarget = getTarget;
