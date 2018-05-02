'use strict';

const BlockUtil = require('./Block/util');
const Block = require('./Block/block');
const KeyRing = require('./Account/keyring');
const assert = require('assert');
const config = require('./config');
const {Info} = require('./Infos/Info');

let bufferFrom = '02ca7385c7a59743c94235b92bfce7f291f8ba9b78175dad06566936a0984b2279';
let metas = [{
    pubkey:Buffer.from(bufferFrom, 'hex'),
    number:1
}];

let systemSecret = '';

let systemKeyRing = KeyRing.fromSecret(systemSecret);
let systemPubKey = systemKeyRing.getPublicKey();

let block = BlockUtil.createGenesisBlock({
    version: 1,
    time: 1512318380,
    systemKey: systemPubKey,
    metas: metas
}, systemKeyRing);

//genesis block dont need metaInfos to verify it
assert(block.verify(null));
//assert(BlockUtil.verifyBlock(block));
console.log("block hash:"+block.hash().toString('hex'));
let blockRaw = block.toRaw();
//let block1 = Block.fromRaw(blockRaw);
console.log('blockraw len: '+blockRaw.length)
let blockhex = blockRaw.toString('hex');
console.log("block hex:"+blockhex);
console.log('blockhex len: '+blockhex.length);


let genesisBlock = Block.fromRaw(Buffer.from(config.genesisBlockRaw, 'hex'));
assert(genesisBlock.verify(null));

let metaNodes = new Map();
for (const tx of genesisBlock.txs) {
    assert(tx.isDataTX());
    if (tx.isDataTX()) {
        let info = Info.fromRaw(tx.getData());
        metaNodes.set(info.number, info.pubkey);
    }
}

for (const meta of metas) {
    assert(metaNodes.get(meta.number).toString() === meta.pubkey.toString());
}

