"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const transaction_1 = require("../value_chain/transaction");
const error_code_1 = require("../error_code");
const fs = require("fs-extra");
const path = require("path");
const assert = require("assert");
const reader_1 = require("../lib/reader");
let Intjs = require('intjs');
const intjs = new Intjs('127.0.0.1', 18809);
const initTxPoolSql = 'CREATE TABLE IF NOT EXISTS "txPool"("hash" CHAR(64) PRIMARY KEY NOT NULL UNIQUE, "fromAddress" CHAR(34) NOT NULL, "nonce" INTEGER NOT NULL, "sendStatus" INTEGER NOT NULL, "createTime" INTEGER NOT NULL, "txData" TEXT NOT NULL);';
const queryMaxNonceSql = "SELECT MAX(nonce) as nonce from txPool where fromAddress = $fromAddress and sendStatus = $sendStatus ORDER BY createTime ASC";
const insertTxPoolSql = 'INSERT INTO txPool (hash, fromAddress, nonce, sendStatus,createTime, txData) VALUES($hash, $fromAddress, $nonce, $sendStatus,$createTime, $txData)';
const queryUnSendTxSql = "SELECT * from txPool where sendStatus = $sendStatus";
const updateSendStatusSql = "UPDATE txPool SET sendStatus = $sendStatus where hash = $hash";
var sendStatusType;
(function (sendStatusType) {
    sendStatusType[sendStatusType["unSend"] = 1] = "unSend";
    sendStatusType[sendStatusType["send"] = 2] = "send";
    sendStatusType[sendStatusType["decodeError"] = 3] = "decodeError";
})(sendStatusType || (sendStatusType = {}));
class pool {
    constructor(pending, db, chain, logger, timer) {
        this.m_pending = pending;
        this.m_db = db;
        this.m_chain = chain;
        this.m_logger = logger;
        this.cycleFlag = false;
        this.m_timer = timer;
    }
    async init() {
        try {
            await this.m_db.run(initTxPoolSql);
        }
        catch (e) {
            this.m_logger.error(e);
            return error_code_1.ErrorCode.RESULT_EXCEPTION;
        }
        return error_code_1.ErrorCode.RESULT_OK;
    }
    //签名和添加Tx到数据库，并触发定时任务高频发送交易
    async addAndSignTx(tx, passWord, fromAddress) {
        //根据from地址获取用户对应的kestore文件
        let filePath = process.cwd() + "/data/keystore";
        let files = await fs.readdir(filePath);
        let status = error_code_1.ErrorCode.RESULT_OK;
        let exc = new RegExp(fromAddress);
        let keyStore;
        for (let fileName of files) {
            if (exc.test(fileName)) {
                let temp = path.join(filePath, fileName);
                let data = await fs.readFile(temp, "utf-8");
                keyStore = JSON.parse(data);
                break;
            }
        }
        if (!keyStore) {
            status = error_code_1.ErrorCode.RESULT_TX_POOL_ADDRESS_NOT_EXIST;
        }
        assert(keyStore.address == fromAddress, "keystore file is wrong!");
        let privateKey = intjs.decrypt(keyStore, passWord);
        let { err, poolNonce } = await this.getNonceInPool(fromAddress);
        let nonce = poolNonce + 1;
        tx.nonce = nonce;
        tx.sign(privateKey);
        await this.m_db.run(insertTxPoolSql, { $hash: tx.hash, $fromAddress: fromAddress, $nonce: nonce, $sendStatus: sendStatusType.unSend, $createTime: Date.now(), $txData: tx });
        this.cycleSendTransaction();
        return { errCode: error_code_1.ErrorCode.RESULT_OK, txHash: tx.hash };
    }
    async getNonceInPool(address) {
        let queryMaxNonce = await this.m_db.get(queryMaxNonceSql, { $fromAddress: address, $sendStatus: sendStatusType.unSend });
        let { err, nonce } = await this.m_pending.getStorageNonce(address);
        let result = 0;
        if (!err) {
            if (queryMaxNonce && queryMaxNonce.nonce > nonce) {
                result = queryMaxNonce.nonce;
            }
            else {
                result = nonce;
            }
            return { err: error_code_1.ErrorCode.RESULT_OK, poolNonce: result };
        }
        else {
            return { err: err, poolNonce: result };
        }
    }
    //循环高频发送交易
    async cycleSendTransaction() {
        //如果已有定时任务在执行中，则直接跳过
        if (!this.cycleFlag) {
            let unSendTxs = await this.m_db.all(queryUnSendTxSql, { $sendStatus: sendStatusType.unSend });
            if (this.m_timer) {
                clearTimeout(this.m_timer);
                delete this.m_timer;
            }
            if (unSendTxs.length > 0) {
                this.cycleFlag = true;
                this.m_timer = setTimeout(async () => {
                    delete this.m_timer;
                    let tx = new transaction_1.ValueTransaction();
                    let sendStatus = sendStatusType.send;
                    let err = tx.decode(new reader_1.BufferReader(Buffer.from(unSendTxs[0].txData, 'hex')));
                    if (err) {
                        this.m_logger.debug(`Decode error txhash=${unSendTxs[0].hash}`);
                        sendStatus = sendStatusType.decodeError;
                    }
                    else {
                        this.m_logger.debug(`rpc server txhash=${tx.hash}, nonce=${tx.nonce}, address=${tx.address}`);
                        await this.m_chain.addTransaction(tx);
                    }
                    try {
                        await this.m_db.run(updateSendStatusSql, { $sendStatus: sendStatus, $hash: unSendTxs[0].hash });
                        this.cycleFlag = false;
                        //如果数组中的未发送TX数量超过1，则递归调用继续发送
                        if (unSendTxs.length > 1) {
                            this.cycleSendTransaction();
                        }
                    }
                    catch (e) {
                        this.m_logger.error(`updateSendStatus ${tx.hash} failed, ${e}`);
                        this.cycleFlag = false;
                    }
                }, 1000);
            }
        }
        else {
            this.m_logger.debug("cycleSend timer is excuting !");
        }
    }
}
exports.pool = pool;
