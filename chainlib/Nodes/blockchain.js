'use strict'

const ChainDB = require('../../db/chain');
const BlockStorage = require('../Block/block_storage');
const HeaderChain = require('../Chain/HeaderChain');
const Block = require('../Block/block');
const BlockUtil = require("../Block/util");
const KeyRing = require('../Account/keyring');

const assert = require('assert');
const {Info, MetaInfo} = require('../Infos/Info');
const TX = require('../Transcation/tx');
const EventEmitter = require('events')

class BlockChain  extends EventEmitter{
    constructor(params){
        super();
        this.m_chainDB = new ChainDB(params.chaindb);
        this.m_blockStorage = new BlockStorage(10, params.storagePath);
        this.m_headerChain = new HeaderChain(this.m_chainDB);
        this.config = params.config;
        this.m_orphanBlocks = new Map();
        this.m_bUpdateBlockList = [];
    }

    async create() {
        await this.m_chainDB.init();
        await this.m_headerChain.init();
        this.m_blockStorage.init();
       
        if (this.m_headerChain.isEmpty()) {
            let genesisBlock = Block.fromRaw(this.config.genesisBlockRaw, 'hex');
            await this.addBlocks([genesisBlock]);
        }   
    }

    async createBlock() {
        let lastHeader = await this.m_headerChain.getHeaderByHeight(this.getNowHeight());
        let newBlock = await BlockUtil.createBlock(lastHeader,this.m_headerChain);
        return newBlock;
    }

    //Step1: updateUTXO
    //Step2: addHeader
    //Step3: (optional) write block to disk
    async storageBlock(newBlock) {
        await this.m_chainDB.BeginTranscation();
        let newHeaders = newBlock.toHeaders();

        let headerHash = newHeaders.hash('hex');
        let blockHash = newBlock.hash('hex');
        
        if (newHeaders.height === this.m_headerChain.getNowHeight() + 1) {
            await this.m_headerChain.addHeader(newHeaders);
        }
        await this.m_chainDB.CommitTranscation();

         this.m_blockStorage.add(newBlock);
    }

    //主动触发更新header的逻辑
    async EmitUpdateHeader() {
        this.emit("OnUpdateHeader",this,this.getNowHeight()+1);
    }

    async EmitUpdateBlock() {
        let hashList = [];
        let nHeight = this.getNowHeight();
        for (let i=nHeight;i>=0; i--) {
            let header = await this.getHeaderByHeight(i);
            let hash = header.hash('hex');
            if (!this.m_blockStorage.has(hash)) {
                hashList.push(hash);
            }
        }
        if (hashList.length > 0) {
            this._doUpdateBlock(hashList);
        }
    }

    //一旦检测到某个header的index比链里面的大就触发更新header
    async addHeaders(headers){
        let updateBlockHashList = [];
        for(let header of headers){
            if(header.height > this.getNowHeight()+1) {
                this.emit("OnUpdateHeader",this,this.getNowHeight()+1);
                //不更新block
                updateBlockHashList = [];
                break;
            }
            else if (header.height < this.getNowHeight()) {
                continue;
            }
            else {
                let bRet = await this.m_headerChain.addHeader(header);
                if (!bRet) {
                    break;
                }
                let blockHash = header.hash('hex');
                if(this.m_blockStorage.has(blockHash)) {
                    continue;
                }
                if (this.m_orphanBlocks.has(header.height)) {
                    let block = this.m_orphanBlocks.get(header.height);
                    this.m_orphanBlocks.delete(header.height);
                    await this.storageBlock(block);
                } else {
                    updateBlockHashList.push(blockHash);
                }
            }

        }
        //检测是否需要更新block
        if (updateBlockHashList.length > 0) {
            this._doUpdateBlock(updateBlockHashList);
        }
    }

    _doUpdateBlock(list) {
        if (list.length >0) {
            this.m_bUpdateBlockList = this.m_bUpdateBlockList.concat(list);
        }
        
        let updateList = this.m_bUpdateBlockList.splice(0,1000);
        if (updateList.length > 0) {
            this.emit("OnUpdateBlock",this,updateList);
        }
    }

    async addBlocks(blocks) {
        for (let block of blocks){
            if (!block.verify()) {
                continue;
            }

            if (block.height > this.getNowHeight() +1) {
                this.m_orphanBlocks.set(block.height,block);
                this.emit("OnUpdateHeader",this,this.getNowHeight()+1);
            }
            else {
                await this.storageBlock(block);
            }
        }

        //遍历一下m_orphanBlocks中是否有可以加入的了
        for (const[index,block] of this.m_orphanBlocks){
            if (index === this.getNowHeight() + 1) {
                await this.storageBlock(block);
            }
        }

        this._doUpdateBlock([]);
    }

    async getHeadersRaw(start, len) {
        return await this.m_headerChain.getHeadersRaw(start, len);
    }

    async getHeaderByHeight(height) {
        return await this.m_headerChain.getHeaderByHeight(height);
    }

    getBlock(hash) {
        return this.m_blockStorage.get(hash);
    }

    getBlocksRaw(hashList) {
        let buf = new Buffer(0);
        for(let hash of hashList) {
            let block = this.getBlock(hash);
            if (block) {
                let raw = block.toRaw();
                buf = Buffer.concat([buf,raw],buf.length+raw.length);
            }
        }
        return buf;
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
}

module.exports = BlockChain;