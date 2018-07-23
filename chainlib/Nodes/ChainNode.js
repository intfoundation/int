/**
 * ChainNodes是下层链的Nodes，负责存储和操作下层链
 */

const UTXOS = require('../../chainlib/Coins/UTXOS');
const ChainDB = require('../../db/chain');
const BlockStorage = require('../../chainlib/Block/block_storage');
const CoinView = require('../../chainlib/Coins/coinview');
const HeaderChain = require('../../chainlib/Chain/HeaderChain');
const Block = require('../../chainlib/Block/block');
const BlockUtil = require("../../chainlib/Block/util");

const assert = require('assert');
const {Info} = require('../Infos/Info');

class ChainNode {
    /**
     * 
     * @param {string} chaindb 
     * @param {string} storagePath 
     */
    constructor(params) {
        this.m_chainDB = new ChainDB(params.chaindb);
        this.m_blockStorage = new BlockStorage(10, params.storagePath);
        this.m_coinView = new CoinView();
        this.config = params.config;

        this.metaList = new Map();
    }

    async create() {
        this.m_orphanBlocks = new Map();

        await this.m_chainDB.init();
        this.m_headerChain = new HeaderChain(this.m_chainDB);
        this.m_utxos = new UTXOS(this.m_chainDB);
        await this.m_headerChain.init();
        this.m_blockStorage.init();
        await this.m_utxos.init();
        if (this.m_headerChain.isEmpty()) {
            let genesisBlock = Block.fromRaw(this.config.genesisBlockRaw, 'hex');
            await this.processBlock(genesisBlock);
        }
        await this.m_utxos.fillCoinView(this.m_coinView);
    }

    getMetaList() {
        if (this.metaList.size > 0) {
            return this.metaList;
        }
        let genesisBlock = this.m_blockStorage.get(this.config.genesinBlockHash);
        if (genesisBlock) {
            for (const tx of genesisBlock.txs) {
                assert(tx.isDataTX());
                let metaInfo = Info.fromRaw(tx.getData());
                if (metaInfo.getType() === Info.type.METAINFO) {
                    this.metaList.set(metaInfo.number, metaInfo.pubkey);
                }
                
            }
        }

        return this.metaList;
    }

    updateMetaList(jsonList){
        this.metaList.clear();
        this.getMetaList();
        for(const number in jsonList)
        {
            this.metaList.set(number,jsonList[number]);
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
        await this.m_utxos.updateFromBlock(newBlock);
        await this.m_chainDB.CommitTranscation();

        if (!noStorageBlock) {
            this.m_blockStorage.add(newBlock);
        }
    }

    //封装headerChain, utxo, storage的接口给外部使用，不让使用者直接接触到里边的类
    spendTX(tx) {
        return this.m_coinView.spendTX(tx);
    }

    addTX(tx, index) {
        return this.m_coinView.addTX(tx, index);
    }

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
        return newBlock;
    }

    getCurrentUTXOHeight() {
        return this.m_utxos.currentHeight;
    }

    async getAddressAmount(address) {
        return await this.m_utxos.getAddressAmount(address);
    }

    async getCoinsByAddress(address) {
        return await this.m_utxos.getCoinsByAddress(address);
    }
}

module.exports = ChainNode;