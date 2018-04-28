/**
 * 上层链的Nodes,只存info，没有交易，不需要UTXO
 */

const ChainDB = require('../../db/chain');
const BlockStorage = require('../Block/block_storage');
const HeaderChain = require('../Chain/HeaderChain');
const Block = require('../Block/block');
const BlockUtil = require("../Block/util");
const KeyRing = require('../Account/keyring');

const assert = require('assert');
const {Info, MetaInfo} = require('../Infos/Info');
const TX = require('../Transcation/tx');

class MetaChain {
    constructor(params) {
        this.m_chainDB = new ChainDB(params.chaindb);
        this.m_blockStorage = new BlockStorage(10, params.storagePath);
        this.config = params.config;

        this.m_metaList = new Map();
    }

    async create() {
        this.m_orphanBlocks = new Map();

        await this.m_chainDB.init();
        this.m_headerChain = new HeaderChain(this.m_chainDB);
        await this.m_headerChain.init();
        this.m_blockStorage.init();
        if (this.m_headerChain.isEmpty()) {
            let genesisBlock = Block.fromRaw(this.config.genesisBlockRaw, 'hex');
            await this.processBlock(genesisBlock);
        }

        let genesisBlock = this.m_blockStorage.get(this.config.genesinBlockHash);
        if (genesisBlock) {
            for (const tx of genesisBlock.txs) {
                assert(tx.isDataTX());
                let metaInfo = Info.fromRaw(tx.getData());
                if (metaInfo.getType() === Info.type.METAINFO) {
                    this.addMetaInfo(metaInfo.pubkey, metaInfo.number);
                }
            }
        }
    }

    async processBlock(newBlock, noStorageBlock) {
        let nowHeight = this.m_headerChain.getNowHeight();
        if (newBlock.height === nowHeight + 1) {
            if (!newBlock.verify()) {
                return;
            }

            await this.storageBlock(newBlock, noStorageBlock);
            
            //get orphanBlocks at current height and add it.
            while (this.m_orphanBlocks.has(this.m_headerChain.getNowHeight() + 1)) {
                let block = this.m_orphanBlocks.get(this.m_headerChain.getNowHeight() + 1);
                await this.storageBlock(block, noStorageBlock);
                this.m_orphanBlocks.delete(block.height);
            }
        } else if (newBlock.height > nowHeight + 1) {
            //save as an Orphan Block.
            this.m_orphanBlocks.set(newBlock.height, newBlock);
        } else {
            //check header current
            let header = await this.m_headerChain.getHeaderByHeight(newBlock.height);
            if (header.hash('hex') === newBlock.hash('hex')) {
                await this.storageBlock(newBlock, noStorageBlock);
            } else {
                console.log("recv error block!!");
            }
        }
    }

    //Step1: updateUTXO
    //Step2: addHeader
    //Step3: (optional) write block to disk
    async storageBlock(newBlock, noStorageBlock) {
        await this.m_chainDB.BeginTranscation();
        let newHeaders = newBlock.toHeaders();
        await this.m_headerChain.addHeader(newHeaders);
        //update utxos from new block
        await this.m_chainDB.CommitTranscation();

        if (!noStorageBlock) {
            this.m_blockStorage.add(newBlock);
        }
    }

    getMetaList() {
        return this.m_metaList;
    }

    addMetaInfo(pubkey, id) {
        if (this.m_metaList.has(id)) {
            return false;
        }

        //兼容JSON.stringify的Buffer表现形式
        if (pubkey.type === "Buffer") {
            pubkey = Buffer.from(pubkey.data);
        }

        let peerid = KeyRing.fromPublic(pubkey).getAddress('string');
        this.m_metaList.set(id, {pubkey: pubkey, peerid: peerid});
        return true;
    }

    addMetaInfos(list) {
        let added = []
        for (const {id, pubkey} of list) {
            if (this.addMetaInfo(pubkey, id)) {
                added.push(pubkey);
            }
        }

        return added;
    }

    getOtherMetaPeerids(myPeerid) {
        let peerids = [];
        for (const [id, {pubkey, peerid}] of this.m_metaList) {
            if (peerid != myPeerid) {
                peerids.push(peerid);
            } else {
                this.initMetaNodes = true;
            }
        }

        return peerids;
    }

    isInMetaList(myid) {
        return this.m_metaList.has(myid);
    }

    peeridIsMeta(checkPeerid) {
        for (const [id, {pubkey, peerid}] of this.m_metaList) {
            if (checkPeerid === peerid) {
                return true;
            }
        }
    }

    getMetaListArray() {
        let list = [];
        for (const [id, {pubkey, peerid}] of this.m_metaList) {
            list.push({id:id, pubkey:pubkey});
        }
        return list;
    }

    getMetaListIDArray(){
        let list=[]
        for (const [id,{pubkey,peerid}] of this.m_metaList){
            list.push(id);
        }
        return list;
    }

    getMetaListSize() {
        return this.m_metaList.size;
    }

    verifySystemSig(msg, sig) {
        let systemAccount = KeyRing.fromPublic(Buffer.from(this.config.systemPubKey, 'hex'));
        return systemAccount.verifyHash(msg, sig);
    }

    verifyMetaSig(id, msg, sig) {
        if (!this.m_metaList.has(id)) {
            return false;
        }
        let account = KeyRing.fromPublic(this.m_metaList.get(id).pubkey);
        return account.verifyHash(msg, sig);
    }

    //封装headerChain, storage的接口给外部使用，不让使用者直接接触到里边的类

    async getHeadersRaw(start, len) {
        return await this.m_headerChain.getHeadersRaw(start, len);
    }

    async getHeaderByHeight(height) {
        return await this.m_headerChain.getHeaderByHeight(height);
    }

    async addHeader(header) {
        return await this.m_headerChain.addHeader(header);
    }

    getBlock(hash) {
        return this.m_blockStorage.get(hash);
    }

    hasBlock(hash) {
        return this.m_blockStorage.has(hash);
    }

    getBlockSize(hash) {
        return this.m_blockStorage.getSize(hash);
    }

    getNowHeight() {
        return this.m_headerChain.getNowHeight();
    }

    async createBlock() {
        let latestHeader = await this.m_headerChain.getHeaderByHeight(this.getNowHeight());
        let newBlock = await BlockUtil.createBlock(latestHeader, this.m_headerChain);

        let metas = this.m_metaChain.getMetaList();
        for (const {id, pubkey} of metas) {
            let info = new MetaInfo(pubkey, id);
            let dataTX = TX.createDataTX(info.toRaw(), this.m_account);
            newBlock.txs.push(dataTX);
        }

        return newBlock;
    }
}

module.exports = MetaChain;