"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const secp256k1 = require('secp256k1');
const { randomBytes } = require('crypto');
const digest = require("./lib/digest");
const staticwriter_1 = require("./lib/staticwriter");
const base58 = require("./lib/base58");
const util_1 = require("util");
const client_1 = require("../client");
// prefix can identify different network
// will be readed from consensus params
const defaultPrefix = 0x00;
function pubKeyToBCFormat(publickey) {
    const keyHash = digest.hash160(publickey);
    const size = 5 + keyHash.length;
    const bw = new staticwriter_1.StaticWriter(size);
    bw.writeU8(defaultPrefix);
    bw.writeBytes(keyHash);
    bw.writeChecksum();
    return bw.render();
}
function signBufferMsg(msg, key) {
    // Sign message
    let sig = secp256k1.sign(msg, key);
    // Ensure low S value
    return secp256k1.signatureNormalize(sig.signature);
}
exports.signBufferMsg = signBufferMsg;
function verifyBufferMsg(msg, sig, key) {
    if (sig.length === 0) {
        return false;
    }
    if (key.length === 0) {
        return false;
    }
    try {
        sig = secp256k1.signatureNormalize(sig);
        return secp256k1.verify(msg, sig, key);
    }
    catch (e) {
        return false;
    }
}
exports.verifyBufferMsg = verifyBufferMsg;
function addressFromPublicKey(publicKey) {
    if (util_1.isString(publicKey)) {
        publicKey = Buffer.from(publicKey, 'hex');
    }
    return base58.encode(pubKeyToBCFormat(publicKey));
}
exports.addressFromPublicKey = addressFromPublicKey;
function publicKeyFromSecretKey(secret) {
    if (util_1.isString(secret)) {
        secret = Buffer.from(secret, 'hex');
    }
    if (!secp256k1.privateKeyVerify(secret)) {
        return;
    }
    const key = secp256k1.publicKeyCreate(secret, true);
    return key;
}
exports.publicKeyFromSecretKey = publicKeyFromSecretKey;
function addressFromSecretKey(secret) {
    let publicKey = publicKeyFromSecretKey(secret);
    if (publicKey) {
        return addressFromPublicKey(publicKey);
    }
}
exports.addressFromSecretKey = addressFromSecretKey;
function createKeyPair() {
    let privateKey;
    do {
        privateKey = randomBytes(32);
    } while (!secp256k1.privateKeyVerify(privateKey));
    const key = secp256k1.publicKeyCreate(privateKey, true);
    return [key, privateKey];
}
exports.createKeyPair = createKeyPair;
function sign(md, secret) {
    if (util_1.isString(secret)) {
        secret = Buffer.from(secret, 'hex');
    }
    if (util_1.isString(md)) {
        md = Buffer.from(md, 'hex');
    }
    return signBufferMsg(md, secret);
}
exports.sign = sign;
function verify(md, signature, publicKey) {
    if (util_1.isString(md)) {
        md = Buffer.from(md, 'hex');
    }
    return verifyBufferMsg(md, signature, publicKey);
}
exports.verify = verify;
function isValidAddress(address) {
    let buf = base58.decode(address);
    if (buf.length !== 25) {
        return false;
    }
    let br = new client_1.BufferReader(buf);
    br.readU8();
    br.readBytes(20);
    try {
        br.verifyChecksum();
    }
    catch (error) {
        return false;
    }
    return true;
}
exports.isValidAddress = isValidAddress;
