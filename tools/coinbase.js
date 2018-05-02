const Input = require('../chainlib/Transcation/input');
const Output = require('../chainlib/Transcation/output');
const encoding = require('../chainlib/Utils/encoding');
const util = require('../chainlib/Utils/util');
const Address = require('../chainlib/Account/address');
const KeyRing = require('../chainlib/Account/keyring');
const TX = require('../chainlib/Transcation/tx');
const assert = require('assert');
const RPCClient = require("../client/RPC/RPCClient");

function createCoinBase(targets,ip,port) {
    let account = KeyRing.fromSecret('KxzxXbHPf2oiMURvMk94NyKn8ncSXPvGERDNaXvf8vLqweXabJJt');
    let pubkey = account.getPublicKey().toString('hex');
    let coinbase = _createCoinbase(targets, account);
    let txRaw = coinbase.toRaw();
    if (coinbase) {
        let client = new RPCClient(ip,port);
        client.Call("createCoinbase",{tx:txRaw},(resp,status) => {
            console.log(resp.toString());
        });
    }
}

function _createCoinbase(targets, creatorAccount) {
    if (targets.length === 0) {
        return null;
    }

    const cb = new TX();

    // Coinbase input.
    const input = new Input();

    // Height (required in v2+ blocks)
    input.script.pushInt(0);

    // Coinbase flags.
    input.script.pushData(encoding.ZERO_HASH160);

    // Smaller nonce for good measure.
    input.script.pushData(util.nonce(4));

    // Extra nonce: incremented when
    // the nonce overflows.
    input.script.pushData(encoding.ZERO_U64);

    input.script.compile();

    cb.inputs.push(input);

    //collect all target address
    let targetAddresses = '';

    // Reward output.
    for (let target of targets) {
        const output = new Output();
        output.script.fromPubkeyhash(encoding.ZERO_HASH160);
        output.value = target.amount;//this.getReward();

        // Setup output script (variable size).
        if (!(target.address instanceof Address)) {
            target.address = Address.fromString(target.address);
        }
        output.script.fromAddress(target.address);

        targetAddresses += target.address.toString();

        cb.outputs.push(output);
    }

    // Padding for the CB height (constant size).
    const op = input.script.get(0);
    assert(op);
    const padding = 5 - op.getSize();
    assert(padding >= 0);

    // coinbase flags是所有outputAddress拼接起来再被系统账户signHash的结果
    // Setup coinbase flags (variable size).
    input.script.setData(1, creatorAccount.signHash(Buffer.from(targetAddresses)));
    input.script.compile();

    cb.refresh();

    assert(input.script.getSize() <= 100,
        'Coinbase input script is too large!');

    return cb;
}

process.on('unhandledRejection', error => {
    console.error('unhandledRejection', error);
    process.exit(1)
});

if (process.argv.length < 5) {
    console.log('Usage: node coinbase.js <minerAccountWIF> <amount> <ip> <port>');
}

let ring =  KeyRing.fromSecret(process.argv[2]);
let address = ring.getAddress();
createCoinBase([{address:address, amount:parseInt(process.argv[3])}],process.argv[4],process.argv[5]);


