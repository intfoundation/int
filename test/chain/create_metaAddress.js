var KeyRing = require("../../chainlib/Account/keyring")

//超级账户私钥
let superSecret ="";
let systemAccount = KeyRing.fromSecret();

//generate meta account
let metaAccount = KeyRing.generate();
console.log("meta secret:"+metaAccount.toSecret());
let metaPubKey = metaAccount.getPublicKey();
let sig = systemAccount.signHash(metaPubKey);
console.log("meta sig:"+sig.toString('hex'));