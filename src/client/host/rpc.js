"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const rpc_server_1 = require("../lib/rpc_server");
const fs = require("fs-extra");
const path = require("path");
const os = require("os");
const core_1 = require("../../core");
const addressClass = require("../../core/address");
const util_1 = require("util");
const crypt = require('../../core/lib/crypt');
function promisify(f) {
    return () => {
        let args = Array.prototype.slice.call(arguments);
        return new Promise((resolve, reject) => {
            args.push((err, result) => {
                if (err) {
                    reject(err);
                }
                else {
                    resolve(result);
                }
            });
            f.apply(null, args);
        });
    };
}
class ChainServer {
    constructor(logger, chain, miner) {
        this.m_chain = chain;
        this.m_miner = miner;
        this.m_logger = logger;
    }
    init(commandOptions) {
        let host = commandOptions.get('rpchost');
        if (!host) {
            return false;
        }
        let port = commandOptions.get('rpcport');
        if (!port) {
            return false;
        }
        this.m_server = new rpc_server_1.RPCServer(host, parseInt(port, 10));
        this._initMethods();
        this.m_server.start();
        return true;
    }
    _initMethods() {
        this.m_server.on('sendTransaction', async (params, resp) => {
            let tx = new core_1.ValueTransaction();
            //签名相关的逻辑
            let fromAddress = params.from;
            let password = params.password;
            let err = core_1.ErrorCode.RESULT_OK;
            let keyStore;
            if (!util_1.isString(params.value) || !util_1.isString(params.limit) || !util_1.isString(params.price)) {
                err = core_1.ErrorCode.RESULT_INVALID_PARAM;
            }
            else {
                tx.method = params.method;
                tx.value = new core_1.BigNumber(params.value);
                tx.limit = new core_1.BigNumber(params.limit);
                tx.price = new core_1.BigNumber(params.price);
                tx.input = params.input;
                //根据from地址获取用户对应的keystore文件
                let filePath = process.cwd() + "/data/keystore";
                let homePath = os.homedir();
                let dirPath = __dirname;
                // 如果是命令行启动，则用新的路径替换掉 process.cwd()获得的路径
                if (dirPath.indexOf('node_modules') !== -1) {
                    filePath = path.join(homePath, "/Library/", "INTChain/keystore/");
                }
                if (os.platform() === 'win32') {
                    if (dirPath.indexOf('node_modules') !== -1) {
                        homePath = homePath.replace(/\\/g, '\/');
                        filePath = path.join(homePath, '/AppData/Roaming/', 'INTChain/keystore/');
                    }
                    else {
                        let cwd = process.cwd();
                        cwd = cwd.replace(/\\/g, '\/');
                        filePath = cwd + '/data/keystore/';
                    }
                }
                let files = await fs.readdir(filePath);
                let status = core_1.ErrorCode.RESULT_OK;
                let exc = new RegExp(fromAddress);
                for (let fileName of files) {
                    if (exc.test(fileName)) {
                        let temp = path.join(filePath, fileName);
                        let data = await fs.readFile(temp, "utf-8");
                        keyStore = JSON.parse(data);
                        break;
                    }
                }
                if (!keyStore) {
                    err = core_1.ErrorCode.RESULT_ADDRESS_NOT_EXIST;
                }
                if (!err && (!keyStore.address || (keyStore.address != fromAddress))) {
                    err = core_1.ErrorCode.RESULT_KEYSTORE_ERROR;
                }
            }
            if (err) {
                await promisify(resp.write.bind(resp)(JSON.stringify({ err: err })));
            }
            else {
                let privateKey;
                try {
                    privateKey = crypt.decrypt(keyStore, password);
                }
                catch (e) {
                    this.m_logger.debug(`rpc server sendTransaction decrypt keystore err ${e}`);
                }
                if (privateKey) {
                    let { err, nonce } = await this.m_chain.getNonce(fromAddress);
                    tx.nonce = nonce + 1;
                    tx.sign(privateKey.privateKey);
                    this.m_logger.debug(`rpc server txhash=${tx.hash}, nonce=${tx.nonce}, address=${tx.address}`);
                    err = await this.m_chain.addTransaction(tx);
                    if (err) {
                        await promisify(resp.write.bind(resp)(JSON.stringify({ err })));
                    }
                    else {
                        await promisify(resp.write.bind(resp)(JSON.stringify({ err, hash: tx.hash })));
                    }
                }
                else {
                    await promisify(resp.write.bind(resp)(JSON.stringify({ err: core_1.ErrorCode.RESULT_KEYSTORE_ERROR })));
                }
            }
            await promisify(resp.end.bind(resp)());
        });
        this.m_server.on('newAccount', async (params, resp) => {
            let password = params.password;
            let privateKey = params.privateKey;
            let err = core_1.ErrorCode.RESULT_OK;
            let address;
            let privKey;
            if (!util_1.isNullOrUndefined(privateKey) && !addressClass.isValidSecretKey(privateKey)) {
                err = core_1.ErrorCode.RESULT_INVALID_PARAM;
            }
            else {
                if (password) {
                    if (!util_1.isNullOrUndefined(privateKey) && addressClass.isValidSecretKey(privateKey)) {
                        privKey = privateKey;
                        address = addressClass.addressFromSecretKey(privKey);
                    }
                    else {
                        let [key, secret] = addressClass.createKeyPair();
                        privKey = secret.toString('hex');
                        address = addressClass.addressFromPublicKey(key);
                    }
                    let keystore;
                    try {
                        keystore = crypt.encrypt(privKey, password);
                    }
                    catch (e) {
                        this.m_logger.debug(`rpc server newAccount encrypt keystore err ${e}`);
                    }
                    if (keystore) {
                        keystore.address = address;
                        let jsonKeystore = JSON.stringify(keystore);
                        let fileName = new Date().toISOString() + '--' + address + '.json';
                        let keyPath = process.cwd() + '/data/keystore/';
                        let homePath = os.homedir();
                        let dirPath = __dirname;
                        // 如果是命令行启动，则用新的路径替换掉 process.cwd()获得的路径
                        if (dirPath.indexOf('node_modules') !== -1) {
                            keyPath = path.join(homePath, "/Library/", "INTChain/keystore/");
                        }
                        if (os.platform() === 'win32') {
                            fileName = address + '.json';
                            if (dirPath.indexOf('node_modules') !== -1) {
                                homePath = homePath.replace(/\\/g, '\/');
                                keyPath = path.join(homePath, '/AppData/Roaming/', 'INTChain/keystore/');
                            }
                            else {
                                let cwd = process.cwd();
                                cwd = cwd.replace(/\\/g, '\/');
                                keyPath = cwd + '/data/keystore/';
                            }
                        }
                        if (!fs.existsSync(keyPath)) {
                            this.makeDirSync(keyPath);
                        }
                        try {
                            fs.writeFileSync(keyPath + fileName, jsonKeystore);
                        }
                        catch (e) {
                            this.m_logger.error(`write keystore failed, error:` + e);
                            err = core_1.ErrorCode.RESULT_EXCEPTION;
                        }
                    }
                    else {
                        err = core_1.ErrorCode.RESULT_KEYSTORE_ERROR;
                    }
                }
                else {
                    err = core_1.ErrorCode.RESULT_INVALID_PARAM;
                }
            }
            if (err) {
                await promisify(resp.write.bind(resp)(JSON.stringify({ err: err })));
            }
            else {
                await promisify(resp.write.bind(resp)(JSON.stringify({ err: err, address: address })));
            }
            await promisify(resp.end.bind(resp)());
        });
        this.m_server.on('getAccounts', async (params, resp) => {
            let keyPath = process.cwd() + '/data/keystore/';
            let homePath = os.homedir();
            let dirPath = __dirname;
            // 如果是命令行启动，则用新的路径替换掉 process.cwd()获得的路径
            if (dirPath.indexOf('node_modules') !== -1) {
                keyPath = path.join(homePath, "/Library/", "INTChain/keystore/");
            }
            if (os.platform() === 'win32') {
                if (dirPath.indexOf('node_modules') !== -1) {
                    homePath = homePath.replace(/\\/g, '\/');
                    keyPath = path.join(homePath, '/AppData/Roaming/', 'INTChain/keystore/');
                }
                else {
                    let cwd = process.cwd();
                    cwd = cwd.replace(/\\/g, '\/');
                    keyPath = cwd + '/data/keystore/';
                }
            }
            if (!fs.existsSync(keyPath)) {
                this.makeDirSync(keyPath);
            }
            fs.readdir(keyPath, async (err, files) => {
                if (err) {
                    this.m_logger.error(`read keystore files filed, error:` + err);
                    await promisify(resp.write.bind(resp)(JSON.stringify({ err: core_1.ErrorCode.RESULT_NOT_FOUND })));
                }
                else {
                    let accounts = [];
                    for (let fileName of files) {
                        let address = '';
                        let indexINT = fileName.indexOf('INT');
                        let indexPoint = fileName.lastIndexOf('.');
                        if (indexINT !== -1 && indexPoint !== -1) {
                            address = fileName.substring(indexINT, indexPoint);
                            if (accounts.indexOf(address) === -1 && addressClass.isValidAddress(address)) {
                                accounts.push(address);
                            }
                        }
                    }
                    accounts.sort();
                    await promisify(resp.write.bind(resp)(JSON.stringify({ err: core_1.ErrorCode.RESULT_OK, accounts: accounts })));
                }
                await promisify(resp.end.bind(resp)());
            });
        });
        this.m_server.on('sendSignedTransaction', async (params, resp) => {
            let tx = new core_1.ValueTransaction();
            let err = tx.decode(new core_1.BufferReader(Buffer.from(params.tx, 'hex')));
            if (err) {
                await promisify(resp.write.bind(resp)(JSON.stringify({ err: err })));
            }
            else {
                this.m_logger.debug(`rpc server txhash=${tx.hash}, nonce=${tx.nonce}, address=${tx.address}`);
                err = await this.m_chain.addTransaction(tx);
                if (err) {
                    await promisify(resp.write.bind(resp)(JSON.stringify({ err: err })));
                }
                else {
                    await promisify(resp.write.bind(resp)(JSON.stringify({ err: err, hash: tx.hash })));
                }
            }
            await promisify(resp.end.bind(resp)());
        });
        this.m_server.on('getTransactionReceipt', async (params, resp) => {
            let cr = await this.m_chain.getTransactionReceipt(params.tx);
            if (cr.err) {
                await promisify(resp.write.bind(resp)(JSON.stringify({ err: cr.err })));
            }
            else {
                await promisify(resp.write.bind(resp)(JSON.stringify({
                    err: core_1.ErrorCode.RESULT_OK,
                    block: cr.block.stringify(),
                    tx: cr.tx.stringify(),
                    receipt: cr.receipt.stringify()
                })));
            }
            await promisify(resp.end.bind(resp)());
        });
        this.m_server.on('getNonce', async (params, resp) => {
            let nonce = await this.m_chain.getNonce(params.address);
            await promisify(resp.write.bind(resp)(JSON.stringify(nonce)));
            await promisify(resp.end.bind(resp)());
        });
        this.m_server.on('getPendingTransactions', async (params, resp) => {
            let pendingTransactions = await this.m_chain.getPendingTransactions();
            await promisify(resp.write.bind(resp)(JSON.stringify(pendingTransactions)));
            await promisify(resp.end.bind(resp)());
        });
        this.m_server.on('getTransactionByAddress', async (params, resp) => {
            let cr = await this.m_chain.getTransactionByAddress(params.address);
            if (cr.err) {
                this.m_logger.error(`get transaction by address ${params.address} failed for ${cr.err}`);
                await promisify(resp.write.bind(resp)(JSON.stringify({ err: cr.err })));
            }
            else {
                await promisify(resp.write.bind(resp)(JSON.stringify({ err: core_1.ErrorCode.RESULT_OK, txs: cr.txs })));
            }
            await promisify(resp.end.bind(resp)());
        });
        this.m_server.on('view', async (params, resp) => {
            let cr = await this.m_chain.view(util_1.isUndefined(params.from) ? 'latest' : params.from, params.method, params.params);
            if (cr.err) {
                await promisify(resp.write.bind(resp)(JSON.stringify({ err: cr.err })));
            }
            else {
                let s;
                try {
                    s = core_1.toStringifiable(cr.value, true);
                    cr.value = s;
                }
                catch (e) {
                    this.m_logger.error(`call view ${params} returns ${cr.value} isn't stringifiable`);
                    cr.err = core_1.ErrorCode.RESULT_INVALID_FORMAT;
                    delete cr.value;
                }
                await promisify(resp.write.bind(resp)(JSON.stringify(cr)));
            }
            await promisify(resp.end.bind(resp)());
        });
        this.m_server.on('getBlock', async (params, resp) => {
            let hr = await this.m_chain.getHeader(params.which);
            if (hr.err) {
                await promisify(resp.write.bind(resp)(JSON.stringify({ err: hr.err })));
            }
            else {
                let l = this.m_chain.handler.getMinerWageListener();
                let wage = await l(hr.header.number);
                let header = hr.header.stringify();
                header.wage = wage;
                // 是否返回 block的transactions内容
                if (params.transactions && typeof params.transactions === 'boolean') {
                    let block = await this.m_chain.getBlock(hr.header.hash);
                    if (block) {
                        // 处理block content 中的transaction, 然后再响应请求
                        let transactions = block.content.transactions.map((tr) => tr.stringify());
                        let res = { err: core_1.ErrorCode.RESULT_OK, block: header, transactions };
                        await promisify(resp.write.bind(resp)(JSON.stringify(res)));
                    }
                }
                else {
                    await promisify(resp.write.bind(resp)(JSON.stringify({ err: core_1.ErrorCode.RESULT_OK, block: header })));
                }
            }
            await promisify(resp.end.bind(resp))();
        });
        this.m_server.on('getPeers', async (args, resp) => {
            let peers = this.m_chain.node.getNetwork().node.dumpConns();
            await promisify(resp.write.bind(resp)(JSON.stringify(peers)));
            await promisify(resp.end.bind(resp)());
        });
        this.m_server.on('getLastIrreversibleBlockNumber', async (args, resp) => {
            let num = this.m_chain.getLIB().number;
            await promisify(resp.write.bind(resp)(JSON.stringify(num)));
            await promisify(resp.end.bind(resp)());
        });
        this.m_server.on('isValidAddress', async (params, resp) => {
            let isV = addressClass.isValidAddress(params.address);
            await promisify(resp.write.bind(resp)(JSON.stringify(isV)));
            await promisify(resp.end.bind(resp)());
        });
        this.m_server.on('getPrice', async (args, resp) => {
            let curPrice = this.m_chain.getPrice();
            await promisify(resp.write.bind(resp)(JSON.stringify(curPrice)));
            await promisify(resp.end.bind(resp)());
        });
        this.m_server.on('getTransactionLimit', async (params, resp) => {
            let limit = this.m_chain.calcTxLimit(params.method, params.input);
            await promisify(resp.write.bind(resp)(JSON.stringify(limit)));
            await promisify(resp.end.bind(resp)());
        });
        this.m_server.on('createContractAddress', async (params, resp) => {
            let { err, nonce } = await this.m_chain.getNonce(params.address);
            if (err) {
                await promisify(resp.write.bind(resp)(JSON.stringify({ err: err })));
                await promisify(resp.end.bind(resp)());
            }
            let address = addressClass.addressFromPublicKey(core_1.encodeAddressAndNonce(params.address, nonce + 1));
            await promisify(resp.write.bind(resp)(JSON.stringify({ err: core_1.ErrorCode.RESULT_OK, contract: address })));
            await promisify(resp.end.bind(resp)());
        });
        this.m_server.on('getTransactionHash', async (params, resp) => {
            let tx = new core_1.ValueTransaction();
            let err = core_1.ErrorCode.RESULT_OK;
            this.m_logger.debug(`rpc server getTransactionHash method=${params.method}, nonce=${params.nonce}, publicKey=${params.publicKey}, input=${params.input}, value=${params.value}, limit=${params.limit}, price=${params.price}`);
            if (!util_1.isString(params.value) || !util_1.isString(params.limit) || !util_1.isString(params.price)) {
                err = core_1.ErrorCode.RESULT_INVALID_PARAM;
            }
            tx.method = params.method;
            tx.nonce = params.nonce;
            tx.input = params.input;
            try {
                tx.publicKey = Buffer.from(params.publicKey, 'hex');
                tx.value = new core_1.BigNumber(params.value);
                tx.limit = new core_1.BigNumber(params.limit);
                tx.price = new core_1.BigNumber(params.price);
                tx.updateHash();
                this.m_logger.debug(`rpc server getTransactionHash tx=`, tx);
            }
            catch (e) {
                err = core_1.ErrorCode.RESULT_INVALID_FORMAT;
            }
            if (err) {
                await promisify(resp.write.bind(resp)(JSON.stringify({ err: err })));
            }
            else {
                await promisify(resp.write.bind(resp)(JSON.stringify({ err: err, hash: tx.hash })));
            }
            await promisify(resp.end.bind(resp)());
        });
        this.m_server.on('sendTransactionWithSignature', async (params, resp) => {
            let tx = new core_1.ValueTransaction();
            let err = core_1.ErrorCode.RESULT_OK;
            this.m_logger.debug(`rpc server sendTransactionWithSignature method=${params.method}, nonce=${params.nonce}, publicKey=${params.publicKey}, signature=${params.signature} input=${params.input}, value=${params.value}, limit=${params.limit}, price=${params.price}, hash=${params.hash}`);
            if (!util_1.isString(params.value) || !util_1.isString(params.limit) || !util_1.isString(params.price)) {
                err = core_1.ErrorCode.RESULT_INVALID_PARAM;
            }
            tx.method = params.method;
            tx.nonce = params.nonce;
            tx.input = params.input;
            try {
                tx.publicKey = Buffer.from(params.publicKey, 'hex');
                tx.signature = Buffer.from(params.signature, 'hex');
                tx.value = new core_1.BigNumber(params.value);
                tx.limit = new core_1.BigNumber(params.limit);
                tx.price = new core_1.BigNumber(params.price);
                tx.updateHash();
                this.m_logger.debug(`rpc server sendTransactionWithSignature tx=`, tx);
                if (tx.hash !== params.hash) {
                    this.m_logger.debug(`rpc server sendTransactionWithSignature txhash=${tx.hash}, params.hash=${params.hash}`);
                    err = core_1.ErrorCode.RESULT_INVALID_FORMAT;
                } else {
                    let verifyResult = addressClass.verify(tx.hash, tx.signature, tx.publicKey);
                    if (!verifyResult) {
                        err = core_1.ErrorCode.RESULT_VERIFY_NOT_MATCH;
                        this.m_logger.error(`rpc server sendTransactionWithSignature error signature verify fail, txhash=${tx.hash}, nonce=${tx.nonce}, address=${tx.address}`);
                    }
                }

                if (!err) {
                    this.m_logger.debug(`rpc server sendTransactionWithSignature txhash=${tx.hash}, nonce=${tx.nonce}, address=${tx.address}`);
                    err = await this.m_chain.addTransaction(tx);
                }
            }
            catch (e) {
                err = core_1.ErrorCode.RESULT_INVALID_FORMAT;
            }
            if (err) {
                await promisify(resp.write.bind(resp)(JSON.stringify({ err: err })));
            }
            else {
                await promisify(resp.write.bind(resp)(JSON.stringify({ err: err, hash: tx.hash })));
            }
            await promisify(resp.end.bind(resp)());
        });
    }
    makeDirSync(p) {
        if (fs.existsSync(p)) {
            return true;
        }
        else {
            if (this.makeDirSync(path.dirname(p))) {
                fs.mkdirSync(p);
                return true;
            }
        }
    }
}
exports.ChainServer = ChainServer;
