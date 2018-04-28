const DPackage = require('./package');
const AccountNode = require('./account_node');
const Block = require("../../chainlib/Block/block");
const Header = require('../../chainlib/Block/headers');
const BufferReader = require('../../chainlib/Utils/reader');
const KeyRing = require('../../chainlib/Account/keyring');
const Address = require('../../chainlib/Account/address');
const MTX = require('../../chainlib/Transcation/mtx');
const MetaClient = require('../../meta_client/client');
const digest = require('../../chainlib/Crypto/digest');
const WageDB = require('../../db/wage');

const config = require('../../chainlib/config');


class MinerNode extends AccountNode {
    constructor(params) {
        super(params);
        this.m_state = MinerNode.STATE.init;
        this.m_wageDB = new WageDB(params.wagedb);
        this.syncBlockList = [];
        this.syncingBlock = false;
        this.metaClient = new MetaClient(params);
        //TODO: get supernodePeer from metaClient
    }

    async _sendWageProof(proof) {
        let answer = JSON.stringify(proof.answer);
        let sig = this.m_account.signHash(Buffer.from(answer));
        this.metaClient.sendProof(this.m_address.toString(), sig, answer, proof.check.metasig, proof.check.group, async (code, body) => {
            console.log(body);
            if (code === 200 && body.ret) {
                await this.m_wageDB.removeResps(proof.check.metasig);
            }
        });
    }

    async _login() {
        let proof = await this.m_wageDB.getWageProof();
        if (proof) {
            await this._sendWageProof(proof);
        }

        let verifyStr = Date.now().toString();
        let signed = this.m_account.signHash(Buffer.from(verifyStr));
        this.metaClient.login(this.m_address.toString(), verifyStr, signed, async (body) => {
            if (!body) {
                return;
            }
            console.log(body);
            this.m_metaNodeRespBody = body;
            if (this.m_metaNodeRespBody.resp) {
                await this._sendCheck();
            }
        });
    }

    async beginMine() {
        await this.m_wageDB.init();

        setInterval(async () => {
            await this._login();
        }, 60 * 60 * 1000);
        await this._login();
    }

    async syncData() {
        this.changeState(MinerNode.STATE.sync);
        //遍历HeaderChain, 查找差哪些Block
        for (let index = 0; index <= this.m_headerChain.getNowHeight(); index++) {
            let header = await this.m_headerChain.getHeaderByHeight(index);
            let blockHash = header.hash('hex');
            if (!this.m_blockStorage.has(blockHash)) {
                //now: 先从supernode获得所有的block
                this.syncBlockList.push(blockHash);
            }
        }
        //send getheader message to SuperNode
        await this.syncHeader();
        await this.syncBlock();
    }

    async syncHeader() {
        let start = this.m_headerChain.getNowHeight() + 1;
        await this._sendGetHeaderPackage(null, start);
    }

    checkUTXO() {
        let UTXOHeight = this.m_utxos.currentHeight;
        let curHeight = this.m_headerChain.getNowHeight();
        if (UTXOHeight < curHeight) {
            //重新取未更新的block
            for (let index = UTXOHeight + 1; index <= curHeight; index++) {
                let header = this.m_headerChain.getHeaderByHeight(index);
                this.syncBlockList.push(header.hash('hex'));
            }
        }
    }

    async syncBlock() {
        if (this.syncingBlock) {
            return;
        }

        if (this.syncBlockList.length === 0) {
            this.checkUTXO();
        }

        if (this.syncBlockList.length === 0) {
            this.changeState(MinerNode.STATE.running);
            return;
        }

        this.changeState(MinerNode.STATE.sync);
        let blockHash = this.syncBlockList.shift();
        this.syncingBlock = true;

        let conn = await this._getConnToSuperNode();
        DPackage.createStreamWriter({ cmdType: DPackage.CMD_TYPE.getBlock }, { hash: blockHash }, null).bind(conn);

    }

    changeState(newState) {
        if (newState === this.m_state) {
            return;
        }
        let oldState = this.m_state;
        this.m_state = newState;
        this.emit('onStateChange', oldState, this.m_state);
    }

    async create() {
        if (this.m_state !== MinerNode.STATE.init) {
            return Promise.resolve(AccountNode.ERROR.invalidState);
        }
        let err = await this._create();
        if (err) {
            return err;
        }
        console.log('waiting connect to supernode');
        let errors = await this._connectTo([{ peerid: config.SuperNodePeer }], (conn) => {
            // DPackage.createStreamWriter({cmdType: DPackage.CMD_TYPE.getHeader}, );
            console.log(`peer(${this.peerid}) connect to supernode success`);
        });
        if (errors[0]) {
            console.log(`peer(${this.peerid}) connect to supernode failed.`);
            return errors[0];
        }
        this.changeState(MinerNode.STATE.create);
        this.syncData();
        return AccountNode.ERROR.success;
    }

    _isToSuperNode(conn) {
        return conn.remote.peerid === config.SuperNodePeer;
    }

    _getConnToSuperNode() {
        for (let [conn, reader] of this.m_outbound) {
            if (this._isToSuperNode(conn)) {
                return conn;
            }
        }
        return null;
    }

    async _connToSuperNode() {
        let conn = this._getConnToSuperNode();
        if (conn) {
            return conn;
        } else {
            return new Promise((reslove, reject) => {
                this._connectTo([{ peerid: config.SuperNodePeer }], (conn) => {
                    reslove(conn);
                });
            })
        }
    }

    async _sendGetHeaderPackage(conn, start) {
        if (!conn) {
            conn = await this._connToSuperNode();
        }
        DPackage.createStreamWriter({ cmdType: DPackage.CMD_TYPE.getHeader }, { start: start, len: 500 }, 0).bind(conn);
    }

    async _getTXHash(blockIndex, txIndex) {
        let header = await this.m_headerChain.getHeaderByHeight(blockIndex);
        let block = this.m_blockStorage.get(header.hash('hex'));
        let tx = block.txs[txIndex];
        return tx.hash('hex');
    }

    async _onCheck(conn, body) {
        console.log(body);
        let ring = KeyRing.fromPublic(body.pubkey);
        if (ring.verifyHash(body.check, body.sig)) {
            let check = JSON.parse(body.check);
            let txHash = await this._getTXHash(check.block, check.tx);
            let respHash = digest.sha1(txHash + check.metasig + this.m_address.toString()).toString('hex');
            let resp = { 'timestamp': Date.now().toString(), 'resphash': respHash };
            resp = JSON.stringify(resp);
            let sig = this.m_account.signHash(resp);
            let resp_body = { 'pid': this.m_address.toString(), 'pubkey': this.m_account.getPublicKey(), 'sig': sig, 'metasig': check.metasig, 'resp': resp };
            DPackage.createStreamWriter({ cmdType: DPackage.CMD_TYPE.checkResp }, resp_body, null).bind(conn);
        }
    }

    async _onCheckResp(body) {
        console.log(body);
        let ring = KeyRing.fromPublic(body.pubkey);
        if (ring.verifyHash(body.resp, body.sig)) {
            await this.m_wageDB.setResp(body.metasig, body.pid, body.sig.toString('hex'), body.resp);
        }
    }

    async _sendCheck() {
        let nowBlock = this.m_headerChain.getNowHeight();
        let blockIndex = Math.floor(Math.random() * (nowBlock + 1));

        let header = await this.m_headerChain.getHeaderByHeight(blockIndex);
        let block = this.m_blockStorage.get(header.hash('hex'));
        let index = Math.floor(Math.random() * block.txs.length);

        let txHash = await this._getTXHash(blockIndex, index);
        let ret = await this.m_wageDB.setCheck(this.m_metaNodeRespBody.sig, txHash, this.m_metaNodeRespBody.resp);
        if (!ret) {
            return;
        }
        // let tx = block.txs[index];

        let check = { 'version': 0, "metasig": this.m_metaNodeRespBody.sig, "block": blockIndex, "tx": index };
        check = JSON.stringify(check);
        let s = this.m_account.signHash(check);
        let body = { 'pid': this.m_address.toString(), 'pubkey': this.m_account.getPublicKey(), 'sig': s, 'check': check };
        // await wage.setQuestion(body.id, body);
        // for (let member of this.m_GroupInfo.members) {
        let resp = JSON.parse(this.m_metaNodeRespBody.resp);
        for (let member of resp.members) {
            this._connectTo([{ peerid: member }], (conn) => {
                DPackage.createStreamWriter({ cmdType: DPackage.CMD_TYPE.check }, body, null).bind(conn);
            });
        }
    }

    async _onPkg(conn, pkg) {
        switch (pkg.header.cmdType) {
            case DPackage.CMD_TYPE.getHeader: //给对方返回需要的header, 二进制
                {
                    //取[body.start, body.start+body.len)个header, 并Send
                    let headersRaw = await this.m_headerChain.getHeadersRaw(pkg.body.start, pkg.body.start + pkg.body.len - 1);
                    if (headersRaw) {
                        DPackage.createStreamWriter({ cmdType: DPackage.CMD_TYPE.header }, null, headersRaw.length).writeData(headersRaw).bind(conn);
                    } else {
                        DPackage.createStreamWriter({ cmdType: DPackage.CMD_TYPE.header }, null, null).bind(conn);
                    }

                }
                break;
            case DPackage.CMD_TYPE.getBlock:  //给对方返回需要的block，没有的情况下直接关闭
                {
                    //从磁盘或缓存中读取块，返回给对方
                    let blockRaw = this.m_blockStorage.get(pkg.body.hash);
                    if (blockRaw) {
                        DPackage.createStreamWriter({ cmdType: DPackage.CMD_TYPE.header }, null, blockRaw.length).writeData(blockRaw).bind(conn);
                    } else {
                        DPackage.createStreamWriter({ cmdType: DPackage.CMD_TYPE.header }, null, 0).bind(conn);
                    }
                }
                break;
            case DPackage.CMD_TYPE.tx:   //Miner先不接收tx消息
                //是否要先验证这个tx是否正确？
                //this.m_server.broadcastTX(data);
                break;
            case DPackage.CMD_TYPE.header:    //处理得到的Headers，加入HeaderChain
                {
                    if (pkg.dataLength === 0) {
                        //头已经是最新了
                        break;
                    }
                    let reader = new BufferReader(pkg.data[0]);
                    let num = 0;
                    while (reader.left() > 0) {
                        let header = Header.fromReader(reader);
                        console.log(`${this.peerid} get header ${header.height}`);
                        //如果header比当前+1大, 从某个peer上尝试取全部header
                        if (header.height > this.m_headerChain.getNowHeight() + 1) {
                            this.syncHeader();
                            break;
                        }
                        await this.m_headerChain.addHeader(header);
                        num++;

                        //TODO next version: get block in my group
                        //now: get all block not in m_blockStorage
                        let blockHash = header.hash('hex');
                        if (!this.m_blockStorage.has(blockHash)) {
                            //now: 先从supernode获得所有的blocks
                            this.syncBlockList.push(blockHash);
                        }
                    }

                    if (num === 500) {
                        this._sendGetHeaderPackage(conn, this.m_headerChain.getNowHeight());
                    } else {
                        //conn.close();
                    }
                    this.syncBlock();
                }
                break;
            case DPackage.CMD_TYPE.block: //处理得到的包，直接存储？
                {
                    this.syncingBlock = false;

                    //对方没有要求的block
                    if (pkg.dataLength === 0) {
                        return;
                    }

                    let block = Block.fromRaw(pkg.data[0]);
                    if (block.verify()) {
                        await this.processBlock(block);
                        //for test: 触发事件，表示UTXO更新到哪个块了
                        this.emit('onBlock', block.height);
                        if (this.syncBlockList.length === 0) {
                            this.changeState(MinerNode.STATE.running);
                        }
                    }

                    this.syncBlock();

                }
                break;
            case DPackage.CMD_TYPE.check:
                this._onCheck(conn, pkg.body);
                break;
            case DPackage.CMD_TYPE.checkResp:
                this._onCheckResp(pkg.body);
                break;
            default:
                break;
        }
    }

    async spend(senderWIF, outputsArray) {
        let account = KeyRing.fromSecret(senderWIF);
        let address = account.getAddress();
        let mtx = new MTX();
        for (let output of outputsArray) {
            mtx.addOutput(Address.fromString(output.address), output.amount);
        }
        let coins = await this.m_utxos.getCoinsByAddress(address);
        await mtx.fund(coins, { rate: 0, changeAddress: address });
        mtx.sign(account);
        let tx = mtx.toTX();
        //here only send tx to superNode
        let txRaw = tx.toRaw();
        let conn = await this._connToSuperNode();
        DPackage.createStreamWriter({ cmdType: DPackage.CMD_TYPE.tx }, null, txRaw.length).writeData(txRaw).bind(conn);
    }
}

MinerNode.STATE = {
    init: 0,
    create: 1,
    sync: 2,
    running: 3,

};

module.exports = MinerNode;