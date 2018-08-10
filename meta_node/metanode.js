/**
 * 早期MetaNode验证 v0.01
 * 完整的，有独立BDT栈的MetaNode，只有Meta链的功能
 */

const AccountNode = require('../client/Peer/account_node');
const ChainNode = require('../chainlib/Nodes/ChainNode');
const MetaChain = require('../chainlib/Nodes/MetaChain');
const DPackage = require('../client/Peer/package');
const RPCServer = require('../client/RPC/RPCServer');
const MetaDB = require('../db/meta');

const { GroupInfo, ProofInfo } = require('../chainlib/Infos/Info');
const TX = require('../chainlib/Transcation/tx');

const fs = require('fs-extra');
const shuffle = require('shuffle-array');
const Subtract = require('array-subtract');

const assert = require('assert');

const NewBlockDriver = require('../chainlib/Block/newBlockDriver');
const BufferReader = require('../chainlib/Utils/reader');
const Header = require('../chainlib/Block/headers');

const NodeBlockChain = require('../chainlib/Nodes/nodeblockchain');
const MetaBlockChain = require('../chainlib/Nodes/metablockchain');

const TxStorage = require('../chainlib/Transcation/tx_storage');
const Block = require('../chainlib/Block/block');
const KeyRing = require('../chainlib/Account/keyring');

const Input = require('../chainlib/Transcation/input');
const Output = require('../chainlib/Transcation/output');
const encoding = require('../chainlib/Utils/encoding');
const util = require('../chainlib/Utils/util');
const Address = require('../chainlib/Account/address');
const config = require('../chainlib/config');
const {Info} = require('../chainlib/Infos/Info');
const LockSimple = require('../chainlib/Utils/LockSimple');

class MetaNode extends AccountNode {
    constructor(params) {
        super(params);

        this.m_metaChain = new MetaBlockChain(params.metaConfig);
        this.m_nodeChain = new NodeBlockChain(params.nodeConfig);
        this.m_metaTx = new TxStorage(this.m_metaChain.m_chainDB);
        this.m_nodeTx = new TxStorage(this.m_nodeChain.m_chainDB);
        this.m_id = params.number;

        this.m_metaBlockLock = new LockSimple();
        this.m_nodeBlockLock = new LockSimple();

        this.devmode = params.devmode;
        this.rpcPort = params.rpcPort;
        this.sig = params.sig;

        this.newMetaBlockDriver = new NewBlockDriver(params.number, this.m_id, 15*1000, this.m_metaTx,params.devmode);
        this.newChainBlockDriver = new NewBlockDriver(params.number, this.m_id, 10*1000, this.m_nodeTx,params.devmode);

        let metaFilter = (conn) => {
            return this.m_metaChain.peeridIsMeta(conn.remote.peerid);
        };
        this._setFilterByBftType(MetaNode.DBFT_TYPE.register, metaFilter);
        this._setFilterByBftType(MetaNode.DBFT_TYPE.chaintx, metaFilter);
        this._setFilterByBftType(MetaNode.DBFT_TYPE.metatx, metaFilter);
        this._setFilterByBftType(MetaNode.DBFT_TYPE.metablock, metaFilter);
        this._setFilterByBftType(MetaNode.DBFT_TYPE.nodeblock, metaFilter);

        this.changeState(MetaNode.STATE.init);

        this.MetaSign = "meta";
        this.NodeSign = "node";
        this.m_bUpdateBlock = {"meta":false,"node":false,"meta_timerid":0,"node_timerid":0};
        this.m_bUpdateHeader = {"meta":false,"node":false,"meta_timerid":0,"node_timerid":0};

        this.verifyInfo = {
            height: 0,
            time: 0,
        };

        let timerid = 0;
        let _doConn = async (peerid) => {
            if (timerid !== 0) {
                return true;
            }
            let [ret, conn] = await this.getConnToPeer(peerid);
            if (conn) {
                return true;
            }
            return await new Promise((resolve) => {
                timerid = setInterval( async () => {
                    let [ret, conn] = await this.getConnToPeer(peerid);
            if (!conn) {
                return;
            }
            clearInterval(timerid);
            timerid = 0;
            resolve(true);
        },2000);
        });
        };

        this.on('OnRemoveConn',(peerid) => {
            let conn = this._getConn(peerid);
        console.log(`[meta_node.js MetaNode] OnRemoveConn,peerid=${peerid},conn=${conn}`);
        // if (!conn && this.m_metaChain.peeridIsMeta(peerid)) {
        //     if (this.peerid < peerid) {
        //         console.log(`[meta_node.js MetaNode] ${this.peerid} reconn to peerid=${peerid}`);
        //         let reConnPeerid = peerid;
        //         _doConn(reConnPeerid);
        //     }
        // }
    });
    }

    changeState(newState) {
        if (newState === this.m_state) {
            return;
        }
        let oldState = this.m_state;
        this.m_state = newState;
        this.emit('onStateChange', oldState, this.m_state);
        if (newState === MetaNode.STATE.work) {
            //TODO: start a timer to build Metablock
            this.newMetaBlockDriver.on("OnUpdateTurns", (newDriver) => {
                let idlist = this.m_metaChain.getMetaListIDArray();
            newDriver.updateTurns(idlist);
        });
            this.newMetaBlockDriver.on("OnNewBlock", (newDriver, turns, now) => {
                console.log("meta_node OnNewBlock create new block nodeid=" + this.m_id.toString());
            //创建新block
            this._newBlock(turns, now, this.MetaSign,MetaNode.DBFT_TYPE.metablock, this.m_metaChain, this.m_metaTx);
        });

            this.newChainBlockDriver.on("OnUpdateTurns", (newDriver) => {
                let idlist = this.m_metaChain.getMetaListIDArray();
            newDriver.updateTurns(idlist);
        });
            this.newChainBlockDriver.on("OnNewBlock", (newDriver, turns, now) => {
                console.log("chain_node OnNewBlock create new block nodeid=" + this.m_id.toString());
            //创建新block
            this._newBlock(turns, now, this.NodeSign,MetaNode.DBFT_TYPE.nodeblock, this.m_nodeChain, this.m_nodeTx);
        });

            let idlist = this.m_metaChain.getMetaListIDArray();
            //if (idlist.length >= 1 && this.m_id === idlist[0]) {
            this.newMetaBlockDriver.updateTurns(idlist);
            setTimeout(() => {
                this.newMetaBlockDriver.beginNewBlock();
        }, 2000);

            this.newChainBlockDriver.updateTurns(idlist);
            this.newChainBlockDriver.beginNewBlock();
            //}

            let peerids = this.m_metaChain.getOtherMetaPeerids('0');
            this.updateBFTingPeerids(peerids);

            this.m_metaChain.EmitUpdateHeader();
            this.m_metaChain.EmitUpdateBlock();
            this.m_nodeChain.EmitUpdateHeader();
            this.m_nodeChain.EmitUpdateBlock();
        }
    }

    async  create() {
        await this._createStack();
        await this.m_metaChain.create();
        await this.m_nodeChain.create();
        await this.m_metaTx.init();
        await this.m_nodeTx.init();

        this.m_metaChain.on("OnUpdateHeader", (blockChain, beginHeight) => {
            this.doUpdateHeader(this.MetaSign, DPackage.CMD_TYPE.getMetaHeader, beginHeight);
    });
        this.m_metaChain.on("OnUpdateBlock", (blockChain) => {
            this.doUpdateBlock(blockChain, this.MetaSign,DPackage.CMD_TYPE.getMetaBlock);
    });

        this.m_nodeChain.on("OnUpdateHeader", (blockChain, beginHeight) => {
            this.doUpdateHeader(this.NodeSign,DPackage.CMD_TYPE.getHeader, beginHeight);
    });
        this.m_nodeChain.on("OnUpdateBlock", (blockChain) => {
            this.doUpdateBlock(blockChain, this.NodeSign,DPackage.CMD_TYPE.getBlock);
    });

        //this.m_metaChain.on

        this.isRegistered = this.m_metaChain.isInMetaList(this.m_id);
        //connect all metas except self
        //console.log('wait connect meta network');
        //await this.connectToMetaNodes();
        //console.log('connect to meta network success');

        if (!this.isRegistered) {
            this.changeState(MetaNode.STATE.registering);
            console.log('register to meta network...');
            let metaPeerids = this.m_metaChain.getOtherMetaPeerids(this.m_address.toString());
            await this._registerTo(metaPeerids);
        } else {
            let metalist = this.m_metaChain.getMetaList();
            for (let [id,info] of metalist) {
                if (this.m_id < id) {
                    while(true) {
                        let [ret, conn] = await this.getConnToPeer(info.peerid);
                        if (conn) {
                            break;
                        }
                    }
                }
            }
            this.changeState(MetaNode.STATE.work);
        }

        this.startRPCServer(this.rpcPort);
    }

    async _registerTo(peerids) {
        if (peerids.length <= 0) {
            return;
        }

        await this.connToPeers(peerids)
        let writer = DPackage.createStreamWriter({ cmdType: DPackage.CMD_TYPE.register }, { id: this.m_id, pubkey: this.m_account.getPublicKey().toString('hex'), sig: this.sig }, 0);
        this._broadcast(writer, -1);
    }

    async connectToMetaNodes() {
        let metaPeerids = this.m_metaChain.getOtherMetaPeerids(this.m_address.toString());
        if (metaPeerids.length > 0) {
            await this.connToPeers(metaPeerids);
        }
    }

    async connToPeers(peeridList) {
        let rets = await this.establishConnToPeers(peeridList);
        for (const [ret, conn, peerid] of rets) {
            if (ret !== MetaNode.ERROR.success) {
                console.warn(`connect to ${peerid} failed, errcode ${ret}`);
            }
        }
    }

    async addProof(pid, block, gid, proof) {
        let info = new ProofInfo(pid, block, gid, proof);
        let dataTX = TX.createDataTX(info.toRaw(), this.m_account);
        //this._begindBFT(MetaNode.DBFT_TYPE.metatx, dataTX);

        let txRaw = dataTX.toRaw();
        let sig = this.m_account.signHash(txRaw);
        let data = Buffer.from(JSON.stringify({ pubkey: this.m_account.getPublicKey().toString('hex'), sig: sig, tx: txRaw }));
        await this._beginBFTEx(MetaNode.DBFT_TYPE.metatx, sig+Date.now(), this.m_address.toString(), data);

        return true;
    }

    async addGroup(members) {
        let info = new GroupInfo(members);
        let dataTX = TX.createDataTX(info.toRaw(), this.m_account);
        //this._begindBFT(MetaNode.DBFT_TYPE.metatx, dataTX);

        let txRaw = dataTX.toRaw();
        let sig = this.m_account.signHash(txRaw);
        let data = Buffer.from(JSON.stringify({ pubkey: this.m_account.getPublicKey().toString('hex'), sig: sig, tx: txRaw }));
        await this._beginBFTEx(MetaNode.DBFT_TYPE.metatx, sig+Date.now(), this.m_address.toString(), data);
        return true
    }

    async _onMetaTX(tx) {
        //所有的Meta TX都是InfoTX
        if (!tx.isDataTX()) {
            return 1;
        }

        if (await this.m_metaTx.hasTx(tx.hash())) {
            return;
        }

        this.m_metaTx.addTx(tx);

        return 0;
    }

    async _onChainTX(tx) {
        //verify tx first
        if (!tx.isSane() || !tx.verify(this.m_nodeChain.m_coinView)) {
            return;
        }
        if (await this.m_nodeTx.hasTx(tx.hash())) {
            return;
        }
        //supernode出块，现在就修改当前的coinview，下一个tx来的时候直接验证是否双花
        this.m_nodeChain.spendTX(tx);
        this.m_nodeChain.addTX(tx, -1);

        this.m_nodeTx.addTx(tx);

        return 0;
    }

    async _onDBFTEx(type, data,fromPeerid) {
        let bRet = false;
        let resp = {};
        switch (type) {
            case MetaNode.DBFT_TYPE.register:
            {
                let jsonInfo = JSON.parse(data.toString());
                jsonInfo.pubkey = Buffer.from(jsonInfo.pubkey, 'hex');
                jsonInfo.sig = Buffer.from(jsonInfo.sig, 'hex');
                if (this.m_metaChain.verifySystemSig(jsonInfo.pubkey, jsonInfo.sig)) {
                    this.m_metaChain.addMetaInfo(jsonInfo.pubkey, jsonInfo.id);
                    let list = this.m_metaChain.getMetaListArray();
                    let listJSON = JSON.stringify(list);
                    let sig1 = this.m_account.signHash(listJSON).toString('hex');
                    resp = { list: listJSON, sig: sig1, id: this.m_id };
                    bRet = true;
                } else {
                    resp = {};
                }
                resp = Buffer.from(JSON.stringify(resp));
            }
                break;

            case MetaNode.DBFT_TYPE.metatx:
            {
                //{ pubkey: this.m_account.getPublicKey().toString('hex'), sig: sig, tx: txRaw }
                let jsonInfo = JSON.parse(data.toString());
                jsonInfo.sig = Buffer.from(jsonInfo.sig, 'hex');
                jsonInfo.tx = Buffer.from(jsonInfo.tx, 'hex');

                let tx = TX.fromRaw(jsonInfo.tx);
                if (!tx.isDataTX()) {
                    console.log('[metanode.js _onDBFTEx MetaNode.DBFT_TYPE.metatx not agree tx,!tx.isDataTX()');
                    break;
                }
                let metaInfo = Info.fromRaw(tx.getData());
                if (metaInfo.type === Info.type.GROUPINFO) {
                    jsonInfo.pubkey = Buffer.from(config.systemPubKey,'hex');
                }
                else {
                    jsonInfo.pubkey = Buffer.from(jsonInfo.pubkey, 'hex');
                }

                let ring = KeyRing.fromPublic(jsonInfo.pubkey);
                if (ring.verifyHash(jsonInfo.tx, jsonInfo.sig)) {
                    bRet = true;
                }
            }
                break;
            case MetaNode.DBFT_TYPE.chaintx:
            {
                //{ pubkey: this.m_account.getPublicKey().toString('hex'), sig: sig, tx: txRaw }
                let jsonInfo = JSON.parse(data.toString());
                jsonInfo.pubkey = Buffer.from(jsonInfo.pubkey, 'hex');
                jsonInfo.sig = Buffer.from(jsonInfo.sig, 'hex');
                jsonInfo.tx = Buffer.from(jsonInfo.tx, 'hex');
                let ring = KeyRing.fromPublic(jsonInfo.pubkey);
                if (ring.verifyHash(jsonInfo.tx, jsonInfo.sig)) {
                    let tx = TX.fromRaw(jsonInfo.tx);
                    if (tx.isSane() && tx.verify(this.m_nodeChain.m_coinView)) {
                        bRet = true;
                    }
                }
                console.log('[metanode.js _onDBFTEx MetaNode.DBFT_TYPE.chaintx,bRet='+bRet.toString());
            }
                break;

            case MetaNode.DBFT_TYPE.metablock:
            {
                //console.log(this.m_address.toString()+"(metablock) recevie MetaNode.DBFT_TYPE.metablock");
                let jsonInfo = JSON.parse(data.toString());
                let ring = KeyRing.fromPublic(Buffer.from(jsonInfo.pubkey, 'hex'));
                if (!this.newMetaBlockDriver.checkTurn(jsonInfo.data.now, jsonInfo.data.id)) {
                    //它进入出块序列才需要判断id正确与否
                    console.log(`[metanode.js _onDBFTEx MetaNode.DBFT_TYPE.metablock],turns error,comeid=${jsonInfo.data.id}`);
                    bRet = false;
                    break;
                }
                if (jsonInfo.data.block.length === 0) {
                    bRet = true;
                    break;
                }
                let block = Block.fromRaw(Buffer.from(jsonInfo.data.block, 'hex'));
                if (!block.verify()) {
                    bRet = false;
                    console.log('[metanode.js _onDBFTEx MetaNode.DBFT_TYPE.metablock],bRet=false,block.verify error,from=' + jsonInfo.data.id.toString());
                    break;
                }
                let header = block.toHeaders();
                if (this.m_metaChain.getNowHeight() + 1 !== header.height) {
                    bRet = false;
                    console.log('[metanode.js _onDBFTEx MetaNode.DBFT_TYPE.metablock],bRet=false,height error,now=' + this.m_metaChain.getNowHeight() + ' blockheight=' + header.height + ',from=' + jsonInfo.data.id.toString());
                    break;
                }
                let latestHeader = await this.m_metaChain.getHeaderByHeight(header.height - 1);
                if (latestHeader && latestHeader.hash('hex') !== header.prevBlock) {
                    bRet = false;
                    console.log('[metanode.js MetaNode.DBFT_TYPE.metablock],bRet=false,latestHeader error,from=' + jsonInfo.data.id.toString());
                    break;
                }
                bRet = true;
            }
                break;
            case MetaNode.DBFT_TYPE.nodeblock:
            {
                // console.log(this.m_address.toString()+"(nodeblock) recevie MetaNode.DBFT_TYPE.metablock");
                let jsonInfo = JSON.parse(data.toString());
                let ring = KeyRing.fromPublic(Buffer.from(jsonInfo.pubkey, 'hex'));
                if (!this.newChainBlockDriver.checkTurn(jsonInfo.data.now, jsonInfo.data.id)) {
                    //它进入出块序列才需要判断id正确与否
                    console.log(`[metanode.js _onDBFTEx MetaNode.DBFT_TYPE.nodeblock],turns error,comeid=${jsonInfo.data.id}`);
                    bRet = false;
                    break;
                }
                if (jsonInfo.data.block.length === 0) {
                    bRet = true;
                    break;
                }
                let block = Block.fromRaw(Buffer.from(jsonInfo.data.block, 'hex'));
                if (!block.verify()) {
                    bRet = false;
                    console.log('[metanode.js _onDBFTEx MetaNode.DBFT_TYPE.nodeblock],bRet=false,block.verify error,from=' + jsonInfo.data.id.toString());
                    break;
                }

                let header = block.toHeaders();
                if (this.m_nodeChain.getNowHeight() + 1 !== header.height) {
                    bRet = false;
                    console.log('[metanode.js _onDBFTEx MetaNode.DBFT_TYPE.nodeblock],bRet=false,height error,now=' + this.m_nodeChain.getNowHeight() + ' blockheight=' + header.height + ',from=' + jsonInfo.data.id.toString());
                    break;
                }
                let latestHeader = await this.m_nodeChain.getHeaderByHeight(header.height - 1);
                if (latestHeader && latestHeader.hash('hex') !== header.prevBlock) {
                    bRet = false;
                    console.log('[metanode.js _onDBFTEx MetaNode.DBFT_TYPE.nodeblock],bRet=false,latestHeader error,from=' + jsonInfo.data.id.toString());
                    break;
                }

                bRet = true;
            }
                break;
            default:
                break;
        }

        return [bRet, resp];
    }
    async _onDBFTRespEx(type, data) {
        let bRet = false;
        switch (type) {
            case MetaNode.DBFT_TYPE.register:
            {
                let jsonInfo = JSON.parse(data.toString());
                jsonInfo.sig = Buffer.from(jsonInfo.sig, 'hex');
                if (this.m_metaChain.verifyMetaSig(jsonInfo.id, jsonInfo.list, jsonInfo.sig)) {
                    let list = JSON.parse(jsonInfo.list.toString());
                    this.m_metaChain.addMetaInfos(list);
                    await this.connectToMetaNodes();
                    return true;
                }
            }
                break;

            case MetaNode.DBFT_TYPE.metatx:
            case MetaNode.DBFT_TYPE.chaintx:
                return true;

            case MetaNode.DBFT_TYPE.metablock:
            case MetaNode.DBFT_TYPE.nodeblock:
                return true;

            default:
                break;
        }
    }
    async _onBFTFinishEx(type, data, bSucc) {
        switch (type) {
            case MetaNode.DBFT_TYPE.register:
            {
                if (bSucc) {
                    console.log('register complete, work.peerid=' + this.m_address.toString());
                    this.changeState(MetaNode.STATE.work);
                }
            }
                break;

            case MetaNode.DBFT_TYPE.metatx:
            {
                if (bSucc) {
                    let jsonInfo = JSON.parse(data.toString());
                    let tx = TX.fromRaw(Buffer.from(jsonInfo.tx, 'hex'));
                    this._onMetaTX(tx);
                }
            }
                break;

            case MetaNode.DBFT_TYPE.chaintx:
            {
                if (bSucc) {
                    let jsonInfo = JSON.parse(data.toString());
                    let tx = TX.fromRaw(Buffer.from(jsonInfo.tx, 'hex'));
                    this._onChainTX(tx);
                }
            }
                break;
            case MetaNode.DBFT_TYPE.metablock:
            {
                let jsonInfo = JSON.parse(data.toString());
                jsonInfo.data.block = Buffer.from(jsonInfo.data.block,'hex');
                console.log(`[metanode _onBFTFinishEx MetaNode.DBFT_TYPE.metablock] ${this.m_address.toString()} finish, turns=${JSON.stringify(jsonInfo.data.turns)},id=${jsonInfo.data.id.toString()}`);
                if (jsonInfo.data.block.length > 0 && bSucc) {
                    //一定要先加block，因为addheader会触发更新block得逻辑
                    let block = Block.fromRaw(Buffer.from(jsonInfo.data.block, 'hex'));
                    let header = block.toHeaders();
                    console.log(`[metanode _onBFTFinishEx MetaNode.DBFT_TYPE.metablock] finish, blockHash=${block.hash('hex')},height=${header.height},id=${jsonInfo.data.id.toString()}`);
                    await this.m_metaBlockLock.enter();
                    await this.m_metaChain.addBlocks([block]);
                    await this.m_metaChain.addHeaders([header]);

                    let txHash = [];
                    for (let i=0;i<block.txs.length;i++) {
                        txHash.push(block.txs[i].hash('hex'));
                    }
                    await this.m_metaTx.deleteTxs(txHash);
                    await this.m_metaBlockLock.leave();
                }
                //id<0表示还没有进入出块序列
                if (bSucc && this.newMetaBlockDriver.checkTurn(jsonInfo.data.now, jsonInfo.data.id)) {
                    this.newMetaBlockDriver.updateTurns(jsonInfo.data.turns);
                    this.newMetaBlockDriver.next(jsonInfo.data.id, jsonInfo.data.now);
                } else {
                    console.log(`[metanode _onBFTFinishEx MetaNode.DBFT_TYPE.metablock] do not update turns,fromid=${jsonInfo.data.id}`);
                }
            }
                break;

            case MetaNode.DBFT_TYPE.nodeblock:
            {
                let jsonInfo = JSON.parse(data.toString());
                jsonInfo.data.block = Buffer.from(jsonInfo.data.block,'hex');
                console.log(`[metanode _onBFTFinishEx MetaNode.DBFT_TYPE.nodeblock] ${this.m_address.toString()} finish, turns=${JSON.stringify(jsonInfo.data.turns)},id=${jsonInfo.data.id.toString()}`);
                if (jsonInfo.data.block.length > 0 && bSucc) {
                    let blockRaw = Buffer.from(jsonInfo.data.block, 'hex');
                    //一定要先加block，因为addheader会触发更新block得逻辑
                    let block = Block.fromRaw(blockRaw);
                    let header = block.toHeaders();
                    console.log(`[metanode _onBFTFinishEx MetaNode.DBFT_TYPE.nodeblock] finish, blockHash=${block.hash('hex')},height=${header.height},id=${jsonInfo.data.id.toString()}`);
                    await this.m_nodeBlockLock.enter();
                    await this.m_nodeChain.addBlocks([block]);
                    await this.m_nodeChain.addHeaders([header]);

                    let txHash = [];
                    for (let i=0;i<block.txs.length;i++) {
                        txHash.push(block.txs[i].hash('hex'));
                    }
                    await this.m_nodeTx.deleteTxs(txHash);
                    await this.m_nodeBlockLock.leave();

                    (async () => {
                        let headerRaw = header.toRaw();
                    //把这个块广播给下面
                    let sig = this.m_account.signHash(headerRaw);
                    let wirter = DPackage.createStreamWriter({ cmdType: DPackage.CMD_TYPE.broadcastBlock }, { 'pubkey': this.m_account.getPublicKey(), 'sig': sig }, headerRaw.length).writeData(headerRaw);
                    this._broadcast(wirter, -1, (conn) => {
                        return !this.m_metaChain.peeridIsMeta(conn.remote.peerid);
                }, (conn) => {
                        console.log(`[metanode _onBFTFinishEx MetaNode.DBFT_TYPE.nodeblock] send to----------${conn.remote.peerid}`);
                    });
                })();
                }
                if (bSucc && this.newChainBlockDriver.checkTurn(jsonInfo.data.now, jsonInfo.data.id)) {
                    this.newChainBlockDriver.updateTurns(jsonInfo.data.turns);
                    this.newChainBlockDriver.next(jsonInfo.data.id, jsonInfo.data.now);
                } else {
                    console.log(`[metanode _onBFTFinishEx MetaNode.DBFT_TYPE.nodeblock] do not update turns,fromid=${jsonInfo.data.id}`);
                }
            }
                break;
            default:
                break;
        }

    }

    async _newBlock(nodeTurns, now, sign, msg, blockChain, txStorage) {
        let blockRaw = "";
        let lock ;
        if (sign === this.MetaSign) {
            lock = this.m_metaBlockLock;
        } else {
            lock = this.m_nodeBlockLock;
        }
        await lock.enter();
        // if (await txStorage.getCount() === 0) {
        //     await lock.leave();
        //     return true;
        // }
        //因为是循环出块，即使没有也发送一个信息出去，相当于进行轮询
        if (await txStorage.getCount() > 0 && !this.m_bUpdateHeader[sign]) {
            let newBlock = await blockChain.createBlock();
            while (await txStorage.getCount() !== 0) {
                let tx = await txStorage.shift();
                newBlock.txs.push(tx);
            }

            try {
                newBlock.makeMerkleRoot();
                newBlock.signCreator(this.m_account, this.m_id);
                blockRaw = newBlock.toRaw();
            } catch(e) {
                blockRaw = "";
            }
            //console.log(this.m_address.toString()+" create real block hash="+newBlock.hash('hex').toString());
        }
        await lock.leave();

        //console.log("blockRaw leng===================="+blockRaw.length);
        let ret_data = { 'block': blockRaw, 'turns': nodeTurns, 'id': this.m_id, 'now': now };
        let jsonInfo = JSON.stringify(ret_data);
        let sig = this.m_account.signHash(Buffer.from(jsonInfo, 'hex'));



        let data = Buffer.from(JSON.stringify({ pubkey: this.m_account.getPublicKey().toString('hex'), sig: sig, data: ret_data }));
        console.log("==================fdfsdssssssssssssssss===================");
        await this._beginBFTEx(msg, sig+Date.now(), this.m_address.toString(), data);

        return true
    }

    async getRandomConn() {
        let peerids = this.m_metaChain.getOtherMetaPeerids(this.m_address.toString());
        if (peerids.length === 0) {
            return null;
        }

        let nIndex = Math.floor(Math.random() * peerids.length);
        let [ret, conn] = await this.getConnToPeer(peerids[nIndex]);
        return conn;
    }

    async doUpdateHeader(sign,msg, beginHeight) {
        if (this.m_bUpdateHeader[sign]) {
            //更新中，不处理
            return;
        }
        let conn = await this.getRandomConn();
        if (!conn) {
            return;
        }

        this.updateHeaderState(sign,true);
        DPackage.createStreamWriter({ cmdType: msg }, { start: beginHeight, len: 500 }, 0).bind(conn);
    }

    async doUpdateBlock(blockChain, sign,msg) {
        if (this.m_bUpdateBlock[sign]) {
            console.log(`[metanode onUpdateBlock] return [this.m_bUpdateBlock] m_bUpdateBlock[${sign}]=${this.m_bUpdateBlock[sign].toString()}`);
            return;
        }

        let conn = await this.getRandomConn();
        if (!conn) {
            console.log(`[metanode onUpdateBlock] sign=${sign},return conn null`);
            return;
        }
        let hashList = blockChain.getUpdateBlockList(1000);
        if (!hashList || hashList.length === 0) {
            console.log(`[metanode onUpdateBlock] sign=${sign},return hashList=${hashList.length.toString()}`);
            return ;
        }

        this.updateBlockState(sign,true);
        console.log(`[metanode onUpdateBlock] sign=${sign},hashList=${hashList.length.toString()}`);
        let jsonInfo = JSON.stringify(hashList);
        let raw = Buffer.from(jsonInfo);
        let sig = this.m_account.signHash(raw);
        let body = { 'pid': this.m_address.toString(), 'pubkey': this.m_account.getPublicKey(), 'sig': sig };
        DPackage.createStreamWriter({ cmdType: msg }, body, raw.length).writeData(raw).bind(conn);
    }

    updateBlockState(sign, bUpdate) {
        this.m_bUpdateBlock[sign] = bUpdate;
        if (this.m_bUpdateBlock[sign+'_timerid'] !== 0) {
            clearTimeout(this.m_bUpdateBlock[sign+'_timerid']);
            this.m_bUpdateBlock[sign+'_timerid'] = 0;
        }

        if (bUpdate) {
            this.m_bUpdateBlock[sign+'_timerid'] = setTimeout(() => {
                this.updateBlockState(sign,false);
        }, 7000);
        }
    }

    updateHeaderState(sign, bUpdate) {
        this.m_bUpdateHeader[sign] = bUpdate;
        if (this.m_bUpdateHeader[sign+'_timerid'] !== 0) {
            clearTimeout(this.m_bUpdateHeader[sign+'_timerid']);
            this.m_bUpdateHeader[sign+'_timerid'] = 0;
        }

        if (bUpdate) {
            this.m_bUpdateHeader[sign+'_timerid'] = setTimeout(() => {
                this.updateHeaderState(false);
        }, 7000);
        }
    }
}

MetaNode.STATE = {
    init: 0,
    registering: 1,
    work: 2
}

MetaNode.DBFT_TYPE = {
    register: 0,
    chaintx: 1,
    metatx: 2,
    metablock: 3,
    nodeblock: 4,
};

module.exports = MetaNode;