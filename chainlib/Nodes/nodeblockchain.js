'use strict'
const BlockChain = require('./blockchain');
const UTXOS = require('../Coins/UTXOS');
const CoinView = require('../Coins/coinview');

class NodeBlockChain extends BlockChain {
    constructor(params) {
        super(params)

        this.m_utxos = new UTXOS(this.m_chainDB);
        this.m_coinView = new CoinView();
    }

    async create() {
        await super.create();

        await this.m_utxos.init();
        await this.m_utxos.fillCoinView(this.m_coinView);
    }

    //Step1: updateUTXO
    //Step2: addHeader
    //Step3: (optional) write block to disk
    async storageBlock(newBlock) {
        await this.m_chainDB.BeginTranscation();
        let newHeaders = newBlock.toHeaders();
        if (newHeaders.height === this.m_headerChain.getNowHeight() + 1) {
            await this.m_headerChain.addHeader(newHeaders);
        }
        //update utxos from new block
        await this.m_utxos.updateFromBlock(newBlock);
        await this.m_chainDB.CommitTranscation();

         this.m_blockStorage.add(newBlock);
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

    spendTX(tx) {
        return this.m_coinView.spendTX(tx);
    }

    addTX(tx, index) {
        return this.m_coinView.addTX(tx, index);
    }
}

module.exports = NodeBlockChain;