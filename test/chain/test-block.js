const KeyRing = require("./Account/keyring")
const TX = require("./Transcation/tx")
const CoinView = require("./Coins/coinview")

const Header = require("./Block/headers")
const assert = require('assert');
const Block = require("./Block/block")
const BlockUtil = require("../../chainlib/Block/util")
const config = require("../../chainlib/config")

const HeaderChain = require("./Chain/HeaderChain");

//recover coinbase, tx1 from hex
async function newBlock() {
    let AliceSecret = "";
    let Alice = KeyRing.fromSecret(AliceSecret);

    let BobSecret = "";
    let Bob = KeyRing.fromSecret(BobSecret)

    let systemAccountSecret = "";
    let systemAccount = KeyRing.fromSecret(systemAccountSecret);
    
    let coinbase = TX.createCoinbase([{ address: Alice.getAddress(), amount: 15000 }], systemAccount);
    assert(coinbase.verify());

    let genesisBlock = Block.fromRaw(config.genesisBlockRaw);

    let newBlock = await BlockUtil.createBlock(Header.fromBlock(genesisBlock), headerChain);
}

newBlock();

let coinbaseraw = Buffer.from("01000000010000000000000000000000000000000000000000000000000000000000000000ffffffff2451144372656174652044656d6f20436f696e6261736504121e5407080000000000000000ffffffff01983a0000000000001976a914d096b5400ff6737967ca8a64dad00a4e6fce8d4688ac00000000", 'hex')
let tx1raw = Buffer.from("010000000149e4950c9330ee28622348c68f7ddaf896da223ea7a5ddf45fc29454355f2377000000006a47304402206392724985ea97d96cfc25e2ebca0e7ee3cd5dcc25fb628b7b5b4500be46fc3c0220548c18f52e2f8a0c76424ffd9aa0adaf7984e66dcd6897979d946f69b126d47f012103676bc872ddcd2dc055e0b187cf7a3bd38187bad6b3b111c4b9989189ecd7c13affffffff0210270000000000001976a9145934cdbbef0d54c69b8680f147b9da16ce2461a588ac88130000000000001976a914d096b5400ff6737967ca8a64dad00a4e6fce8d4688ac00000000", 'hex')
let coinbase = TX.fromRaw(coinbaseraw)
let tx1 = TX.fromRaw(tx1raw)

let coinview = new CoinView()
coinview.addTX(coinbase, -1)
coinview.addTX(tx1, -1)
assert(coinbase.verify(coinview))
assert(tx1.verify(coinview))
//Alice want create a new block
let AliceSecret = "";
let Alice = KeyRing.fromSecret(AliceSecret);
//we need prev Block hash(or genesis block hash) to create new block
let genesisBlock = Block.fromRaw(Buffer.from(config.genesisBlockRaw, "hex"))
//hack old height temperoly
genesisBlock.height = 0
let genesisBlockHeader = Header.fromBlock(genesisBlock)
let headerChain = new HeaderChain()

let newBlock1 = BlockUtil.createBlock(genesisBlockHeader, headerChain)
newBlock1.txs.push(coinbase);
newBlock1.txs.push(tx1);
newBlock1.makeMerkleRoot();
assert(BlockUtil.verifyBlock(newBlock1, genesisBlockHeader, headerChain, coinview))