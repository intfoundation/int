"use strict";
// import {Chain} from "../chain/chain";
// import {ValueTransaction} from "../value_chain/transaction";
// import { ErrorCode } from '../error_code';
// import * as fs from 'fs-extra';
// import * as path from 'path';
// import * as assert from 'assert';
// import * as sqlite from 'sqlite';
// import * as sqlite3 from 'sqlite3';
// import { PendingTransactions } from '../chain/pending';
// import { LoggerInstance } from 'winston';
// import { BufferReader} from '../lib/reader';
// import { BufferWriter} from '../lib/writer';
// import { BaseHandler } from "../executor/handler";
//
// let Intjs = require('intjs');
//
// const intjs = new Intjs('127.0.0.1',18809);
// const initTxPoolSql = 'CREATE TABLE IF NOT EXISTS "txPool"("hash" CHAR(64) PRIMARY KEY NOT NULL UNIQUE, "fromAddress" CHAR(34) NOT NULL, "nonce" INTEGER NOT NULL, "sendStatus" INTEGER NOT NULL, "createTime" INTEGER NOT NULL, "txData" TEXT NOT NULL);';
// const queryMaxNonceSql = "SELECT MAX(nonce) as nonce from txPool where fromAddress = $fromAddress and sendStatus = $sendStatus ORDER BY createTime ASC";
// const insertTxPoolSql = 'INSERT INTO txPool (hash, fromAddress, nonce, sendStatus,createTime, txData) VALUES($hash, $fromAddress, $nonce, $sendStatus,$createTime, $txData)';
// const queryUnSendTxSql = "SELECT * from txPool where sendStatus = $sendStatus";
// const updateSendStatusSql = "UPDATE txPool SET sendStatus = $sendStatus where hash = $hash";
// enum sendStatusType {
//     unSend = 1,
//     send = 2,
//     decodeError = 3
// }
// export class TxPool{
//
//     // private m_pending: PendingTransactions;
//     // private m_db: sqlite.Database;
//     // private m_chain: Chain;
//     // private m_logger: LoggerInstance;
//     // private m_timer: NodeJS.Timer;
//     // private cycleFlag:boolean;
//     // private m_handler: BaseHandler;
//
//     // constructor(pending: PendingTransactions,
//     //             db: sqlite.Database,
//     //             chain: Chain,
//     //             logger: LoggerInstance,
//     //             timer: NodeJS.Timer,
//     //             handler: BaseHandler
//     //         ){
//     //             this.m_pending = pending;
//     //             this.m_db = db;
//     //             this.m_chain = chain;
//     //             this.m_logger = logger;
//     //             this.cycleFlag = false;
//     //             this.m_timer = timer;
//     //             this.m_handler = handler
//     //         }
//
//     constructor(){
//     }
//     // public async init(): Promise<ErrorCode> {
//     //     try {
//     //         await this.m_db.run(initTxPoolSql);
//     //     } catch (e) {
//     //         this.m_logger.error(e);
//     //         return ErrorCode.RESULT_EXCEPTION;
//     //     }
//     //     return ErrorCode.RESULT_OK;
//     // }
//
//     //签名和添加Tx到数据库，并触发定时任务高频发送交易
//     // public async addAndSignTx(tx:ValueTransaction,passWord:string,fromAddress:string): Promise<{errCode:ErrorCode,signTx?:ValueTransaction}>{
//
//         //根据from地址获取用户对应的kestore文件
//         // let filePath = process.cwd()+"/data/keystore";
//         // let files = await fs.readdir(filePath);
//         // let status = ErrorCode.RESULT_OK;
//         // let exc = new RegExp(fromAddress);
//         // let keyStore;
//         //
//         // for (let fileName of files){
//         //     if(exc.test(fileName)){
//         //         let temp = path.join(filePath,fileName);
//         //         let data = await fs.readFile(temp,"utf-8");
//         //         keyStore = JSON.parse(data);
//         //         break;
//         //     }
//         // }
//         //
//         // if(!keyStore){
//         //     return {errCode:ErrorCode.RESULT_TX_POOL_ADDRESS_NOT_EXIST}
//         // }
//         //
//         // if(keyStore.address != fromAddress){
//         //     return {errCode:ErrorCode.RESULT_TX_POOL_KEYSTORE_ERROR}
//         // }
//         // let privateKey = intjs.decrypt(keyStore,passWord);
//         // let {err, nonce} = await this.m_pending.getStorageNonce(fromAddress);
//         // let txNonce = nonce! + 1;
//         // tx.nonce = txNonce;
//         // tx.sign(privateKey);
//
//         //检查Tx信息的合法性
//         // const checker = this.m_handler.getTxPendingChecker(tx.method);
//         // if (!checker) {
//         //     this.m_logger.error(`txhash=${tx.hash} method=${tx.method} has no match listener`);
//         //     return {errCode:ErrorCode.RESULT_TX_CHECKER_ERROR,txHash:""}
//         // }
//         // const checkResut = checker(tx);
//         // if (checkResut) {
//         //     this.m_logger.error(`txhash=${tx.hash} checker error ${checkResut}`);
//         //     return {errCode:ErrorCode.RESULT_TX_CHECKER_ERROR,txHash:""}
//         // }
//         // if (this.isTxExist(tx)) {
//         //     this.m_logger.warn(`addTransaction failed, tx exist,hash=${tx.hash}`);
//         //     return {errCode:ErrorCode.RESULT_TX_EXIST,txHash:tx.hash}
//         // }
//
//         //将TX的数据写入数据库
//         // let writer = new BufferWriter();
//         // let err1 = tx.encode(writer);
//         // if (err1) {
//         //     this.m_logger.error(`send invalid transactoin`, tx);
//         //     return {errCode:err1,txHash:tx.hash};
//         // }
//         // let txData = writer.render();
//         // await this.m_db.run(insertTxPoolSql,{$hash: tx.hash, $fromAddress: fromAddress, $nonce:nonce, $sendStatus:sendStatusType.unSend, $createTime:Date.now(), $txData:txData});
//         // this.cycleSendTransaction();
//
//         //目前先不进行数据库存入直接发送到链上
//         // let sendResult = await this.m_chain.addTransaction(tx);
//         // return {errCode:sendResult,signTx:tx};
//     // }
//
//     // private async getNonceInPool(address:string): Promise<{err: ErrorCode, poolNonce: number}>{
//     //     let queryMaxNonce = await this.m_db.get(queryMaxNonceSql,{$fromAddress: address, $sendStatus: sendStatusType.unSend});
//     //     let {err, nonce} = await this.m_pending.getStorageNonce(address);
//     //     let result = 0;
//     //     if(!err){
//     //         if(queryMaxNonce && queryMaxNonce.nonce! > nonce!){
//     //             result = queryMaxNonce.nonce;
//     //         }else {
//     //             result = nonce!;
//     //         }
//     //         return {err:ErrorCode.RESULT_OK,poolNonce:result};
//     //     }else {
//     //         return {err:err,poolNonce:result};
//     //     }
//     // }
//     //
//     // //循环高频发送交易
//     // private async cycleSendTransaction():Promise<void>{
//     //     //如果已有定时任务在执行中，则直接跳过
//     //     if(!this.cycleFlag){
//     //         let unSendTxs = await this.m_db.all(queryUnSendTxSql,{$sendStatus:sendStatusType.unSend});
//     //
//     //         if (this.m_timer) {
//     //             clearTimeout(this.m_timer);
//     //             delete this.m_timer;
//     //         }
//     //
//     //         if(unSendTxs.length > 0){
//     //
//     //             this.cycleFlag = true;
//     //             this.m_timer = setTimeout(async () => {
//     //                 delete this.m_timer;
//     //                 let tx = new ValueTransaction();
//     //                 let sendStatus = sendStatusType.send;
//     //
//     //                 let err = tx.decode(new BufferReader(Buffer.from(unSendTxs[0].txData, 'hex')));
//     //
//     //                 if (err) {
//     //                     this.m_logger.debug(`Decode error txhash=${unSendTxs[0].hash}`);
//     //                     sendStatus = sendStatusType.decodeError;
//     //                 } else {
//     //                     this.m_logger.debug(`rpc server txhash=${tx.hash}, nonce=${tx.nonce}, address=${tx.address}`);
//     //                     await this.m_chain.addTransaction(tx);
//     //                 }
//     //
//     //                 try {
//     //                     await this.m_db.run(updateSendStatusSql, { $sendStatus: sendStatus,$hash: unSendTxs[0].hash});
//     //
//     //                     this.cycleFlag = false;
//     //                     //如果数组中的未发送TX数量超过1，则递归调用继续发送
//     //                     if(unSendTxs.length > 1){
//     //                         this.cycleSendTransaction();
//     //                     }
//     //                 } catch (e) {
//     //                     this.m_logger.error(`updateSendStatus ${tx.hash} failed, ${e}`);
//     //                     this.cycleFlag = false;
//     //                 }
//     //             }, 1000);
//     //         }
//     //     }else {
//     //         this.m_logger.debug("cycleSend timer is excuting !");
//     //     }
//     // }
//     // protected isTxExist(tx: ValueTransaction): boolean {
//     //     //首先查看在pending交易池中是否存在
//     //     if()
//     //     for (let t of this.m_transactions) {
//     //         if (t.tx.hash === tx.hash) {
//     //             return true;
//     //         }
//     //     }
//     //
//     //     if (!this.m_orphanTx.get(tx.address as string)) {
//     //         return false;
//     //     }
//     //
//     //     for (let orphan of this.m_orphanTx.get(tx.address as string) as TransactionWithTime[]) {
//     //         if (tx.hash === orphan.tx.hash) {
//     //             return true;
//     //         }
//     //     }
//     //     return false;
//     // }
//
// }
