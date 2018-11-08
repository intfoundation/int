"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const chain_1 = require("./chain");
const error_code_1 = require("../error_code");
const events_1 = require("events");
var SyncOptType;
(function (SyncOptType) {
    SyncOptType[SyncOptType["addTx"] = 0] = "addTx";
    SyncOptType[SyncOptType["updateTip"] = 1] = "updateTip";
})(SyncOptType || (SyncOptType = {}));
class PendingTransactions extends events_1.EventEmitter {
    constructor(options) {
        super();
        this.m_queueOpt = [];
        this.m_transactions = [];
        this.m_orphanTx = new Map();
        this.m_mapNonce = new Map();
        this.m_logger = options.logger;
        this.m_storageManager = options.storageManager;
        this.m_txLiveTime = options.txlivetime;
        this.m_handler = options.handler;
        this.m_maxPengdingCount = options.maxPengdingCount;
        this.m_warnPendingCount = options.warnPendingCount;
    }
    on(event, listener) {
        return super.on(event, listener);
    }
    once(event, listener) {
        return super.once(event, listener);
    }
    async addTransaction(tx) {
        this.m_logger.debug(`addTransaction, txhash=${tx.hash}, nonce=${tx.nonce}, address=${tx.address}`);
        const checker = this.m_handler.getTxPendingChecker(tx.method);
        if (!checker) {
            this.m_logger.error(`txhash=${tx.hash} method=${tx.method} has no match listener`);
            return error_code_1.ErrorCode.RESULT_TX_CHECKER_ERROR;
        }
        let err = checker(tx);
        if (err) {
            this.m_logger.error(`txhash=${tx.hash} checker error ${err}`);
            return err;
        }
        let nCount = this.getPengdingCount();
        if (nCount >= this.m_maxPengdingCount) {
            this.m_logger.warn(`pengding count ${nCount}, maxPengdingCount ${this.m_maxPengdingCount}`);
            return error_code_1.ErrorCode.RESULT_OUT_OF_MEMORY;
        }
        if (this.isExist(tx)) {
            this.m_logger.warn(`addTransaction failed, tx exist,hash=${tx.hash}`);
            return error_code_1.ErrorCode.RESULT_TX_EXIST;
        }
        //做nonce检查和balance检查
        let opt = { _type: SyncOptType.addTx, param: [{ tx, ct: Date.now() }] };
        // err = await this._addTx({tx, ct: Date.now()},false);
        this.addPendingOpt(opt);
        return error_code_1.ErrorCode.RESULT_OK;
    }
    popTransaction() {
        let txs = this._popTransaction(1);
        if (txs.length === 0) {
            return;
        }
        return txs[0].tx;
    }
    _popTransaction(nCount) {
        let txs = [];
        while (this.m_transactions.length > 0 && txs.length < nCount) {
            txs.push(this.m_transactions.shift());
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
        let txs = this.m_transactions;
        this.addPendingOpt({ _type: SyncOptType.updateTip, param: txs }, true);
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
    async addPendingOpt(opt, head = false) {
        if (head) {
            this.m_queueOpt.unshift(opt);
        }
        else {
            this.m_queueOpt.push(opt);
        }
        if (this.m_currAdding) {
            return;
        }
        while (this.m_queueOpt.length > 0) {
            this.m_currAdding = this.m_queueOpt.shift();
            if (this.m_currAdding._type === SyncOptType.updateTip) {
                this.m_mapNonce = new Map();
                this.m_transactions = [];
            }
            for (let i = 0; i < this.m_currAdding.param.length; i++) {
                await this._addTx(this.m_currAdding.param[i]);
            }
            this.m_currAdding = undefined;
        }
    }
    async onCheck(txTime, txOld) {
        return error_code_1.ErrorCode.RESULT_OK;
    }
    async onAddedTx(txTime, txOld) {
        if (!txOld) {
            this.m_mapNonce.set(txTime.tx.address, txTime.tx.nonce);
        }
        this.emit('txAdded', txTime.tx);
        return error_code_1.ErrorCode.RESULT_OK;
    }
    async _addTx(txTime, isOldTx = true) {
        if (isOldTx && this.isTimeout(txTime)) {
            this.m_logger.warn(`_addTx tx timeout, txhash=${txTime.tx.hash}`);
            return error_code_1.ErrorCode.RESULT_TIMEOUT;
        }
        let address = txTime.tx.address;
        let ret = await this.getStorageNonce(address);
        if (ret.err) {
            this.m_logger.error(`_addTx getNonce nonce error ${ret.err} address=${address}, txhash=${txTime.tx.hash}`);
            return ret.err;
        }
        if (ret.nonce + 1 > txTime.tx.nonce) {
            // this.m_logger.warn(`_addTx nonce small storagenonce=${ret.nonce!},txnonce=${txTime.tx.nonce}, txhash=${txTime.tx.hash}`);
            return error_code_1.ErrorCode.RESULT_OK;
        }
        let { err, nonce } = await this.getNonce(address);
        this.m_logger.debug(`_addTx, nonce=${nonce}, txNonce=${txTime.tx.nonce}, txhash=${txTime.tx.hash}, address=${txTime.tx.address}`);
        if (nonce + 1 === txTime.tx.nonce) {
            let retCode = await this.onCheck(txTime);
            if (retCode) {
                return retCode;
            }
            this.addToQueue(txTime, -1);
            await this.onAddedTx(txTime);
            await this.ScanOrphan(address);
            return error_code_1.ErrorCode.RESULT_OK;
        }
        if (nonce + 1 < txTime.tx.nonce) {
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
    // 获取mem中的未处理的交易
    async getPendingTransactions() {
        return { err: error_code_1.ErrorCode.RESULT_OK, pendingTransactions: this.m_transactions };
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
                continue;
            }
            if (nonce + 1 === l[0].tx.nonce) {
                let txTime = l.shift();
                this.addPendingOpt({ _type: SyncOptType.addTx, param: [txTime] });
                break;
            }
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
                let txOld = this.m_transactions[i];
                if (this.isTimeout(this.m_transactions[i])) {
                    let retCode = await this.onCheck(txTime, txOld);
                    if (retCode) {
                        return retCode;
                    }
                    this.m_transactions.splice(i, 1);
                    this.addToQueue(txTime, i);
                    await this.onAddedTx(txTime, txOld);
                    return error_code_1.ErrorCode.RESULT_OK;
                }
                let _err = await this.checkSmallNonceTx(txTime.tx, this.m_transactions[i].tx);
                if (_err === error_code_1.ErrorCode.RESULT_OK) {
                    let retCode = await this.onCheck(txTime, txOld);
                    if (retCode) {
                        return retCode;
                    }
                    this.m_transactions.splice(i, 1);
                    this.addToQueue(txTime, i);
                    await this.onAddedTx(txTime, txOld);
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
                    return error_code_1.ErrorCode.RESULT_OK;
                }
                let _err = await this.checkSmallNonceTx(txTime.tx, l[i].tx);
                if (_err === error_code_1.ErrorCode.RESULT_OK) {
                    l.splice(i, 1, txTime);
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
