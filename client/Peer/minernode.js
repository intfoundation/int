'user strict'

const DPackage = require('./package');
const AccountNode = require('./account_node');
const Block = require("../../chainlib/Block/block");
const Header = require('../../chainlib/Block/headers');
const BufferReader = require('../../chainlib/Utils/reader');
const KeyRing = require('../../chainlib/Account/keyring');
const Address = require('../../chainlib/Account/address');
const {MTX} = require('../../chainlib/Transcation/mtx');
const digest = require('../../chainlib/Crypto/digest');
const WageDB = require('../../db/wage');
const NodeBlockChain = require('../../chainlib/Nodes/nodeblockchain');
const ChainDB = require('../../db/chain');
const assert = require('assert');
const {Info} = require('../../chainlib/Infos/Info');

class MinerNode extends AccountNode {
    constructor(params) {
        super(params);
        this.m_state = MinerNode.STATE.init;
        this.m_wageDB = new WageDB(params.wagedb);
        this.m_blockChain = new NodeBlockChain(params.chainConfig);
        this.m_metaPeerids = [];
        this.connMetaPeerid=""; //目前只考虑链接到一个metanode节点
        this.m_bUpdateBlock= false;
        this.m_bUpdateHeader
        this.m_updateBlockStateTimerID = 0;
        this.m_updateHeaderStateTimerID = 0;
    }

    async create() {
        if (this.m_state !== MinerNode.STATE.init) {
            return AccountNode.ERROR.invalidState;
        }

        await this._createStack();
        await this.m_blockChain.create();
        await this.m_wageDB.init();

        let header = await this.m_blockChain.getHeaderByHeight(0);
        if (header){
            let block = this.m_blockChain.getBlock(header.hash('hex'));
            if (block) {
                for (const tx of block.txs) {
                    assert(tx.isDataTX());
                    let metaInfo = Info.fromRaw(tx.getData());
                    if (metaInfo.getType() === Info.type.METAINFO) {
                        let peerid = KeyRing.fromPublic(metaInfo.pubkey).getAddress('string');
                        this.m_metaPeerids.push(peerid);
                    }
                }
            }
        }

        let conn = await this._connectToMetaNode();
        if(!conn) {
            return MinerNode.ERROR.networkError;
        }
        console.log(`${this.peerid} connect to supernode success,super peerid=${conn.remote.peerid}`);

        this.m_blockChain.on("OnUpdateHeader",async (blockChain,beginHeight) => {
            this.onUpdateHeader(blockChain,beginHeight);
        });
        this.m_blockChain.on("OnUpdateBlock",async (blockChain) => {
            this.onUpdateBlock(blockChain);
        });


        let timerid = 0;
        let _doConn = async () => {
            if (timerid !== 0) {
                return true;
            }
            let conn = await this._connectToMetaNode();
            if (conn) {
                return true;
            }
            return new Promise((resolve) => {
                timerid = setInterval( async () => {
                    let conn = await this._connectToMetaNode();
                    if (!conn) {
                        return;
                    }
                    clearInterval(timerid);
                    timerid = 0;
                    resolve(true);
                },2000);
            });
        };

        this.on("OnConnBreakof",async () => {
            console.log('OnConnBreakof------------');
            this.connMetaPeerid = "";
            await _doConn();
            this.m_blockChain.EmitUpdateHeader();
        });

        setInterval(async ()=> {
            if(this.connMetaPeerid !== "") {
                let conn = this._getConn(this.connMetaPeerid);
                if (conn) {
                    conn.close();
                    this.connMetaPeerid = "";
                }
            }
            await _doConn();
        },60*60*1000);

        this.m_blockChain.EmitUpdateHeader();
        this.m_blockChain.EmitUpdateBlock();

        this.changeState(MinerNode.STATE.create);
        return MinerNode.ERROR.success;
    }

    changeState(newState) {
        if (newState === this.m_state) {
            return;
        }
        let oldState = this.m_state;
        this.m_state = newState;
        this.emit('onStateChange', oldState, this.m_state);
    }

    async _connectToMetaNode() {
        if(this.connMetaPeerid === "") {
            let nIndex = Math.floor(Math.random()*this.m_metaPeerids.length);
            this.connMetaPeerid = this.m_metaPeerids[nIndex];
        }
        if (!this.connMetaPeerid) {
            return null;
        }
        if (this.connMetaPeerid.length === 0) {
            return null;
        }
        let [ret,conn] = await this.getConnToPeer(this.connMetaPeerid);
        return conn;
    }

    async _onPkg(conn,pkg) {
        switch(pkg.header.cmdType) {
            case DPackage.CMD_TYPE.header:
            {
                this.updateHeaderState(false);
                if (pkg.dataLength === 0) {
                    console.log('[minnernode DPackage.CMD_TYPE.header] update miner_header total=0');
                    break;
                }

                let reader = new BufferReader(pkg.data[0]);
                let headers = [];
                while (reader.left() > 0) {
                    let header = Header.fromReader(reader);
                    headers.push(header);
                }
                if (headers.length > 0) {
                    await this.m_blockChain.addHeaders(headers);
                }
                console.log('[minnernode DPackage.CMD_TYPE.header] update miner_header total=' + headers.length.toString());

                if (headers.length === 500) {
                    this.m_blockChain.EmitUpdateHeader();
                }
            }
                break;
            case DPackage.CMD_TYPE.block:
            {
                this.updateBlockState(false);
                if (pkg.dataLength === 0) {
                    break;
                }

                let reader = new BufferReader(Buffer.from(pkg.data[0],'hex'));
                let blocks = [];
                while (reader.left() > 0) {
                    let block = Block.fromReader(reader);
                    blocks.push(block);
                }
                console.log('[minnernode _onPkg DPackage.CMD_TYPE.block] updatedate block come back length='+blocks.length.toString());
                if(blocks.length > 0) {
                    await this.m_blockChain.addBlocks(blocks);
                }
                if (this.m_blockChain.getUpdateBlockListCount() !== 0) {
                    console.log('[minnernode  DPackage.CMD_TYPE.block] need continue updateing block');
                    this.onUpdateBlock(this.m_blockChain);
                }
            }
                break;

            case DPackage.CMD_TYPE.broadcastBlock:
            {
                console.log(`[minnernode _onPkg DPackage.CMD_TYPE.broadcastBlock] ${this.m_address.toString()} receive new block,length=${this.m_blockChain.getNowHeight()}`);
                if (pkg.dataLength === 0) {
                    break;
                }

                let ring = KeyRing.fromPublic(Buffer.from(pkg.body.pubkey,'hex'));
                let sig = Buffer.from(pkg.body.sig,'hex');
                if (ring.verifyHash(pkg.data[0],sig)) {
                    let header = Header.fromRaw(pkg.data[0]);
                    await this.m_blockChain.addHeaders([header]);
                }
            }
                break;
            case DPackage.CMD_TYPE.check:
            {
                if (pkg.dataLength === 0) {
                    break;
                }

                this._onCheck(conn,pkg.body,pkg.data[0]);
            }
                break;

            case DPackage.CMD_TYPE.proofResp:
            {
                this.m_wageDB.removeWage(pkg.body.metasig);
            }
                break;

            case DPackage.CMD_TYPE.checkResp:
            {
                if (pkg.dataLength === 0) {
                    break;
                }

                this._onCheckResp(conn,pkg.body,pkg.data[0]);
            }
                break;

            case DPackage.CMD_TYPE.loginResp:
            {
                console.log(`[minnernode _onPkg DPackage.CMD_TYPE.loginResp] ${this.m_address.toString()} come back`);
                if (pkg.body.length) {
                    console.log(`[minnernode _onPkg DPackage.CMD_TYPE.loginResp] ${this.m_address.toString()} error,pkg.body.length=${pkg.body.length}`);
                    break;
                }

                pkg.body.pubkey = Buffer.from(pkg.body.pubkey,'hex');
                pkg.body.sig = Buffer.from(pkg.body.sig,'hex');
                let ring = KeyRing.fromPublic(pkg.body.pubkey);
                if (!ring.verifyHash(pkg.body.resp, pkg.body.sig)) {
                    console.log(`[minnernode _onPkg DPackage.CMD_TYPE.loginResp] ${this.m_address.toString()} ring.verifyHash error`);
                    break;
                }

                pkg.body.resp = JSON.parse(pkg.body.resp);
                if(pkg.body.resp.metas) {
                    this.m_metaPeerids = JSON.parse(pkg.body.resp.metas);
                }

                this._sendCheck(pkg.body.sig.toString('hex'),pkg.body.resp.members,pkg.body.resp.gid);
            }
                break;

            default:
                await super._onPkg(conn,pkg);
                break;
        }
    }

    async onUpdateHeader(blockChain,beginHeight) {
        if (this.m_bUpdateHeader) {
            return;
        }
        this.updateHeaderState(true);
        let conn = await this._connectToMetaNode();
        if (!conn) {
            this.updateHeaderState(false);
            return;
        }
        DPackage.createStreamWriter({cmdType:DPackage.CMD_TYPE.getHeader},{start:beginHeight,len:500},0).bind(conn);
    }

    async onUpdateBlock(blockChain) {
        if (this.m_bUpdateBlock) {
            console.log('[minnernode onUpdateBlock] return this.m_bUpdateBlock='+this.m_bUpdateBlock.toString());
            return;
        }

        this.updateBlockState(true);
        let conn = await this._connectToMetaNode();
        if (!conn) {
            this.updateBlockState(false);
            console.log('[minnernode onUpdateBlock] return conn error');
            return;
        }
        let hashList = blockChain.getUpdateBlockList(1000);
        if (!hashList || hashList.length === 0) {
            this.updateBlockState(false);
            console.log('[minnernode onUpdateBlock] return hashList='+hashList.length.toString());
            return ;
        }
        let jsonInfo = JSON.stringify(hashList);
        let raw = Buffer.from(jsonInfo);
        let sig = this.m_account.signHash(raw);
        let body = {'pid':this.m_address.toString(), 'pubkey':this.m_account.getPublicKey(),'sig':sig};
        DPackage.createStreamWriter({cmdType:DPackage.CMD_TYPE.getBlock},body,raw.length).writeData(raw).bind(conn);
    }


    async spend(senderWIF, outputsArray) {
        let account = KeyRing.fromSecret(senderWIF);
        let address = account.getAddress();
        let mtx = new MTX();
        let needTotal = 0;
        for (let output of outputsArray) {
            mtx.addOutput(Address.fromString(output.address),output.amount);
            needTotal += output.amount;
        }
        let coins = await this.m_blockChain.getCoinsByAddress(address);
        //检查一下总value是否足够
        let total = 0;
        for (let coin of coins) {
            total += coin.value;
        }
        if (total < needTotal) {
            return ;
        }
        await mtx.fund(coins, {rate:0,changeAddress:address});
        mtx.sign(account);
        let tx = mtx.toTX();
        let txRaw = tx.toRaw();
        let conn = await this._connectToMetaNode();
        if (!conn) {
            return ;
        }
        DPackage.createStreamWriter({cmdType:DPackage.CMD_TYPE.tx},null,txRaw.length).writeData(txRaw).bind(conn);
    }

    async beginMine() {
        setInterval(async () => {
            await this._login();
        },10*60*1000);
    }

    async _sendWageProof(proof) {
        if (!proof) {
            return ;
        }

        let jsonInfo = JSON.stringify(proof);
        let raw = Buffer.from(jsonInfo);
        let sig = this.m_account.signHash(raw);

        let conn = await this._connectToMetaNode();
        if (!conn) {
            return;
        }
        DPackage.createStreamWriter({cmdType:DPackage.CMD_TYPE.proof},{'pubkey':this.m_account.getPublicKey(),'sig':sig,raw:raw},0).bind(conn);
    }

    async _sendCheck(metasig,group,gid) {
        console.log(`[minnernode _sendCheck]`);
        let nowHeight = this.m_blockChain.getStorageHeight();
        let blockIndex = Math.floor(Math.random() * (nowHeight+1));

        let header = await this.m_blockChain.getHeaderByHeight(blockIndex);
        if (!header) {
            console.log(`[minnernode _sendCheck],header null,blockIndex=${blockIndex},nowHeight=${nowHeight}`);
            return ;
        }
        let block = this.m_blockChain.getBlock(header.hash('hex'));

        let txIndex = Math.floor(Math.random() * block.txs.length);
        let txHash = block.txs[txIndex].hash('hex');

        let bRet = await this.m_wageDB.setCheck(metasig,txHash,gid);
        if (!bRet) {
            console.log(`[minnernode _sendCheck],this.m_wageDB.setCheck failed`);
            return;
        }

        let check = {'version':0,'metasig':metasig,'blockIndex':blockIndex,'txIndex':txIndex};
        let raw = Buffer.from(JSON.stringify(check));
        let sig = this.m_account.signHash(raw);

        for (let peerid of group) {
            if (peerid !== this.peerid) {
                let [ret,conn] = await this.getConnToPeer(peerid);
                DPackage.createStreamWriter({cmdType:DPackage.CMD_TYPE.check},{'pubkey':this.m_account.getPublicKey(),'sig':sig},raw.length).writeData(raw).bind(conn);
            }
        }
    }

    async _onCheck(conn,body,data) {
        console.log(`[minnernode _onCheck]`);
        body.pubkey = Buffer.from(body.pubkey,'sig');
        body.sig = Buffer.from(body.sig,'hex');
        let ring = KeyRing.fromPublic(body.pubkey);
        if (!ring.verifyHash(Buffer.from(data,'hex'),body.sig)) {
            console.log(`[minnernode _onCheck],verifyHash failed`);
            return ;
        }

        let check = JSON.parse(data.toString());
        let header = await this.m_blockChain.getHeaderByHeight(check.blockIndex);
        if (!header) {
            console.log(`[minnernode _onCheck],header null,blockIndex=${check.blockIndex}`);
            return ;
        }
        let block = this.m_blockChain.getBlock(header.hash('hex'));
        if (!block) {
            console.log(`[minnernode _onCheck],block error,blockhash=${header.hash('hex')}`);
            return ;
        }
        if (block.txs.length <= check.txIndex ) {
            console.log(`[minnernode _onCheck],txs.length error,blockIndex=${block.txs.length}`);
            return;
        }
        let txHash = block.txs[check.txIndex].hash('hex');

        let respHash = digest.sha1(txHash+check.metasig+this.m_address.toString()).toString('hex');
        let resp = {'timestamp': Date.now().toString(), 'resphash': respHash};
        resp = JSON.stringify(resp)
        let respSig = this.m_account.signHash(resp);
        let ret = {'pid':this.m_address.toString(),'metasig': check.metasig,'respSig':respSig.toString('hex'), 'resp': resp};
        let raw = Buffer.from(JSON.stringify(ret));
        let sig = this.m_account.signHash(raw);

        DPackage.createStreamWriter({cmdType:DPackage.CMD_TYPE.checkResp},{'pubkey':this.m_account.getPublicKey(),'sig':sig},raw.length).writeData(raw).bind(conn);
    }

    async _onCheckResp(conn,body,data) {
        console.log(`[minnernode _onCheckResp]`);
        body.pubkey = Buffer.from(body.pubkey,'hex');
        body.sig = Buffer.from(body.sig,'hex');
        let ring = KeyRing.fromPublic(body.pubkey);
        if (!ring.verifyHash(Buffer.from(data,'hex'),body.sig)) {
            console.log(`[minnernode _onCheckResp],verifyHash failed`);
            return ;
        }

        let jsonDict = JSON.parse(data.toString());
        await this.m_wageDB.setResp(jsonDict.metasig,jsonDict.pid,jsonDict.respSig.toString(),jsonDict.resp);
    }

    async _login() {
        let proof = await this.m_wageDB.getWageProof();
        if (proof) {
            await this._sendWageProof(proof);
        }

        let verifyStr = Date.now().toString();
        let sig = this.m_account.signHash(Buffer.from(verifyStr));
        let conn = await this._connectToMetaNode();
        if (!conn) {
            console.log(`[minnernode _login] conn=null`);
            return;
        }

        DPackage.createStreamWriter({cmdType:DPackage.CMD_TYPE.login},{'pubkey':this.m_account.getPublicKey(),'sig':sig,'timestamp':verifyStr},0).bind(conn);
    }

    updateBlockState(bUpdate) {
        this.m_bUpdateBlock = bUpdate;
        if (this.m_updateBlockStateTimerID !== 0) {
            clearTimeout(this.m_updateBlockStateTimerID);
            this.m_updateBlockStateTimerID = 0;
        }

        if (bUpdate) {
            this.m_updateBlockStateTimerID = setTimeout(() => {
                this.updateBlockState(false);
            }, 7000);
        }
    }

    updateHeaderState(bUpdate) {
        this.m_bUpdateHeader = bUpdate;
        if (this.m_updateHeaderStateTimerID !== 0) {
            clearTimeout(this.m_updateHeaderStateTimerID);
            this.m_updateHeaderStateTimerID = 0;
        }

        if (bUpdate) {
            this.m_updateHeaderStateTimerID = setTimeout(() => {
                this.updateHeaderState(false);
            }, 7000);
        }
    }
}

MinerNode.STATE = {
    init: 0,
    create: 1,
    sync: 2,
    running: 3,
};

module.exports = MinerNode;