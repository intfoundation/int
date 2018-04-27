var KeyRing = require("../../chainlib/Account/keyring")
const assert = require("assert")

//创建一个随机账户，Key Ring同时有公钥和私钥
//generate(bool compress, Network|String network), network存储了代表该网络的一些标志，不同标志生成的账户特征不同
let Alice = KeyRing.generate()
let msg = 'test signed msg123123';
let buffer = Alice.signHash(Buffer.from(msg));
assert(Alice.verifyHash(msg, buffer));
let Bob = KeyRing.generate()
//从账户中得到地址对象，generate出的账户总是一个P2PKH（代表某个个人）的账户
let AliceAddress = Alice.getAddress();
console.log("Alice Address:"+AliceAddress)
console.log("Bob Address:"+Bob.getAddress())

//从账户得到wif字符串，可以用该字符串重建账户对象
let AliceWIF = Alice.toSecret();
let BobWIF = Bob.toSecret();
console.log("Alice wif:"+AliceWIF);
console.log("Bob wif:"+BobWIF);
//用刚刚的wif字符串重建账户，address是相同的
let ReAlice = KeyRing.fromSecret(AliceWIF)
let ReBob = KeyRing.fromSecret(BobWIF)
console.log("Re:Alice KeyAddress:"+ReAlice.getKeyAddress())
console.log("Re:Bob KeyAddress:"+ReBob.getKeyAddress())

/*
let system = KeyRing.generate();
let test1 = KeyRing.generate();
let test2 = KeyRing.generate();
let test3 = KeyRing.generate();
console.log("system wif:"+system.toSecret());
console.log("test1 wif:"+test1.toSecret());
console.log("test2 wif:"+test2.toSecret());
console.log("test3 wif:"+test3.toSecret());

console.log("system address:"+system.getAddress());
console.log("test1 address:"+test1.getAddress());
console.log("test2 address:"+test2.getAddress());
console.log("test3 address:"+test3.getAddress());

console.log("system pubkeyhex:"+system.getPublicKey('hex'));
console.log("test1 pubkeyhex:"+test1.getPublicKey('hex'));
console.log("test2 pubkeyhex:"+test2.getPublicKey('hex'));
console.log("test3 pubkeyhex:"+test3.getPublicKey('hex'));
*/