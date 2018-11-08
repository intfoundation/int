/*!
 * digest.js - hash functions for bcoin
 * Copyright (c) 2014-2017, Christopher Jeffrey (MIT License).
 * https://github.com/bcoin-org/bcoin
 */
'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * @module crypto.digest
 */
const assert = require('assert');
const crypto = require('crypto');
const POOL64 = Buffer.allocUnsafe(64);
/**
 * Hash with chosen algorithm.
 * @param {String} alg
 * @param {Buffer} data
 * @returns {Buffer}
 */
function hash(alg, data) {
    return crypto.createHash(alg).update(data).digest();
}
exports.hash = hash;
/**
 * Hash with ripemd160.
 * @param {Buffer} data
 * @returns {Buffer}
 */
function ripemd160(data) {
    return hash('ripemd160', data);
}
exports.ripemd160 = ripemd160;
/**
 * Hash with sha1.
 * @param {Buffer} data
 * @returns {Buffer}
 */
function sha1(data) {
    return hash('sha1', data);
}
exports.sha1 = sha1;
function md5(data) {
    return hash('md5', data);
}
exports.md5 = md5;
/**
 * Hash with sha256.
 * @param {Buffer} data
 * @returns {Buffer}
 */
function sha256(data) {
    return hash('sha256', data);
}
exports.sha256 = sha256;
/**
 * Hash with sha256 and ripemd160 (OP_HASH160).
 * @param {Buffer} data
 * @returns {Buffer}
 */
function hash160(data) {
    return ripemd160(exports.sha256(data));
}
exports.hash160 = hash160;
/**
 * Hash with sha256 twice (OP_HASH256).
 * @param {Buffer} data
 * @returns {Buffer}
 */
function hash256(data) {
    return sha256(exports.sha256(data));
}
exports.hash256 = hash256;
/**
 * Hash left and right hashes with hash256.
 * @param {Buffer} left
 * @param {Buffer} right
 * @returns {Buffer}
 */
function root256(left, right) {
    const data = POOL64;
    assert(left.length === 32);
    assert(right.length === 32);
    left.copy(data, 0);
    right.copy(data, 32);
    return hash256(data);
}
exports.root256 = root256;
/**
 * Create an HMAC.
 * @param {String} alg
 * @param {Buffer} data
 * @param {Buffer} key
 * @returns {Buffer} HMAC
 */
function hmac(alg, data, key) {
    const ctx = crypto.createHmac(alg, key);
    return ctx.update(data).digest();
}
exports.hmac = hmac;
