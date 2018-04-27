let KeyRing = require("../../chainlib/Account/keyring");
let TX = require("../../chainlib/Transcation/tx");
let assert = require('assert');
let Coin = require("../../chainlib/Coins/coin");
let MTX = require("../../chainlib/Transcation/mtx");
let CoinView = require("../../chainlib/Coins/coinview");
let {Info, MetaInfo} = require('../../chainlib/Infos/Info');
/*
function getWitnessHash(items) {
  const nonce = encoding.ZERO_HASH;
  const leaves = [];

  leaves.push(encoding.ZERO_HASH);

  for (const item of items)
    leaves.push(item.tx.witnessHash());

  const [root, malleated] = merkle.createRoot(leaves);

  assert(!malleated);

  return digest.root256(root, nonce);
};
*/

//create a CoinView(UTXO Collections) to verify tx
/*
let coinview = new CoinView();

//create Alice and Bob Account
 let AliceSecret = "";
 let Alice = KeyRing.fromSecret(AliceSecret);

 let BobSecret = "";
 let Bob = KeyRing.fromSecret(BobSecret)

 let systemAccountSecret = "";
 let systemAccount = KeyRing.fromSecret(systemAccountSecret);
let AliceAddress = Alice.getAddress()
let BobAddress = Bob.getAddress()

console.log("Alice account:"+AliceAddress)
console.log("Bob account:"+BobAddress)

//Create coinbase, 15000 to Alice
//this is witnesshash of empty Array
let coinbase = TX.createCoinbase([{address:AliceAddress, amount:15000}], systemAccount);
console.log("tx1 txid:"+coinbase.txid());
console.log('tx1 coinflag:'+coinbase.getCoinbaseFlag());
assert(coinbase.verify())

//Create tx1, Alice Send 10000 to Bob

let utxo1 = Coin.fromTX(coinbase, 0, -1)
coinview.addCoin(utxo1)
console.log("utxo1 txid:"+utxo1.txid())
let mtx1 = new MTX()
mtx1.addCoin(utxo1)
mtx1.addOutput(BobAddress, 10000)
mtx1.addOutput(AliceAddress, 5000)
mtx1.sign(Alice)
assert(mtx1.verify())
let tx1 = mtx1.toTX()
console.log("tx2 id:"+tx1.txid())

let coinbaseraw = coinbase.toRaw()
let tx1raw = tx1.toRaw()
let tx1string = tx1raw.toString('hex')
console.log("coinbase raw:"+coinbaseraw.toString('hex'))
console.log("tx1 raw:"+tx1string)

//SomeOne Recv coinbase and tx1, Verify it
//new client own new coinbase
let coinview2 = new CoinView()
let recvTx1 = TX.fromRaw(coinbaseraw)
let recvTx2 = TX.fromRaw(tx1raw)
console.log("recv_tx1 id:"+recvTx1.txid())
console.log("recv_tx2 id:"+recvTx2.txid())
assert(recvTx1.txid() === coinbase.txid())
assert(recvTx2.txid() === tx1.txid())
coinview2.addTX(recvTx1, -1)
coinview2.addTX(recvTx2, -1)
assert(recvTx1.verify(coinview2))
assert(recvTx2.verify(coinview2))
console.log("pass coinbase tx1 verify")
*/
let meta1 = new MetaInfo('metanode1', 0);
let AliceSecret = "";
let Alice = KeyRing.fromSecret(AliceSecret);
let dataTX = TX.createDataTX(meta1.toRaw(), Alice);
assert(dataTX.verify());
assert(dataTX.isSane());
let dataTXRaw = dataTX.toRaw();
let dataTX1 = TX.fromRaw(dataTXRaw);
assert(dataTX1.verify());
assert(dataTX1.isSane());
let meta2 = Info.fromRaw(dataTX1.getData());
assert(meta2.getType() === Info.type.METAINFO);
console.log(meta2);