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
        this.m_handler = options.handler;
        this.m_maxPengdingCount = options.maxPengdingCount;
        this.m_warnPendingCount = options.warnPendingCount;
    }
    async addTransaction(tx) {
        this.m_logger.debug(`addTransaction, txhash=${tx.hash}, nonce=${tx.nonce}, address=${tx.address}`);
        const checker = this.m_handler.getTxPendingChecker(tx.method);
        if (!checker) {
            this.m_logger.error(`txhash=${tx.hash} method=${tx.method} has no match listener`);
            return error_code_1.ErrorCode.RESULT_TX_CHECKER_ERROR;
        }
        const err = checker(tx);
        if (err) {
            this.m_logger.error(`txhash=${tx.hash} checker error ${err}`);
            return error_code_1.ErrorCode.RESULT_TX_CHECKER_ERROR;
        }
        await this.m_pendingLock.enter();
        if (this.isExist(tx)) {
            this.m_logger.warn(`addTransaction failed, tx exist,hash=${tx.hash}`);
            await this.m_pendingLock.leave();
            return error_code_1.ErrorCode.RESULT_TX_EXIST;
        }
        let ret = await this._addTx({ tx, ct: Date.now() });
        await this.m_pendingLock.leave();
        return ret;
    }
    popTransaction(nCount) {
        let txs = [];
        let toOrphan = new Set();
        while (this.m_transactions.length > 0 && txs.length < nCount) {
            let txTime = this.m_transactions.shift();
            if (this.isTimeout(txTime)) {
                if (!toOrphan.has(txTime.tx.address)) {
                    this.m_mapNonce.set(txTime.tx.address, txTime.tx.nonce - 1);
                    toOrphan.add(txTime.tx.address);
                }
            }
            else {
                if (toOrphan.has(txTime.tx.address)) {
                    this.addToOrphan(txTime);
                }
                else {
                    txs.push(txTime.tx);
                }
            }
        }
        if (toOrphan.size === 0) {
            return txs;
        }
        let pos = 0;
        while (pos < this.m_transactions.length) {
            if (this.isTimeout(this.m_transactions[pos])) {
                let txTime = this.m_transactions.shift();
                if (!toOrphan.has(txTime.tx.address)) {
                    this.m_mapNonce.set(txTime.tx.address, txTime.tx.nonce - 1);
                    toOrphan.add(txTime.tx.address);
                }
            }
            else {
                if (toOrphan.has(this.m_transactions[pos].tx.address)) {
                    let txTemp = (this.m_transactions.splice(pos, 1)[0]);
                    this.addToOrphan(txTemp);
                }
                else {
                    pos++;
                }
            }
        }
        return txs;
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
    init() {
        return error_code_1.ErrorCode.RESULT_OK;
    }
    uninit() {
        if (this.m_curHeader) {
            this.m_storageManager.releaseSnapshotView(this.m_curHeader.hash);
            delete this.m_storageView;
            delete this.m_curHeader;
        }
        this.m_mapNonce.clear();
        this.m_orphanTx.clear();
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
            this.m_logger.error(`_addTx getNonce nonce error ${err}`);
            return err;
        }
        let nCount = this.getPengdingCount();
        if (nCount >= this.m_maxPengdingCount) {
            this.m_logger.warn(`pengding count ${nCount}, maxPengdingCount ${this.m_maxPengdingCount}`);
            return error_code_1.ErrorCode.RESULT_OUT_OF_MEMORY;
        }
        if (nonce + 1 === txTime.tx.nonce) {
            this.addToQueue(txTime, -1);
            this.m_mapNonce.set(txTime.tx.address, txTime.tx.nonce);
            await this.ScanOrphan(address);
            return error_code_1.ErrorCode.RESULT_OK;
        }
        if (nonce + 1 < txTime.tx.nonce) {
            if (nCount >= this.m_warnPendingCount) {
                this.m_logger.warn(`pengding count ${nCount}, warnPengdingCount ${this.m_warnPendingCount}`);
                return error_code_1.ErrorCode.RESULT_OUT_OF_MEMORY;
            }
            return await this.addToOrphanMayNonceExist(txTime);
        }
        return await this.addToQueueMayNonceExist(txTime);
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
    addToOrphan(txTime) {
        let s = txTime.tx.address;
        let l;
        if (this.m_orphanTx.has(s)) {
            l = this.m_orphanTx.get(s);
        }
        else {
            l = new Array();
            this.m_orphanTx.set(s, l);
        }
        if (l.length === 0) {
            l.push(txTime);
        }
        else {
            for (let i = 0; i < l.length; i++) {
                if (txTime.tx.nonce < l[i].tx.nonce) {
                    l.splice(i, 0, txTime);
                    return;
                }
            }
            l.push(txTime);
        }
    }
    clearTimeoutTx(l) {
        let pos = 0;
        while (pos < l.length) {
            if (this.isTimeout(l[pos])) {
                l.splice(pos, 1);
            }
            else {
                pos++;
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
                this.clearTimeoutTx(l);
                break;
            }
            if (nonce + 1 !== l[0].tx.nonce) {
                this.clearTimeoutTx(l);
                break;
            }
            let txTime = l.shift();
            this.addToQueue(txTime, -1);
            this.m_mapNonce.set(txTime.tx.address, txTime.tx.nonce);
            nonce++;
        }
    }
    isTimeout(txTime) {
        return Date.now() >= txTime.ct + this.m_txLiveTime * 1000;
    }
    addToQueue(txTime, pos) {
        if (pos === -1) {
            this.m_transactions.push(txTime);
        }
        else {
            this.m_transactions.splice(pos, 0, txTime);
        }
    }
    async onReplaceTx(txNew, txOld) {
    }
    getPengdingCount() {
        let count = this.m_transactions.length;
        for (let [address, l] of this.m_orphanTx) {
            count += l.length;
        }
        return count;
    }
    async addToQueueMayNonceExist(txTime) {
        for (let i = 0; i < this.m_transactions.length; i++) {
            if (this.m_transactions[i].tx.address === txTime.tx.address && this.m_transactions[i].tx.nonce === txTime.tx.nonce) {
                let txOld = this.m_transactions[i].tx;
                if (this.isTimeout(this.m_transactions[i])) {
                    this.m_transactions.splice(i, 1);
                    this.addToQueue(txTime, i);
                    await this.onReplaceTx(txTime.tx, txOld);
                    return error_code_1.ErrorCode.RESULT_OK;
                }
                let _err = await this.checkSmallNonceTx(txTime.tx, this.m_transactions[i].tx);
                if (_err === error_code_1.ErrorCode.RESULT_OK) {
                    this.m_transactions.splice(i, 1);
                    this.addToQueue(txTime, i);
                    await this.onReplaceTx(txTime.tx, txOld);
                    return error_code_1.ErrorCode.RESULT_OK;
                }
                return _err;
            }
        }
        return error_code_1.ErrorCode.RESULT_ERROR_NONCE_IN_TX;
    }
    async addToOrphanMayNonceExist(txTime) {
        let s = txTime.tx.address;
        let l;
        if (this.m_orphanTx.has(s)) {
            l = this.m_orphanTx.get(s);
        }
        else {
            l = new Array();
            this.m_orphanTx.set(s, l);
        }
        if (l.length === 0) {
            l.push(txTime);
            return error_code_1.ErrorCode.RESULT_OK;
        }
        for (let i = 0; i < l.length; i++) {
            if (txTime.tx.nonce === l[i].tx.nonce) {
                let txOld = l[i].tx;
                if (this.isTimeout(l[i])) {
                    l.splice(i, 1, txTime);
                    await this.onReplaceTx(txTime.tx, txOld);
                    return error_code_1.ErrorCode.RESULT_OK;
                }
                let _err = await this.checkSmallNonceTx(txTime.tx, l[i].tx);
                if (_err === error_code_1.ErrorCode.RESULT_OK) {
                    l.splice(i, 1, txTime);
                    await this.onReplaceTx(txTime.tx, txOld);
                    return error_code_1.ErrorCode.RESULT_OK;
                }
                return _err;
            }
            if (txTime.tx.nonce < l[i].tx.nonce) {
                l.splice(i, 0, txTime);
                return error_code_1.ErrorCode.RESULT_OK;
            }
        }
        l.push(txTime);
        return error_code_1.ErrorCode.RESULT_OK;
    }
}
exports.PendingTransactions = PendingTransactions;
