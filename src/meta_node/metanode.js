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

class MetaNode extends AccountNode {
    constructor(params) {
        super(params);

        this.m_metaChain = new MetaBlockChain(params.metaConfig);
        this.m_nodeChain = new NodeBlockChain(params.nodeConfig);
        this.m_metaTx = new TxStorage(this.m_metaChain.m_chainDB);
        this.m_nodeTx = new TxStorage(this.m_nodeChain.m_chainDB);
        this.m_id = params.number;

        this.devmode = params.devmode;
        this.rpcPort = params.rpcPort;
        this.sig = params.sig;

        this.newMetaBlockDriver = new NewBlockDriver(params.number, this.m_id,this.m_metaTx,params.devmode);
        this.newChainBlockDriver = new NewBlockDriver(params.number, this.m_id,this.m_nodeTx,params.devmode);

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
        this.m_bUpdateBlock = {"meta":false,"node":false};
        this.m_bUpdateHeader = {"meta":false,"node":false};

        this.verifyInfo = {
            height: 0,
            time: 0,
        };
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
            this.newMetaBlockDriver.on("OnNewBlock", (newDriver, turns) => {
                console.log("meta_node OnNewBlock create new block nodeid=" + this.m_id.toString());
                //创建新block
                this._newBlock(this.MetaSign,MetaNode.DBFT_TYPE.metablock, turns, this.m_metaChain, this.m_metaTx);
            });

            this.newChainBlockDriver.on("OnUpdateTurns", (newDriver) => {
                let idlist = this.m_metaChain.getMetaListIDArray();
                newDriver.updateTurns(idlist);
            });
            this.newChainBlockDriver.on("OnNewBlock", (newDriver, turns) => {
                console.log("chain_node OnNewBlock create new block nodeid=" + this.m_id.toString());
                //创建新block
                this._newBlock(this.NodeSign,MetaNode.DBFT_TYPE.nodeblock, turns, this.m_nodeChain, this.m_nodeTx);
            });

            let idlist = this.m_metaChain.getMetaListIDArray();
            if (idlist.length === 1) {
                this.newMetaBlockDriver.updateTurns(idlist);
                this.newMetaBlockDriver.next(this.m_id);

                this.newChainBlockDriver.updateTurns(idlist);
                this.newChainBlockDriver.next(this.m_id);
            }

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
        this.m_metaChain.on("OnUpdateBlock", (blockChain, hashList) => {
            this.doUpdateBlock(this.MetaSign,DPackage.CMD_TYPE.getMetaBlock, hashList);
        });

        this.m_nodeChain.on("OnUpdateHeader", (blockChain, beginHeight) => {
            this.doUpdateHeader(this.NodeSign,DPackage.CMD_TYPE.getHeader, beginHeight);
        });
        this.m_nodeChain.on("OnUpdateBlock", (blockChain, hashList) => {
            this.doUpdateBlock(this.NodeSign,DPackage.CMD_TYPE.getBlock, hashList);
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
        this._beginBFTEx(MetaNode.DBFT_TYPE.metatx, sig, this.m_address.toString(), "complete", data);

        return true;
    }

    async addGroup(members) {
        let info = new GroupInfo(members);
        let dataTX = TX.createDataTX(info.toRaw(), this.m_account);
        //this._begindBFT(MetaNode.DBFT_TYPE.metatx, dataTX);

        let txRaw = dataTX.toRaw();
        let sig = this.m_account.signHash(txRaw);
        let data = Buffer.from(JSON.stringify({ pubkey: this.m_account.getPublicKey().toString('hex'), sig: sig, tx: txRaw }));
        this._beginBFTEx(MetaNode.DBFT_TYPE.metatx, sig, this.m_address.toString(), "complete", data);
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

    async _onDBFTEx(type, data) {
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
                        if (tx.isSane()  && tx.verify(this.m_nodeChain.m_coinView)) {
                            bRet = true;
                        }
                    }
                }
                break;

            case MetaNode.DBFT_TYPE.metablock:
                {
                    //console.log(this.m_address.toString()+"(metablock) recevie MetaNode.DBFT_TYPE.metablock");
                    let jsonInfo = JSON.parse(data.toString());
                    let ring = KeyRing.fromPublic(Buffer.from(jsonInfo.pubkey, 'hex'));
                    if (true){//ring.verifyHash(Buffer.from(JSON.stringify(jsonInfo.data), 'hex'), Buffer.from(jsonInfo.sig, 'hex'))) {
                        if (jsonInfo.data.block.length === 0) {
                            bRet = true;
                        }
                        else {
                            let block = Block.fromRaw(Buffer.from(jsonInfo.data.block, 'hex'));
                            if (block.verify()) {
                                bRet = true;
                            }
                        }
                    }
                }
                break;
            case MetaNode.DBFT_TYPE.nodeblock:
                {

                    // console.log(this.m_address.toString()+"(nodeblock) recevie MetaNode.DBFT_TYPE.metablock");
                    let jsonInfo = JSON.parse(data.toString());
                    let ring = KeyRing.fromPublic(Buffer.from(jsonInfo.pubkey, 'hex'));
                    if (true){//ring.verifyHash(Buffer.from(JSON.stringify(jsonInfo.data), 'hex'), Buffer.from(jsonInfo.sig, 'hex'))) {
                        if (jsonInfo.data.block.length === 0) {
                            bRet = true;
                        }
                        else {
                            let block = Block.fromRaw(Buffer.from(jsonInfo.data.block, 'hex'));
                            if (block.verify()) {
                                bRet = true;
                            }
                        }
                    }
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
    async _onBFTFinishEx(type, data) {
        switch (type) {
            case MetaNode.DBFT_TYPE.register:
                {
                    console.log('register complete, work.peerid=' + this.m_address.toString());
                    this.changeState(MetaNode.STATE.work);
                }
                break;

            case MetaNode.DBFT_TYPE.metatx:
                {
                    let jsonInfo = JSON.parse(data.toString());
                    let tx = TX.fromRaw(Buffer.from(jsonInfo.tx, 'hex'));
                    this._onMetaTX(tx);
                }
                break;

            case MetaNode.DBFT_TYPE.chaintx:
                {
                    let jsonInfo = JSON.parse(data.toString());
                    let tx = TX.fromRaw(Buffer.from(jsonInfo.tx, 'hex'));
                    this._onChainTX(tx);
                }
                break;
            case MetaNode.DBFT_TYPE.metablock:
                {
                    let jsonInfo = JSON.parse(data.toString());
                    jsonInfo.data.block = Buffer.from(jsonInfo.data.block,'hex');
                    console.log(this.m_address.toString()+"(metablock) finish MetaNode.DBFT_TYPE.metablock turns="+JSON.stringify(jsonInfo.data.turns)+" id="+jsonInfo.data.id.toString());
                    if (jsonInfo.data.block.length > 0) {
                        //一定要先加block，因为addheader会触发更新block得逻辑
                        let block = Block.fromRaw(Buffer.from(jsonInfo.data.block, 'hex'));
                        console.log(this.m_address.toString()+"(metablock) finish MetaNode.DBFT_TYPE.metablock blockHash="+block.hash('hex'));
                        await this.m_metaChain.addBlocks([block]);
                        let header = block.toHeaders();
                        await this.m_metaChain.addHeaders([header]);

                        let txHash = [];
                        for (let i=0;i<block.txs.length;i++) {
                            txHash.push(block.txs[i].hash('hex'));
                        }
                        await this.m_metaTx.deleteTxs(txHash);
                    }
                    this.newMetaBlockDriver.updateTurns(jsonInfo.data.turns);
                    this.newMetaBlockDriver.next(jsonInfo.data.id);
                }
                break;

            case MetaNode.DBFT_TYPE.nodeblock:
                {
                    let jsonInfo = JSON.parse(data.toString());
                    jsonInfo.data.block = Buffer.from(jsonInfo.data.block,'hex');
                    console.log(this.m_address.toString()+"(nodeblock) finish MetaNode.DBFT_TYPE.nodeblock turns="+JSON.stringify(jsonInfo.data.turns)+" id="+jsonInfo.data.id.toString());
                    if (jsonInfo.data.block.length > 0) {
                        let blockRaw = Buffer.from(jsonInfo.data.block, 'hex');
                        //一定要先加block，因为addheader会触发更新block得逻辑
                        let block = Block.fromRaw(blockRaw);
                        console.log(this.m_address.toString()+"(nodeblock) finish MetaNode.DBFT_TYPE.metablock blockHash="+block.hash('hex'));
                        await this.m_nodeChain.addBlocks([block]);
                        let header = block.toHeaders();
                        await this.m_nodeChain.addHeaders([header]);

                        let txHash = [];
                        for (let i=0;i<block.txs.length;i++) {
                            txHash.push(block.txs[i].hash('hex'));
                        }
                        await this.m_nodeTx.deleteTxs(txHash);

                        let headerRaw = header.toRaw();
                        //把这个块广播给下面
                        let sig = this.m_account.signHash(headerRaw);
                        let wirter = DPackage.createStreamWriter({ cmdType: DPackage.CMD_TYPE.broadcastBlock }, { 'pubkey': this.m_account.getPublicKey(), 'sig': sig }, headerRaw.length).writeData(headerRaw);
                        this._broadcast(wirter, -1, (conn) => {
                            return !this.m_metaChain.peeridIsMeta(conn.remote.peerid);
                        },(conn) => {
                            console.log("send to ------------"+conn.remote.peerid.toString());
                        });
                    }
                    this.newChainBlockDriver.updateTurns(jsonInfo.data.turns);
                    this.newChainBlockDriver.next(jsonInfo.data.id);
                }
                break;
            default:
                break;
        }

    }

    async _newBlock(sign,msg, nodeTurns, blockChain, txStorage) {
        let blockRaw = "";
        //因为是循环出块，即使没有也发送一个信息出去，相当于进行轮询
        if (await txStorage.getCount() > 0 && !this.m_bUpdateHeader[sign]) {
            let newBlock = await blockChain.createBlock();
            while (await txStorage.getCount() !== 0) {
                let tx = await txStorage.shift();
                newBlock.txs.push(tx);
            }

            newBlock.makeMerkleRoot();
            newBlock.signCreator(this.m_account, this.m_id);
            blockRaw = newBlock.toRaw();
            //console.log(this.m_address.toString()+" create real block hash="+newBlock.hash('hex').toString());
        }

        //console.log("blockRaw leng===================="+blockRaw.length);
        let ret_data = { 'block': blockRaw, 'turns': nodeTurns, 'id': this.m_id };
        let jsonInfo = JSON.stringify(ret_data);
        let sig = "";//this.m_account.signHash(Buffer.from(jsonInfo, 'hex'));



        let data = Buffer.from(JSON.stringify({ pubkey: this.m_account.getPublicKey().toString('hex'), sig: sig, data: ret_data }));
        console.log("==================fdfsdssssssssssssssss===================");
        this._beginBFTEx(msg, this.sig, this.m_address.toString(), "complete", data);

        return true
    }

    async _onPkg(conn, pkg) {
        switch (pkg.header.cmdType) {
            case DPackage.CMD_TYPE.register:
                {
                    //{ id: this.m_id, pubkey: this.m_account.getPublicKey().toString('hex'), sig: this.sig }
                    let jsonInfo = pkg.body;
                    jsonInfo.pubkey = Buffer.from(jsonInfo.pubkey, 'hex');
                    jsonInfo.sig = Buffer.from(jsonInfo.sig, 'hex');
                    if (this.m_metaChain.verifySystemSig(jsonInfo.pubkey, jsonInfo.sig)) {
                        this.m_metaChain.addMetaInfo(jsonInfo.pubkey, jsonInfo.id);
                        let list = this.m_metaChain.getMetaListArray();
                        let listJSON = JSON.stringify(list);
                        let sig1 = this.m_account.signHash(listJSON).toString('hex');
                        DPackage.createStreamWriter({ cmdType: DPackage.CMD_TYPE.registerResp }, { pubkey: this.m_account.getPublicKey().toString('hex'), list: listJSON, sig: sig1, id: this.m_id }, 0).bind(conn);
                    }
                }
                break;
            case DPackage.CMD_TYPE.registerResp:
                {
                    let jsonInfo = pkg.body;
                    jsonInfo.sig = Buffer.from(jsonInfo.sig, 'hex');
                    jsonInfo.pubkey = Buffer.from(jsonInfo.pubkey, 'hex');
                    //jsonInfo.list = Buffer.from(jsonInfo.list,'hex');
                    if (this.m_metaChain.verifyMetaSig(jsonInfo.id, jsonInfo.list, jsonInfo.sig)) {
                        let list = JSON.parse(jsonInfo.list.toString());
                        let addList = this.m_metaChain.addMetaInfos(list);
                        let peeridlist = [];
                        for (let pubkey of addList) {
                            let peerid = KeyRing.fromPublic(Buffer.from(pubkey, 'hex')).getAddress('string');
                            if (peerid !== this.m_address.toString()) {
                                peeridlist.push(peerid);
                            }
                        }
                        if (peeridlist.length > 0) {
                            await this._registerTo(peeridlist);
                        }
                        else {
                            this.changeState(MetaNode.STATE.work);
                        }
                    }
                }
                break;
            case DPackage.CMD_TYPE.login:
                {
                    let ring = KeyRing.fromPublic(pkg.body.pubkey);
                    if (!ring.verifyHash(Buffer.from(pkg.body.timestamp), pkg.body.sig)) {
                        break;
                    }
                    let [gid, members] = await this.m_metaChain.m_metaDB.getGroupsFromPeerid(conn.remote.peerid);
                    if (!members) {
                        break;
                    }
                    //TODO:  use dBFT to collect MetaNodesList
                    let list = this.m_metaChain.getMetaList();
                    let peerids = []
                    for (const [id, { pubkey, peerid }] of list) {
                        peerids.push(peerid);
                    }
                    let listJSON = JSON.stringify(peerids);
                    let resp = { 'block': this.verifyInfo.height, 'gid': gid, 'members': members, 'metas': listJSON ,'date':Date.now()};
                    resp = JSON.stringify(resp);
                    let sig = this.m_account.signHash(resp);
                    DPackage.createStreamWriter({ cmdType: DPackage.CMD_TYPE.loginResp }, { sig: sig, pubkey:this.m_account.getPublicKey(), resp: resp }, 0).bind(conn);
                }
                break;
            case DPackage.CMD_TYPE.proof:
                {
                    pkg.body.pubkey = Buffer.from(pkg.body.pubkey,'hex');
                    pkg.body.sig = Buffer.from(pkg.body.sig,'hex');
                    let ring = KeyRing.fromPublic(pkg.body.pubkey);
                    if (!ring.verifyHash(pkg.body.raw, pkg.body.sig)) {
                        break;
                    }
                    let proof = JSON.parse(pkg.body.raw.toString());
                    this.addProof(conn.remote.peerid,1,proof.check.group,pkg.body.raw.toString());
                    DPackage.createStreamWriter({ cmdType: DPackage.CMD_TYPE.proofResp }, { metasig: proof.check.metasig }, 0).bind(conn);
                }
                break;

            case DPackage.CMD_TYPE.metaHeader:
                {
                    this.m_bUpdateHeader[this.MetaSign] = false;
                    if (pkg.dataLength === 0) {
                        console.log('update meta_header total=0');
                        break;
                    }

                    let reader = new BufferReader(pkg.data[0]);
                    let headers = [];
                    while (reader.left() > 0) {
                        let header = Header.fromReader(reader);
                        headers.push(header);
                    }
                    if (headers.length > 0) {
                        await this.m_metaChain.addHeaders(headers);
                    }
                    console.log('update meta_header total=' + headers.length.toString());

                    if (headers.length === 500) {
                        this.m_metaChain.EmitUpdateHeader();
                    }
                }
                break;
            case DPackage.CMD_TYPE.getMetaHeader:
                {
                    if (this.m_metaChain.peeridIsMeta(conn.remote.peerid)) {
                        let headersRaw = await this.m_metaChain.getHeadersRaw(pkg.body.start, pkg.body.len);
                        if (headersRaw && headersRaw !== "") {
                            DPackage.createStreamWriter({ cmdType: DPackage.CMD_TYPE.metaHeader }, null, headersRaw.length).writeData(headersRaw).bind(conn);
                        }
                        else {
                            DPackage.createStreamWriter({ cmdType: DPackage.CMD_TYPE.metaHeader }, null, 0).bind(conn);
                        }
                    }
                }
                break;
            case DPackage.CMD_TYPE.header:
                {
                    this.m_bUpdateHeader[this.NodeSign] = false;
                    if (pkg.dataLength === 0) {
                        //没有需要更新的
                        console.log('update miner_header total=0');
                        break;
                    }
                    let reader = new BufferReader(pkg.data[0]);
                    let headers = [];
                    while (reader.left() > 0) {
                        let header = Header.fromReader(reader);
                        headers.push(header);
                    }
                    if (headers.length > 0) {
                        await this.m_nodeChain.addHeaders(headers);
                    }
                    console.log('update miner_header total=' + headers.length.toString());

                    if (headers.length === 500) {
                        this.m_nodeChain.EmitUpdateHeader();
                    }
                }
                break;
            case DPackage.CMD_TYPE.getHeader:
                {
                    //这种情况下都当着是上层链的更新
                    let headersRaw = await this.m_nodeChain.getHeadersRaw(pkg.body.start, pkg.body.len);
                    if (headersRaw && headersRaw !== "") {
                        DPackage.createStreamWriter({ cmdType: DPackage.CMD_TYPE.header }, null, headersRaw.length).writeData(headersRaw).bind(conn);
                    }
                    else {
                        DPackage.createStreamWriter({ cmdType: DPackage.CMD_TYPE.header }, null, 0).bind(conn);
                    }
                }
                break;
            case DPackage.CMD_TYPE.metaBlock:
                {
                    if (!this.m_metaChain.peeridIsMeta(conn.remote.peerid)) {
                        break;
                    }
                    this.m_bUpdateBlock[this.MetaSign] = false;
                    if (pkg.dataLength === 0) {
                        break;
                    }

                    let reader = new BufferReader(pkg.data[0]);
                    let blocks = [];
                    while (reader.left() > 0) {
                        let block = Block.fromReader(reader);
                        blocks.push(block);
                    }
                    if (blocks.length > 0) {
                        await this.m_metaChain.addBlocks(blocks);
                    }
                }
                break;
            case DPackage.CMD_TYPE.getMetaBlock:
                {
                    if (pkg.dataLength === 0) {
                        break;
                    }
                    if (this.m_metaChain.peeridIsMeta(conn.remote.peerid)) {
                        let jsonInfo = JSON.parse(pkg.data[0]);
                        let blockRaw = this.m_metaChain.getBlocksRaw(jsonInfo);
                        if (blockRaw && blockRaw != "") {
                            DPackage.createStreamWriter({ cmdType: DPackage.CMD_TYPE.metaBlock }, null, blockRaw.length).writeData(blockRaw).bind(conn);
                        }
                        else {
                            DPackage.createStreamWriter({ cmdType: DPackage.CMD_TYPE.metaBlock }, null, 0).bind(conn);
                        }
                    }
                }
                break;
            case DPackage.CMD_TYPE.block:
                {
                    this.m_bUpdateBlock[this.NodeSign] = false;
                    if (pkg.dataLength === 0) {
                        break;
                    }

                    let reader = new BufferReader(pkg.data[0]);
                    let blocks = [];
                    while (reader.left() > 0) {
                        let block = Block.fromReader(reader);
                        blocks.push(block);
                    }
                    if (blocks.length > 0) {
                        await this.m_nodeChain.addBlocks(blocks);
                    }
                }
                break;
            case DPackage.CMD_TYPE.getBlock:
                {
                    if (pkg.dataLength === 0) {
                        break;
                    }

                    let jsonInfo = JSON.parse(pkg.data[0]);
                    let blockRaw = this.m_nodeChain.getBlocksRaw(jsonInfo);
                    if (blockRaw && blockRaw != "") {
                        DPackage.createStreamWriter({ cmdType: DPackage.CMD_TYPE.block }, null, blockRaw.length).writeData(blockRaw).bind(conn);
                    }
                    else {
                        DPackage.createStreamWriter({ cmdType: DPackage.CMD_TYPE.block }, null, 0).bind(conn);
                    }
                }
                break;
            case DPackage.CMD_TYPE.tx:
                {
                    // let txRaw = null;
                    // if (pkg.data.length > 1) {
                    //     txRaw = Buffer.concat(pkg.data);
                    // } else {
                    //     txRaw = pkg.data[0];
                    // }
                    //let tx = TX.fromRaw(txRaw);
                    let txRaw = pkg.data[0];

                    let sig = this.m_account.signHash(txRaw);
                    let data = Buffer.from(JSON.stringify({ pubkey: this.m_account.getPublicKey().toString('hex'), sig: sig, tx: txRaw }));
                    this._beginBFTEx(MetaNode.DBFT_TYPE.chaintx, sig, this.m_address.toString(), "complete", data);
                }
                break;
            default:
                await super._onPkg(conn, pkg);
                break;
        }
    }

    startRPCServer(port) {
        let server = new RPCServer('0.0.0.0', port);

        server.on('createCoinbase', async (args, resp) => {
            //console.log("111========^^^^^^^^ "+args.toString());
            //args = outputArray : [{address:addressStr, amount:amount}, {address:addressStr, amount:amount}]
            //await this.createCoinBase(args);
            let txRaw = Buffer.from(args["tx"]);

            let sig = this.m_account.signHash(txRaw);
            let data = Buffer.from(JSON.stringify({ pubkey: this.m_account.getPublicKey().toString('hex'), sig: sig, tx: txRaw }));
            this._beginBFTEx(MetaNode.DBFT_TYPE.chaintx, sig, this.m_address.toString(), "complete", data);

            resp.write('success!');
            resp.end();
        });

        server.on('addGroupTx',async(args,resp) => {
            let txRaw = Buffer.from(args["tx"]);
            let sig = Buffer.from(args["sig"]);
            let data = Buffer.from(JSON.stringify({sig: sig, tx: txRaw }));
            this._beginBFTEx(MetaNode.DBFT_TYPE.metatx, sig, this.m_address.toString(), "complete", data);
            resp.write('success!');
            resp.end();
        });

        server.on('getProof',async (args,resp) => {
            let height = parseInt(Buffer.from(args['bH']));
            let maxH = this.m_metaChain.getNowHeight();
            let ret = {items:[]};
            let i=0;
            for (i=height;i<=maxH;i++) {
                let header = await this.m_metaChain.getHeaderByHeight(i);
                if (!header) {
                    break;
                }
                let block = this.m_metaChain.getBlock(header.hash('hex'));
                if (!block) {
                    break;
                }
                for (const tx of block.txs) {
                    if (!tx.isDataTX()) {
                        continue;
                    }
                    let metaInfo = Info.fromRaw(tx.getData());
                    if (metaInfo.getType() === Info.type.PROOFINFO) {
                        let proofInfo = {}
                        proofInfo["pid"]=metaInfo.pid;
                        proofInfo["block"]=metaInfo.block;
                        proofInfo["gid"]=metaInfo.gid;
                        proofInfo["proof"]=metaInfo.proof;
                        ret.items.push(proofInfo);
                    }
                }
            }
            ret.eH = i<maxH?i:maxH;

            resp.write(JSON.stringify(ret));
            resp.end();
        });

        server.on('getNowBlockHeight', (args, resp) => {
            resp.write(this.m_headerChain.getNowHeight().toString());
            resp.end();
        });

        server.Start();
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

        this.m_bUpdateHeader[sign] = true;
        DPackage.createStreamWriter({ cmdType: msg }, { start: beginHeight, len: 500 }, 0).bind(conn);
    }

    async doUpdateBlock(sign,msg, hashList) {
        if (this.m_bUpdateBlock[sign] || !hashList || hashList.length === 0) {
            //更新中，不处理,不用担心漏更新，下次会触发的
            return;
        }

        let conn = await this.getRandomConn();
        if (!conn) {
            return;
        }

        this.m_bUpdateBlock[sign] = true;

        let jsonInfo = JSON.stringify(hashList);
        let raw = Buffer.from(jsonInfo);
        let sig = this.m_account.signHash(raw);
        let body = { 'pid': this.m_address.toString(), 'pubkey': this.m_account.getPublicKey(), 'sig': sig };
        DPackage.createStreamWriter({ cmdType: msg }, body, raw.length).writeData(raw).bind(conn);
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