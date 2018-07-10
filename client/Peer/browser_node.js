//为区块链浏览器准备的node，只会主动连接，不绑定Account
//功能：1. 拉取所有头到本地； 2. 控制拉取所有块到本地；3. 从块里获取信息; 4. 把一个tx广播到网络
// 5. 查询某个账户的余额和Coin

const DPackage = require('./package');
const BufferReader = require('../../src/chainlib/Utils/reader');
const Header = require('../../src/chainlib/Block/headers');
const Block = require('../../src/chainlib/Block/block');
const Address = require('../../src/chainlib/Account/address');

const KeyRing = require('../../src/chainlib/Account/keyring');
const MTX = require('../../src/chainlib/Transcation/mtx');
const BlockNode = require('./block_node');

const NodeBlockChain = require('../../src/chainlib/Nodes/nodeblockchain');
const assert = require('assert');
const {Info} = require('../../src/chainlib/Infos/Info');

class BrowserNode extends BlockNode {
    constructor(param) {
        super(param.protocolConfig);
        this.m_state = BrowserNode.STATE.init;
        this.syncBlockList = [];
        this.syncingBlock = false;
        this.chainNode = new NodeBlockChain(param.chainConfig);

        this.m_metaPeerids = [];
        this.connMetaPeerid=""; //目前只考虑链接到一个metanode节点
    }

    changeState(newState) {
        if (this.m_state === newState) {
            return;
        }
        let oldState = this.m_state;
        this.m_state = newState;
        this.emit('onStateChange', oldState, this.m_state);
    }

    // 获取节点状态
    getState() {
        return this.m_state;
    }

    // 获取当前链高度
    getNowHeight() {
        return this.chainNode.getNowHeight();
    }

    // 通过地址查询余额
    async getAmountByAddress(addressStr) {
        let address = Address.fromString(addressStr);
        let amount = await this.chainNode.getAddressAmount(address);
        return amount;
    }

    // 通过块Hash查询所有交易
    async getBlockByHash(hash) {
        let block = this.chainNode.getBlock(hash);
        if (block) {
            return block;
        }
        return null;
    }

    //通过块hash得到块大小
    getBlockSizeByHash(hash) {
        return this.chainNode.getBlockSize(hash);
    }


    // 发送交易
    async sendTx(txRawStr) {
        let txRaw = Buffer.from(txRawStr, 'hex');
        let conn = await this._connToSuperNode();
        DPackage.createStreamWriter({ cmdType: DPackage.CMD_TYPE.tx }, null, txRaw.length).writeData(txRaw).bind(conn);
    }

    // 通过块高度查询所有交易
    async getBlockByHeight(height) {
        let header = await this.chainNode.getHeaderByHeight(height);
        return this.getBlockByHash(header.hash('hex'));
    }

    async create() {
        if (this.m_state !== BrowserNode.STATE.init) {
            return Promise.resolve(BrowserNode.ERROR.invalidState);
        }
        
        await this._createStack();
        await this.chainNode.create();

        let header = await this.chainNode.getHeaderByHeight(0);
        if (header){ 
            let block = this.chainNode.getBlock(header.hash('hex'));
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

        console.log('waiting connect to supernode');
        let conn = await this._connectToMetaNode();
        if (!conn) {
            return BrowserNode.ERROR.networkError;
        }
        console.log('connect to supernode success');

        this.chainNode.on("OnUpdateHeader",(obj,beginHeight) => {
            this.onUpdateHeader(obj,beginHeight);
        });

        this.chainNode.on("OnUpdateBlock",(obj,hashList) => {
            this.onUpdateBlock(obj,hashList);
        });

        this.chainNode.EmitUpdateHeader();
        this.chainNode.EmitUpdateBlock();
        
        return BrowserNode.ERROR.success;
    }

    async _connectToMetaNode() {
        if(this.connMetaPeerid === "") {
            let nIndex = Math.floor(Math.random()*this.m_metaPeerids.length);
            this.connMetaPeerid = this.m_metaPeerids[nIndex];
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
                    this.m_bUpdateHeader = false;
                    if (pkg.dataLength === 0) {
                        if (!this.m_bUpdateHeader && !this.m_bUpdateBlock) {
                            this.changeState(BrowserNode.STATE.updated);
                        }
                        break;
                    }

                    let reader = new BufferReader(pkg.data[0]);
                    let headers = [];
                    while (reader.left() > 0) {
                        let header = Header.fromReader(reader);
                        headers.push(header);
                    }
                    if (headers.length > 0) {
                        await this.chainNode.addHeaders(headers);
                    }

                    if (headers.length === 500) {
                        this.m_blockChain.EmitUpdateHeader();
                    }

                    //addHeaders可能触发更新块
                    if (!this.m_bUpdateHeader && !this.m_bUpdateBlock) {
                        this.changeState(BrowserNode.STATE.updated);
                    }
                }
                break;
            case DPackage.CMD_TYPE.block:
                {
                    this.m_bUpdateBlock = false;
                    if (pkg.dataLength === 0) {
                        if (!this.m_bUpdateHeader && !this.m_bUpdateBlock) {
                            this.changeState(BrowserNode.STATE.updated);
                        }
                        break;
                    }

                    let reader = new BufferReader(Buffer.from(pkg.data[0],'hex'));
                    let blocks = [];
                    while (reader.left() > 0) {
                        let block = Block.fromReader(reader);
                        blocks.push(block);
                    }
                    if(blocks.length > 0) {
                        await this.chainNode.addBlocks(blocks);
                    }
                    
                    //addBlocks可能继续触发更新，所以还是需要判断m_bUpdateBlock
                    if (!this.m_bUpdateHeader && !this.m_bUpdateBlock) {
                        this.changeState(BrowserNode.STATE.updated);
                    }
                }
                break;

            case DPackage.CMD_TYPE.broadcastBlock:
                {
                    console.log(this.peerid.toString()+" receive DPackage.CMD_TYPE.broadcastBlock------------------------------");
                    if (pkg.dataLength === 0) {
                        break;
                    }

                    let ring = KeyRing.fromPublic(Buffer.from(pkg.body.pubkey,'hex'));
                    let sig = Buffer.from(pkg.body.sig,'hex');
                    if (ring.verifyHash(pkg.data[0],sig)) {
                        let header = Header.fromRaw(pkg.data[0]);
                        await this.chainNode.addHeaders([header]);
                    }
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
        this.changeState(BrowserNode.STATE.syncing);
        this.m_bUpdateHeader = true;
        let conn = await this._connectToMetaNode();
        DPackage.createStreamWriter({cmdType:DPackage.CMD_TYPE.getHeader},{start:beginHeight,len:500},0).bind(conn);
    }

    async onUpdateBlock(blockChain,hashList) {
        if (!hashList || this.m_bUpdateBlock) {
            return;
        }

        if (hashList.length === 0) {
            this.changeState(BrowserNode.STATE.updated);
            return;
        }

        this.changeState(BrowserNode.STATE.updating);
        this.m_bUpdateBlock = true;
        let conn = await this._connectToMetaNode();
        let jsonInfo = JSON.stringify(hashList);
        let raw = Buffer.from(jsonInfo);
        let sig = "";
        //let body = {'pid':this.m_address.toString(), 'pubkey':this.m_account.getPublicKey(),'sig':sig};
        let body = {'pid':"", 'pubkey':"",'sig':""};
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
        let coins = await this.chainNode.getCoinsByAddress(address);
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
        DPackage.createStreamWriter({cmdType:DPackage.CMD_TYPE.tx},null,txRaw.length).writeData(txRaw).bind(conn);
    }
}

BrowserNode.STATE = {
    init: 0, //初始化后就处于这个状态
    syncing: 1, //开始向其他节点询问最新的链头信息
    updating: 2, //发现最新的链比自己的新，正在顺序拉取新块更新数据库
    updated: 3 //认为自己的链已经赶上最新了
};

module.exports = BrowserNode;