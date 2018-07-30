'use strict';

const BlockUtil = require('./Block/util');
const Block = require('./Block/block');
const KeyRing = require('./Account/keyring');
const assert = require('assert');
const config = require('./config');
const {Info,MetaInfo} = require('./Infos/Info');
const TX = require('../chainlib/Transcation/tx');

let account1 = KeyRing.fromSecret('L5RhP7KP5yXaswf6iLKZCJrateUpp1qHvKMADPrae72MJWgXa9jm');
let pk1 = account1.getPublicKey();
let account2 = KeyRing.fromSecret('L3TrBuLMmq61oRwfdgnLo4bXb7fe7UBnRBBS2KHi9fCozPke9NUj');
let pk2 = account2.getPublicKey();
let account3 = KeyRing.fromSecret('L147rbcnDxTsJVENi7cXsUWRytdey6f4PB2fXYSXgeDSu2vnwukU');
let pk3 = account3.getPublicKey();
let account4 = KeyRing.fromSecret('KytsgXNJMcPdh48qfi6UvtYdNBupyJdpf2p3dsSULeUPPiCxGHPi');
let pk4 = account4.getPublicKey();
let account5 = KeyRing.fromSecret('KyRZQcBDi6CAX4LqA4mxURSWzT8dJURdhPtdfnyxcQPHU5j9xxWC');
let pk5 = account5.getPublicKey();

let metas = [{
    pubkey:pk1,
    number:1
},
    {
        pubkey:pk2,
        number:2
    },
    {
        pubkey:pk3,
        number:3
    },
    {
        pubkey:pk4,
        number:4
    },
    {
        pubkey:pk5,
        number:5
    },
];

let systemSecret = 'KxzxXbHPf2oiMURvMk94NyKn8ncSXPvGERDNaXvf8vLqweXabJJt';

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

