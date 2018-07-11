"use strict";

const BaseDB = require('./basedb');
const Coin = require('../chainlib/Coins/coin');

const initHeaderSql = 'CREATE TABLE if not exists "HeaderDB"("hash" CHAR(64) PRIMARY KEY NOT NULL UNIQUE, "height" INTEGER NOT NULL UNIQUE,  "header" BLOB NOT NULL);';
const getbyhashSql = 'select header from HeaderDB where hash = $hash';
const getbyheightSql = 'select header from HeaderDB where height = $height';
const insertSql = 'insert into HeaderDB values($hash, $height, $header)';
const getHeightSql = 'select max(height) from HeaderDB';

const initUTXOSql = 'CREATE TABLE if not exists "UTXODB"("key" VARCHAR PRIMARY KEY NOT NULL UNIQUE' +
    ', "address" CHAR(34) NOT NULL,  "amount" INTEGER NOT NULL, "coin" BLOB NOT NULL);';
const getByKeySql = 'select coin from UTXODB where key = $key';
const setSql = 'insert into UTXODB values($key, $address, $amount, $coin)';
const removeSql = 'delete from UTXODB where key = $key';
const getByAddressSql = 'select key, coin from UTXODB where address = $address';
const getAllSql = 'select key, coin from UTXODB';
const getAmountSql = 'select sum(amount) from UTXODB where address = $address';

const initDataSql = 'CREATE TABLE if not exists "InfoDB"("key" VARCHAR PRIMARY KEY NOT NULL UNIQUE, "value" VARCHAR NOT NULL);';
const getDataSql = 'select value from InfoDB where key= $key';
const setDataSql = 'replace into InfoDB values ($key, $value)';

class ChainDB extends BaseDB {
    constructor(path) {
        super(path);
    }

    async init() {
        await this._open();
        await this._initHeader();
        await this._initUTXO();
        await this._initData();
    }

    async _initHeader() {
        let err = await this._run(initHeaderSql);
        return err === null;
    }

    async _initUTXO() {
        let err = await this._run(initUTXOSql);
        return err === null;
    }
    async _initData() {
        let err = await this._run(initDataSql);
        return err === null;
    }

    async getCoinRaw(coinkey) {
        let row = await this._get(getByKeySql, { $key: coinkey });
        return row ? row.coin : null;
    }

    async setCoinRaw(coinkey, address, amount, coinRaw) {
        let err = await this._run(setSql, { $key: coinkey, $address: address, $amount: amount, $coin: coinRaw });
        return err;
    }

    async remove(coinkey) {
        let err = await this._run(removeSql, { $key: coinkey });
        return err;
    }

    async getAddressAmount(address) {
        let row = await this._get(getAmountSql, { $address: address });
        return row['sum(amount)'];
    }

    async getCoinsByAddress(address) {
        let rows = await this._all(getByAddressSql, { $address: address });

        let coins = [];
        let totalSize = 0;
        let amount = 0;
        for (let coinRaw of rows) {
            let coin = Coin.fromRaw(coinRaw.coin);
            coin.fromKey(coinRaw.key);
            totalSize += coin.getSize();
            amount += coin.value;
            coins.push(coin);
        }
        return [coins, totalSize, amount];
    }

    async fillCoinView(coinview) {
        let rows = await this._all(getAllSql);
        for (let coinRaw of rows) {
            let coin = Coin.fromRaw(coinRaw.coin);
            coin.fromKey(coinRaw.key);
            coinview.addCoin(coin);
        }
    }

    async getHeaderByHash(hash) {
        let row = await this._get(getbyhashSql, { $hash: hash });
        return row ? row.header : null;
    }

    async getHeaderByHeight(height) {
        let row = await this._get(getbyheightSql, { $height: height });
        return row ? row.header : null;
    }

    async setHeader(header) {
        let headerRaw = header.toRaw();
        let hash = header.hash('hex');
        let err = await this._run(insertSql, { $hash: hash, $height: header.height, $header: headerRaw });
        return err;
    }

    async getHeight() {
        let row = await this._get(getHeightSql);
        return row['max(height)'];
    }

    async getValue(key) {
        let row = await this._get(getDataSql, { $key: key });
        return row ? row['value'] : null;
    }

    async setValue(key, value) {
        let err = await this._run(setDataSql, { $key: key, $value: value });
        return err;
    }
}

module.exports = ChainDB;