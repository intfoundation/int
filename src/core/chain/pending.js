"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const chain_1 = require("./chain");
const error_code_1 = require("../error_code");
const Lock_1 = require("../lib/Lock");
class PendingTransactions {
    constructor(options) {
        this.m_transactions = [];
        this.m_orphanTx = new Map();
        this.m_mapNonce = new Map();
        this.m_logger = options.logger;
        this.m_storageManager = options.storageManager;
        this.m_txLiveTime = options.txlivetime;
        this.m_pendingLock = new Lock_1.Lock();
    }
    async addTransaction(tx) {
        this.m_logger.info(`addTransaction, txhash=${tx.hash}`);
        await this.m_pendingLock.enter();
        // this.m_logger.info('transactions length='+this.m_transactions.length.toString());
        // if (this.m_orphanTx.has(tx.address as string)) {
        //     this.m_logger.info('m_orphanTx length='+(this.m_orphanTx.get(tx.address as string) as Transaction[]).length);
        // }
        if (this.isExist(tx)) {
            this.m_logger.error(`addTransaction failed, tx exist,hash=${tx.hash}`);
            await this.m_pendingLock.leave();
            return error_code_1.ErrorCode.RESULT_TX_EXIST;
        }
        let ret = await this._addTx({ tx, ct: Date.now() });
        await this.m_pendingLock.leave();
        return ret;
    }
    popTransaction() {
        while (true) {
            if (!this.m_transactions.length) {
                return null;
            }
            let txTime = this.m_transactions.shift();
            if (this.isTimeout(txTime)) {
                // 当前tx已经超时，那么同一个地址的其他tx(nonce一定大于当前tx的）进行排队等待
                this.m_mapNonce.set(txTime.tx.address, txTime.tx.nonce - 1);
                let i = 0;
                while (i < this.m_transactions.length) {
                    if (this.m_transactions[i].tx.address === txTime.tx.address) {
                        let txTemp = (this.m_transactions.splice(i, 1)[0]);
                        this.addToOrphan(txTime.tx.address, txTemp);
                    }
                    else {
                        i++;
                    }
                }
            }
            else {
                return txTime.tx;
            }
        }
    }
    async updateTipBlock(header) {
        let svr = await this.m_storageManager.getSnapshotView(header.hash);
        if (svr.err) {
            this.m_logger.error(`updateTipBlock getSnapshotView failed, errcode=${svr.err},hash=${header.hash},number=${header.number}`);
            return svr.err;
        }
        if (this.m_curHeader) {
            this.m_storageManager.releaseSnapshotView(this.m_curHeader.hash);
        }
        this.m_curHeader = header;
        this.m_storageView = svr.storage;
        await this.removeTx();
        return error_code_1.ErrorCode.RESULT_OK;
    }
    isExist(tx) {
        for (let t of this.m_transactions) {
            if (t.tx.hash === tx.hash) {
                return true;
            }
        }
        if (!this.m_orphanTx.get(tx.address)) {
            return false;
        }
        for (let orphan of this.m_orphanTx.get(tx.address)) {
            if (tx.hash === orphan.tx.hash) {
                return true;
            }
        }
        return false;
    }
    async _addTx(txTime) {
        let address = txTime.tx.address;
        let { err, nonce } = await this.getNonce(address);
        if (err) {
            return err;
        }
        if (nonce + 1 === txTime.tx.nonce) {
            this.addToQueue(txTime);
        }
        else if (nonce + 1 < txTime.tx.nonce) {
            this.addToOrphan(address, txTime);
        }
        else {
            for (let i = 0; i < this.m_transactions.length; i++) {
                if (this.m_transactions[i].tx.address === txTime.tx.address && this.m_transactions[i].tx.nonce === txTime.tx.nonce) {
                    if (this.isTimeout(this.m_transactions[i])) {
                        this.m_transactions.splice(i, 1);
                        this.addToQueue(txTime);
                        // addToQueue会设置txTime的nonce进去，txTime.tx.nonce会小于inPendingNonce,所以需要重新设置回去
                        this.m_mapNonce.set(txTime.tx.address, nonce);
                        return error_code_1.ErrorCode.RESULT_OK;
                    }
                    let _err = await this.checkSmallNonceTx(txTime.tx, this.m_transactions[i].tx);
                    if (_err === error_code_1.ErrorCode.RESULT_OK) {
                        this.m_transactions.splice(i, 1);
                        this.addToQueue(txTime);
                        // addToQueue会设置txTime的nonce进去，txTime.tx.nonce会小于inPendingNonce,所以需要重新设置回去
                        this.m_mapNonce.set(txTime.tx.address, nonce);
                        return error_code_1.ErrorCode.RESULT_OK;
                    }
                    return _err;
                }
            }
            return error_code_1.ErrorCode.RESULT_ERROR_NONCE_IN_TX;
        }
        await this.ScanOrphan(address);
        return error_code_1.ErrorCode.RESULT_OK;
    }
    // 同个address的两个相同nonce的tx存在，且先前的也还没有入链
    async checkSmallNonceTx(txNew, txOld) {
        return error_code_1.ErrorCode.RESULT_ERROR_NONCE_IN_TX;
    }
    // 获取mem中的nonce值
    async getNonce(address) {
        if (this.m_mapNonce.has(address)) {
            return { err: error_code_1.ErrorCode.RESULT_OK, nonce: this.m_mapNonce.get(address) };
        }
        else {
            return await this.getStorageNonce(address);
        }
    }
    async getStorageNonce(s) {
        try {
            let dbr = await this.m_storageView.getReadableDataBase(chain_1.Chain.dbSystem);
            if (dbr.err) {
                this.m_logger.error(`get system database failed ${dbr.err}`);
                return { err: dbr.err };
            }
            let nonceTableInfo = await dbr.value.getReadableKeyValue(chain_1.Chain.kvNonce);
            if (nonceTableInfo.err) {
                this.m_logger.error(`getStorageNonce, getReadableKeyValue failed,errcode=${nonceTableInfo.err}`);
                return { err: nonceTableInfo.err };
            }
            let ret = await nonceTableInfo.kv.get(s);
            if (ret.err) {
                if (ret.err === error_code_1.ErrorCode.RESULT_NOT_FOUND) {
                    return { err: error_code_1.ErrorCode.RESULT_OK, nonce: -1 };
                }
                return { err: ret.err };
            }
            return { err: error_code_1.ErrorCode.RESULT_OK, nonce: ret.value };
        }
        catch (error) {
            this.m_logger.error(`getStorageNonce exception, error=${error},address=${s}`);
            return { err: error_code_1.ErrorCode.RESULT_EXCEPTION };
        }
    }
    async removeTx() {
        let index = 0;
        while (true) {
            if (index === this.m_transactions.length) {
                break;
            }
            let tx = this.m_transactions[index].tx;
            let { err, nonce } = await this.getStorageNonce(tx.address);
            if (tx.nonce <= nonce) {
                this.m_transactions.splice(index, 1);
                if (this.m_mapNonce.has(tx.address)) {
                    if (this.m_mapNonce.get(tx.address) <= nonce) {
                        this.m_mapNonce.delete(tx.address);
                    }
                }
            }
            else {
                index++;
            }
        }
        for (let [address, l] of this.m_orphanTx) {
            while (true) {
                if (l.length === 0) {
                    break;
                }
                let { err, nonce } = await this.getStorageNonce(l[0].tx.address);
                if (l[0].tx.nonce <= nonce) {
                    l.shift();
                }
                else {
                    break;
                }
            }
        }
        let keys = [...this.m_orphanTx.keys()];
        for (let address of keys) {
            await this.ScanOrphan(address);
        }
    }
    addToOrphan(s, txTime) {
        let l;
        if (this.m_orphanTx.has(s)) {
            l = this.m_orphanTx.get(s);
        }
        else {
            l = new Array();
        }
        if (l.length === 0) {
            l.push(txTime);
        }
        else {
            for (let i = 0; i < l.length; i++) {
                if (txTime.tx.nonce < l[i].tx.nonce) {
                    l.splice(i, 0, txTime);
                    break;
                }
            }
        }
    }
    async ScanOrphan(s) {
        if (!this.m_orphanTx.has(s)) {
            return;
        }
        let l = this.m_orphanTx.get(s);
        let { err, nonce } = await this.getNonce(s);
        while (true) {
            if (l.length === 0) {
                this.m_orphanTx.delete(s);
                break;
            }
            if (this.isTimeout(l[0])) {
                l.shift();
                break;
            }
            if (nonce + 1 !== l[0].tx.nonce) {
                break;
            }
            this.addToQueue(l.shift());
            nonce++;
        }
    }
    isTimeout(txTime) {
        return Date.now() >= txTime.ct + this.m_txLiveTime * 1000;
    }
    addToQueue(txTime) {
        this.m_transactions.push(txTime);
        this.m_mapNonce.set(txTime.tx.address, txTime.tx.nonce);
    }
}
exports.PendingTransactions = PendingTransactions;
