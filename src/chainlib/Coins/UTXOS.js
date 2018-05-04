'use strict';
const StaticWriter = require('../Utils/staticwriter');
const Coin = require('../Coins/coin');

class UTXOS {
    constructor(db) {
        //UTXO DB, coinkey -> address, coinraw
        this.m_db = db;
        this.currentHeight = -1;
    }

    async init() {
        let cHeight = await this.m_db.getValue("UTXOHeight");
        if (cHeight) {
            this.currentHeight = parseInt(cHeight);
        }
    }

    async getCoin(coinkey) {
        let coinraw = await this.m_db.getCoinRaw(coinkey);
        if (coinraw) {
            let coin = Coin.fromRaw(coinraw);
            coin.fromKey(coinkey);
            return coin;
        }
        return null;
    }

    async _setCoin(coin) {
        await this.m_db.setCoinRaw(coin.toKey(), coin.script.getAddress().toString(), coin.value, coin.toRaw());
    }

    async getAddressAmount(address) {
        if (typeof script !== 'string') {
            address = address.toString();
        }
        return await this.m_db.getAddressAmount(address);
    }

    async getCoinsByAddress(address) {
        if (typeof script !== 'string') {
            address = address.toString();
        }

        let [coins, totalsize, amount] = await this.m_db.getCoinsByAddress(address);

        return coins;
    }

    async getUTXOsByAddress(address) {
        if (typeof script !== 'string') {
            address = address.toString();
        }
        let [coins, totalSize, amount] = await this.getCoinsByAddress(address);

        if (coins.length === 0) {
            return null;
        }
        let bw = new StaticWriter(totalSize + 4);
        bw.writeU32(coins.length);
        for (let coin in coins) {
            coin.toWriter(bw);
        }

        return bw.render();
    }

    async updateFromBlock(block) {
        if (block.height !== this.currentHeight +1) {
            return;
        }
        //for every tx in block
        //temp address coins and amounts
        for (let tx of block.txs) {
            //for every input, remove coin from cache and db
            for (let input of tx.inputs) {
                if (input.isCoinbase()) {
                    continue;
                }
                let coinkey = input.prevout.toKey();
                await this.m_db.remove(coinkey);
            }
            //for every output, add coin to db
            for (let i = 0; i < tx.outputs.length; i++) {
                let coin = Coin.fromTX(tx, i, -1);
                await this._setCoin(coin);
            }
        }
        this.currentHeight = block.height;
        await this.m_db.setValue("UTXOHeight", this.currentHeight);
    }

    async fillCoinView(coinview) {
        await this.m_db.fillCoinView(coinview);
    }
}
module.exports = UTXOS;