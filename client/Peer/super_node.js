const DPackage = require('./package');
const AccountNode = require('./account_node');
const BlockUtil = require("../../src/chainlib/Block/util");
const TX = require('../../src/chainlib/Transcation/tx');

const Address = require('../../src/chainlib/Account/address');
const Input = require('../../src/chainlib/Transcation/input');
const util = require('../../src/chainlib/Utils/util');
const encoding = require('../../src/chainlib/Utils/encoding');
const Output = require('../../src/chainlib/Transcation/output');

const RPCServer = require('../RPC/RPCServer');

const assert = require('assert');

class SuperNode extends AccountNode {
    constructor(params) {
        super(params);
        //this.m_state = SuperNode.STATE.init;
        this.m_txCache = [];
        this.rpcPort = params.rpcPort;
        this.createBlockInterval = 10 * 60 * 1000;
        this.devmode = params.devmode;

        this.maxBlockSize = 1024*1024*2;//2MB
    }


    async create() {
        await this._create();

        this.startRPCServer(this.rpcPort);
        if (!this.devmode) {
            this.beginCreateBlock();
        }
    }

    beginCreateBlock() {
        this.createBlockTimer = setTimeout(()=>{
            this._newBlock();
            //TODO：如果一个新Block产生后，还有堆积的tx，是否要加快出块速度？
            this.beginCreateBlock();
        }, this.createBlockInterval);
    }

    _onPkg(conn, pkg) {
        if (pkg.header.cmdType === DPackage.CMD_TYPE.getHeader) {
            this._onGetHeader(conn, pkg.body.start, pkg.body.len);
        } else if (pkg.header.cmdType === DPackage.CMD_TYPE.getBlock) {
            this._onGetBlock(conn, pkg.body.hash);
        } else if (pkg.header.cmdType === DPackage.CMD_TYPE.getUTXO) {

        } else if (pkg.header.cmdType === DPackage.CMD_TYPE.tx) {
            let txRaw = null;
            if (pkg.data.length > 1) {
                txRaw = Buffer.concat(pkg.data);
            } else {
                txRaw = pkg.data[0];
            }
            let tx = TX.fromRaw(txRaw);
            this._onTX(tx);
        }
    }

    _onTX(tx) {
        //verify tx first
        if (!tx.isSane() || !tx.verify(this.m_coinView)) {
            return;
        }
        this.m_txCache.push(tx);
        //supernode出块，现在就修改当前的coinview，下一个tx来的时候直接验证是否双花
        this.m_coinView.spendTX(tx);
        this.m_coinView.addTX(tx, -1);
        if (this.devmode) {
            this._newBlock();
        }
    }

    async _onGetHeader(conn, start, len) {
        let headersRaw = await this.m_headerChain.getHeadersRaw(start, start + len - 1);
        if (headersRaw) {
            DPackage.createStreamWriter({ cmdType: DPackage.CMD_TYPE.header }, null, headersRaw.length).writeData(headersRaw).bind(conn);
        } else {
            DPackage.createStreamWriter({ cmdType: DPackage.CMD_TYPE.header }, null, null).bind(conn);
        }
    }

    async _onGetBlock(conn, hash) {
        let block = this.m_blockStorage.get(hash);
        let blockRaw = block.toRaw();
        DPackage.createStreamWriter({ cmdType: DPackage.CMD_TYPE.block }, null, blockRaw.length).writeData(blockRaw).bind(conn);
    }

    //only for test method, remove later
    noCoinbase() {
        return this.m_headerChain.getNowHeight() === 0;
    }

    async _newBlock() {
        if (this.m_txCache.length === 0) {
            return;
        }

        let latestHeader = await this.m_headerChain.getHeaderByHeight(this.m_headerChain.getNowHeight());
        let newBlock = await BlockUtil.createBlock(latestHeader, this.m_headerChain);

        //sort txCache
        //按Fee从大到小排列
        this.m_txCache.sort((a, b) => {
            let aFee = a.getFee();
            let bFee = b.getFee();
            if (aFee > bFee) {
                return -1;
            } else if (aFee === bFee) {
                return 0;
            } else {
                return 1;
            }
        });

        let blockTXSize = 0;
        while (this.m_txCache.length !== 0) {
            let tx = this.m_txCache.shift();
            newBlock.txs.push(tx);
            blockTXSize += tx.getSize();
            if (blockTXSize >= this.maxBlockSize) {
                break;
            }
        }
        
        newBlock.makeMerkleRoot();
        //sign this block by systemAccount
        newBlock.signCreator(this.m_account);
        await this.storageBlock(newBlock);
        //broadcast lateat 5 headers
        let headersRaw = await this.m_headerChain.getHeadersRaw(this.m_headerChain.getNowHeight() - 4, 5);
        this._broadcast(DPackage.createStreamWriter({ cmdType: DPackage.CMD_TYPE.header }, null, headersRaw.length).writeData(headersRaw), 32);
    }

    _createCoinbase(targets, creatorAccount) {
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

    startRPCServer(port) {
        let server = new RPCServer('0.0.0.0', port);

        server.on('createCoinbase', async (args, resp) => {
            //args = outputArray : [{address:addressStr, amount:amount}, {address:addressStr, amount:amount}]
            await this.createCoinBase(args);
            resp.write('success!');
            resp.end();
        });

        server.on('getNowBlockHeight', (args, resp) => {
            resp.write(this.m_headerChain.getNowHeight().toString());
            resp.end();
        });

        server.Start();
    }

    //createCoinBase([{address:addressObj/addressStr, amount:amount}, {address:addressObj/addressStr, amount:amount}])
    async createCoinBase(targets) {
        let coinbase = this._createCoinbase(targets, this.m_account);
        if (coinbase) {
            this._onTX(coinbase);
        }
    }


    close() {

    }

}

module.exports = SuperNode;
