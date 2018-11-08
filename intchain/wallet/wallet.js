"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const readline = require("readline");
const process = require("process");
const client_1 = require("../../src/client");
client_1.initUnhandledRejection(client_1.initLogger({ loggerOptions: { console: true } }));
function main() {
    let command = client_1.parseCommand(process.argv);
    if (!command) {
        console.error('invalid command');
        process.exit();
        return;
    }
    let secret = command.options.get('secret');
    if (!secret) {
        console.error('no scret');
        process.exit();
        return;
    }
    let address = client_1.addressFromSecretKey(secret);
    let host = command.options.get('host');
    let port = command.options.get('port');
    if (!host || !port) {
        console.error('no host');
        process.exit();
        return;
    }
    let chainClient = new client_1.ChainClient({
        host,
        port,
        logger: client_1.initLogger({ loggerOptions: { console: true } })
    });
    let watchingTx = [];
    chainClient.on('tipBlock', async (tipBlock) => {
        console.log(`client onTipBlock, height ${tipBlock.number}`);
        for (let tx of watchingTx.slice()) {
            let { err, block, receipt } = await chainClient.getTransactionReceipt({ tx });
            if (!err) {
                if (receipt.returnCode !== 0) {
                    console.error(`tx:${tx} failed for ${receipt.returnCode}`);
                    watchingTx.splice(watchingTx.indexOf(tx), 1);
                }
                else {
                    let confirm = tipBlock.number - block.number + 1;
                    if (confirm < 6) {
                        console.log(`tx:${tx} ${confirm} confirm`);
                    }
                    else {
                        console.log(`tx:${tx} confirmed`);
                        watchingTx.splice(watchingTx.indexOf(tx), 1);
                    }
                }
            }
        }
    });
    let runEnv = {
        getAddress: () => {
            console.log(address);
        },
        getBalance: async (_address) => {
            if (!_address) {
                _address = address;
            }
            let ret = await chainClient.view({
                method: 'getBalance',
                params: { address: _address }
            });
            if (ret.err) {
                console.error(`get balance failed for ${ret.err};`);
                return;
            }
            console.log(`${_address}\`s Balance: ${ret.value}`);
        },
        getTokenBalance: async (tokenid, _address) => {
            if (!_address) {
                _address = address;
            }
            let ret = await chainClient.view({
                method: 'getBalance',
                params: { address: _address, tokenid }
            });
            if (ret.err) {
                console.error(`get ${_address}\`s Token ${tokenid} balance failed for ${ret.err};`);
                return;
            }
            console.log(`${_address}\`s Token ${tokenid} Balance: ${ret.value}`);
        },
        createToken: async (tokenid, preBalances, amount, limit, price) => {
            let tx = new client_1.ValueTransaction();
            tx.method = 'createToken',
                tx.value = new client_1.BigNumber(amount);
            tx.limit = new client_1.BigNumber(limit);
            tx.price = new client_1.BigNumber(price);
            tx.input = { tokenid, preBalances };
            let { err, nonce } = await chainClient.getNonce({ address });
            if (err) {
                console.error(`transferTo getNonce failed for ${err}`);
                return;
            }
            tx.nonce = nonce + 1;
            tx.sign(secret);
            let sendRet = await chainClient.sendTransaction({ tx });
            if (sendRet.err) {
                console.error(`transferTo failed for ${sendRet.err}`);
                return;
            }
            console.log(`send transferTo tx: ${tx.hash}`);
            watchingTx.push(tx.hash);
        },
        transferTokenTo: async (tokenid, to, amount, limit, price) => {
            let tx = new client_1.ValueTransaction();
            tx.method = 'transferTokenTo',
                tx.limit = new client_1.BigNumber(limit);
            tx.price = new client_1.BigNumber(price);
            tx.input = { tokenid, to, amount };
            let { err, nonce } = await chainClient.getNonce({ address });
            if (err) {
                console.error(`transferTo getNonce failed for ${err}`);
                return;
            }
            tx.nonce = nonce + 1;
            tx.sign(secret);
            let sendRet = await chainClient.sendTransaction({ tx });
            if (sendRet.err) {
                console.error(`transferTo failed for ${sendRet.err}`);
                return;
            }
            console.log(`send transferTo tx: ${tx.hash}`);
            watchingTx.push(tx.hash);
        },
        transferTo: async (to, amount, limit, price) => {
            let tx = new client_1.ValueTransaction();
            tx.method = 'transferTo',
                tx.value = new client_1.BigNumber(amount);
            tx.limit = new client_1.BigNumber(limit);
            tx.price = new client_1.BigNumber(price);
            tx.input = { to };
            let { err, nonce } = await chainClient.getNonce({ address });
            if (err) {
                console.error(`transferTo getNonce failed for ${err}`);
                return;
            }
            tx.nonce = nonce + 1;
            tx.sign(secret);
            let sendRet = await chainClient.sendTransaction({ tx });
            if (sendRet.err) {
                console.error(`transferTo failed for ${sendRet.err}`);
                return;
            }
            console.log(`send transferTo tx: ${tx.hash}`);
            watchingTx.push(tx.hash);
        },
        vote: async (candidates, limit, price) => {
            let tx = new client_1.ValueTransaction();
            tx.method = 'vote';
            tx.limit = new client_1.BigNumber(limit);
            tx.price = new client_1.BigNumber(price);
            tx.input = candidates;
            let { err, nonce } = await chainClient.getNonce({ address });
            if (err) {
                console.error(`vote getNonce failed for ${err}`);
                return;
            }
            tx.nonce = nonce + 1;
            tx.sign(secret);
            let sendRet = await chainClient.sendTransaction({ tx });
            if (sendRet.err) {
                console.error(`vote failed for ${sendRet.err}`);
                return;
            }
            console.log(`send vote tx: ${tx.hash}`);
            watchingTx.push(tx.hash);
        },
        mortgage: async (amount, limit, price) => {
            let tx = new client_1.ValueTransaction();
            tx.method = 'mortgage';
            tx.limit = new client_1.BigNumber(limit);
            tx.price = new client_1.BigNumber(price);
            tx.value = new client_1.BigNumber(amount);
            tx.input = amount;
            let { err, nonce } = await chainClient.getNonce({ address });
            if (err) {
                console.error(`mortgage getNonce failed for ${err}`);
                return;
            }
            tx.nonce = nonce + 1;
            tx.sign(secret);
            let sendRet = await chainClient.sendTransaction({ tx });
            if (sendRet.err) {
                console.error(`mortgage failed for ${sendRet.err}`);
                return;
            }
            console.log(`send mortgage tx: ${tx.hash}`);
            watchingTx.push(tx.hash);
        },
        unmortgage: async (amount, limit, price) => {
            let tx = new client_1.ValueTransaction();
            tx.method = 'unmortgage';
            tx.limit = new client_1.BigNumber(limit);
            tx.price = new client_1.BigNumber(price);
            tx.input = amount;
            let { err, nonce } = await chainClient.getNonce({ address });
            if (err) {
                console.error(`unmortgage getNonce failed for ${err}`);
                return;
            }
            tx.nonce = nonce + 1;
            tx.sign(secret);
            let sendRet = await chainClient.sendTransaction({ tx });
            if (sendRet.err) {
                console.error(`unmortgage failed for ${sendRet.err}`);
                return;
            }
            console.log(`send unmortgage tx: ${tx.hash}`);
            watchingTx.push(tx.hash);
        },
        register: async (limit, price) => {
            let tx = new client_1.ValueTransaction();
            tx.method = 'register';
            tx.limit = new client_1.BigNumber(limit);
            tx.price = new client_1.BigNumber(price);
            tx.input = '';
            let { err, nonce } = await chainClient.getNonce({ address });
            if (err) {
                console.error(`register getNonce failed for ${err}`);
                return;
            }
            tx.nonce = nonce + 1;
            tx.sign(secret);
            let sendRet = await chainClient.sendTransaction({ tx });
            if (sendRet.err) {
                console.error(`register failed for ${sendRet.err}`);
                return;
            }
            console.log(`send register tx: ${tx.hash}`);
            watchingTx.push(tx.hash);
        },
        getVote: async () => {
            let ret = await chainClient.view({
                method: 'getVote',
                params: {}
            });
            if (ret.err) {
                console.error(`getVote failed for ${ret.err};`);
                return;
            }
            let vote = client_1.MapFromObject(ret.value);
            for (let [k, v] of vote) {
                console.log(`${k}:${v.toString()}`);
            }
        },
        getStoke: async (_address) => {
            let ret = await chainClient.view({
                method: 'getStoke',
                params: { address: _address }
            });
            if (ret.err) {
                console.error(`getStoke failed for ${ret.err};`);
                return;
            }
            console.log(`${ret.value}`);
        },
        getCandidates: async () => {
            let ret = await chainClient.view({
                method: 'getCandidates',
                params: {}
            });
            if (ret.err) {
                console.error(`getCandidates failed for ${ret.err};`);
                return;
            }
            console.log(`${ret.value}`);
        },
    };
    function runCmd(_cmd) {
        let chain = runEnv;
        try {
            eval(_cmd);
        }
        catch (e) {
            console.error('e=' + e.message);
        }
    }
    let cmd = command.options.get('run');
    if (cmd) {
        runCmd(cmd);
    }
    let rl = readline.createInterface(process.stdin, process.stdout);
    rl.on('line', (_cmd) => {
        runCmd(_cmd);
    });
}
main();
