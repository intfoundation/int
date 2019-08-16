"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const chain_1 = require("./chain");
const error_code_1 = require("../error_code");
const events_1 = require("events");
const LRUCache_1 = require("../lib/LRUCache");
const bignumber_js_1 = require("bignumber.js");
const util_1 = require("util");
const calculate_tx_limit_1 = require("../executor/calculate_tx_limit");
var SyncOptType;
(function (SyncOptType) {
    SyncOptType[SyncOptType["updateTip"] = 0] = "updateTip";
    SyncOptType[SyncOptType["popTx"] = 1] = "popTx";
    SyncOptType[SyncOptType["addTx"] = 2] = "addTx";
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
        this.m_txLiveTime = options.overtime;
        this.m_handler = options.handler;
        this.m_maxPengdingCount = options.maxCount;
        this.m_maxphanTxCount = options.warnCount;
        this.m_txRecord = new LRUCache_1.LRUCache(this.m_maxPengdingCount);
        this.m_isPeer = options.isPeer;
        this.m_maxTxLimit = new bignumber_js_1.BigNumber(options.maxTxLimit);
        this.m_minTxLimit = new bignumber_js_1.BigNumber(options.minTxLimit);
        this.m_maxTxPrice = new bignumber_js_1.BigNumber(options.maxTxPrice);
        this.m_minTxPrice = new bignumber_js_1.BigNumber(options.minTxPrice);
        this.m_calcTxLimit = new calculate_tx_limit_1.CalcuateLimit();
    }
    on(event, listener) {
        return super.on(event, listener);
    }
    once(event, listener) {
        return super.once(event, listener);
    }
    async addTransaction(tx) {
        let latest = this.m_txRecord.get(tx.hash);
        if (latest && Date.now() < latest) {
            this.m_logger.warn(`addTransaction failed, add too frequently,hash=${tx.hash}`);
            return error_code_1.ErrorCode.RESULT_TX_EXIST;
        }
        this.m_txRecord.set(tx.hash, Date.now() + 60 * 1000);
        let nCount = this._getPendingCount() + this.m_queueOpt.length;
        if (nCount >= this.m_maxPengdingCount) {
            let orphanTxcount = this._getOrphanTxCount();
            this.m_logger.warn(`pengding count=${nCount}, maxPengdingCount=${this.m_maxPengdingCount},orphanTxcount=${orphanTxcount}`);
            return error_code_1.ErrorCode.RESULT_OUT_OF_MEMORY;
        }

        this.m_logger.debug(`addTransaction, txhash=${tx.hash}, nonce=${tx.nonce}, address=${tx.address}`);
        let bt = this.baseMethodChecker(tx);
        if (bt) {
            return bt;
        }
        const checker = this.m_handler.getTxPendingChecker(tx.method);
        if (!checker) {
            this.m_logger.error(`txhash=${tx.hash} method=${tx.method} has no match listener`);
            return error_code_1.ErrorCode.RESULT_TX_CHECKER_ERROR;
        }
        const err = checker(tx);
        if (err) {
            this.m_logger.error(`txhash=${tx.hash} checker error ${err}`);
            return err;
        }
        let retCode = await this._onCheck({ tx, ct: Date.now() });
        if (retCode) {
            return retCode;
        }
        let opt = { _type: SyncOptType.addTx, param: { tx, ct: Date.now(), broadcastTimes: 0 } };
        this._addPendingOpt(opt);
        return error_code_1.ErrorCode.RESULT_OK;
    }
    baseMethodChecker(tx) {
        if (util_1.isNullOrUndefined(tx.limit) || util_1.isNullOrUndefined(tx.price) || util_1.isNullOrUndefined(tx.value)) {
            return error_code_1.ErrorCode.RESULT_INVALID_PARAM;
        }
        if (!bignumber_js_1.BigNumber.isBigNumber(tx.limit) || !bignumber_js_1.BigNumber.isBigNumber(tx.price) || !bignumber_js_1.BigNumber.isBigNumber(tx.value)) {
            return error_code_1.ErrorCode.RESULT_NOT_BIGNUMBER;
        }
        if (!tx.limit.isInteger() || !tx.price.isInteger() || !tx.value.isInteger()) {
            return error_code_1.ErrorCode.RESULT_NOT_INTEGER;
        }
        if (tx.limit.isNegative() || tx.price.isNegative() || tx.value.isNegative()) {
            return error_code_1.ErrorCode.RESULT_CANT_BE_LESS_THAN_ZERO;
        }
        if (tx.price.gt(this.m_maxTxPrice)) {
            return error_code_1.ErrorCode.RESULT_PRICE_TOO_BIG;
        }
        if (tx.price.lt(this.m_minTxPrice)) {
            return error_code_1.ErrorCode.RESULT_PRICE_TOO_SMALL;
        }
        if (tx.limit.gt(this.m_maxTxLimit)) {
            return error_code_1.ErrorCode.RESULT_LIMIT_TOO_BIG;
        }
        if (tx.value.gt(new bignumber_js_1.BigNumber(1e+36))) {
            return error_code_1.ErrorCode.RESULT_OUT_OF_RANGE;
        }
        let txLimit = this.m_calcTxLimit.calcTxLimit(tx.method, tx.input);
        if (tx.limit.lt(this.m_minTxLimit) || tx.limit.lt(txLimit)) {
            return error_code_1.ErrorCode.RESULT_LIMIT_TOO_SMALL;
        }
        return error_code_1.ErrorCode.RESULT_OK;
    }
    popTransaction() {
        if (this.m_transactions.length > 0) {
            return this.m_transactions[0].tx;
        }
        else {
            return undefined;
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
        // 每10个块清除一次 tx record的数据
        if (header.number % 10 == 0) {
            let txRecord;
            txRecord = this.m_txRecord;
            this.m_logger.info(`begin remove timeout tx of txRecord, block number=${header.number}, block hash=${header.hash}`);
            for (let [hash, value] of txRecord.m_memValue) {
                let t = Date.now();
                if (t >= value[0]) {
                    this.m_logger.debug(`txRecord remove timeout tx hash ${hash}, time ${value[0]}, date now ${t}`);
                    this.m_txRecord.remove(hash);
                }
            }
            this.m_logger.info(`finish remove timeout tx of txRecord, block number=${header.number}, block hash=${header.hash}`);
        }
        //每100个区块进行一次孤块序列超时判断
        if (header.number % 100 == 0) {
            this.m_logger.info(`clear timeout tx of orphanTxs,number=${header.number},hash=${header.hash}`);
            for (let [address, l] of this.m_orphanTx) {
                for (let i = 0; i < l.length; i++) {
                    if (this._isTimeout(l[i])) {
                        l.splice(i, 1);
                        this.m_logger.debug(`clear one timeout orphan tx hash=${header.hash}`);
                        i--;
                    }
                }
                if (l.length === 0) {
                    this.m_orphanTx.delete(address);
                    this.m_logger.debug(`remove one empty orphan address address=${address}`);
                }
            }
        }
        this._addPendingOpt({ _type: SyncOptType.updateTip, param: undefined });
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
    _isExist(tx) {
        for (let t of this.m_transactions) {
            if (t.tx.hash === tx.hash) {
                return true;
            }
        }
        for (let opt of this.m_queueOpt) {
            if (opt._type === SyncOptType.addTx) {
                if (opt.param.tx.hash === tx.hash) {
                    return true;
                }
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
    async _addPendingOpt(opt) {
        if (opt._type === SyncOptType.updateTip) {
            for (let i = 0; i < this.m_queueOpt.length; i++) {
                if (this.m_queueOpt[i]._type === SyncOptType.addTx) {
                    break;
                }
                else if (this.m_queueOpt[i]._type === SyncOptType.updateTip) {
                    this.m_queueOpt.splice(i, 1);
                    break;
                }
            }
            this.m_queueOpt.unshift(opt);
        }
        else if (opt._type === SyncOptType.addTx) {
            this.m_queueOpt.push(opt);
        }
        if (this.m_currAdding) {
            return;
        }
        while (this.m_queueOpt.length > 0) {
            this.m_currAdding = this.m_queueOpt.shift();
            if (this.m_currAdding._type === SyncOptType.updateTip) {
                let pos = 0;
                for (pos = 0; pos < this.m_queueOpt.length; pos++) {
                    if (this.m_queueOpt[pos]._type === SyncOptType.addTx) {
                        break;
                    }
                }
                for (let i = 0; i < this.m_transactions.length; i++) {
                    this.m_queueOpt.splice(i + pos, 0, { _type: SyncOptType.addTx, param: this.m_transactions[i] });
                }
                this.m_mapNonce = new Map();
                this.m_transactions = [];
            }
            else if (this.m_currAdding._type === SyncOptType.addTx) {
                await this._addTx(this.m_currAdding.param);
            }
            this.m_currAdding = undefined;
        }
    }
    async _onCheck(txTime, txOld) {
        return error_code_1.ErrorCode.RESULT_OK;
    }
    async _onAddedTx(txTime, txOld) {
        if (!txOld) {
            this.m_mapNonce.set(txTime.tx.address, txTime.tx.nonce);
        }
        this.m_logger.debug(`_onAddedTx txhash ${txTime.tx.hash}, isPeer ${this.m_isPeer}, broadcast times ${txTime.broadcastTimes}, isBroadcast ${Date.now() >= txTime.ct + txTime.broadcastTimes * 60 * 1000}`);
        if (this.m_isPeer && Date.now() >= txTime.ct + txTime.broadcastTimes * 60 * 1000) {
            this.emit('txAdded', txTime.tx);
            return error_code_1.ErrorCode.RESULT_OK;
        }
        return error_code_1.ErrorCode.RESULT_CANCELED;
    }
    async _addTx(txTime) {
        if (this._isTimeout(txTime)) {
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
            let retCode = await this._onCheck(txTime);
            if (retCode) {
                return retCode;
            }
            this._addToQueue(txTime, -1);
            let returnCode = await this._onAddedTx(txTime);
            if (!returnCode) {
                txTime.broadcastTimes = txTime.broadcastTimes + 1;
            }
            // //只有peer才会进行操作
            // if(this.m_isPeer){
            await this._scanOrphan(address);
            // }
            return error_code_1.ErrorCode.RESULT_OK;
        }
        if (nonce + 1 < txTime.tx.nonce) {
            let returnCode = await this._addToOrphanMayNonceExist(txTime);
            if (!returnCode) {
                this.m_txRecord.set(txTime.tx.hash, Date.now() + 60 * 60 * 1000);
            }
            return returnCode;
        }
        return await this._addToQueueMayNonceExist(txTime);
    }
    // 同个address的两个相同nonce的tx存在，且先前的也还没有入链
    async _checkSmallNonceTx(txNew, txOld) {
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
        let pendingTransactions = [];
        for (let opt of this.m_queueOpt) {
            if (opt._type === SyncOptType.addTx) {
                pendingTransactions.push(opt.param);
            }
        }
        pendingTransactions = pendingTransactions.concat(this.m_transactions);
        for (let [address, l] of this.m_orphanTx) {
            pendingTransactions = pendingTransactions.concat(l);
        }
        return { err: error_code_1.ErrorCode.RESULT_OK, pendingTransactions: pendingTransactions };
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
    _addToOrphan(txTime) {
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
    async _scanOrphan(s) {
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
            if (this._isTimeout(l[0])) {
                l.shift();
                continue;
            }
            if (nonce + 1 === l[0].tx.nonce) {
                let txTime = l.shift();
                this._addPendingOpt({ _type: SyncOptType.addTx, param: txTime });
            }
            break;
        }
    }
    _isTimeout(txTime) {
        return Date.now() >= txTime.ct + this.m_txLiveTime * 1000;
    }
    _addToQueue(txTime, pos) {
        if (pos === -1) {
            this.m_transactions.push(txTime);
        }
        else {
            this.m_transactions.splice(pos, 0, txTime);
        }
        this.m_txRecord.set(txTime.tx.hash, Date.now() + 60 * 60 * 1000);
    }
    _getPendingCount() {
        let count = this.m_transactions.length;
        for (let [address, l] of this.m_orphanTx) {
            count += l.length;
        }
        return count;
    }
    _getOrphanTxCount() {
        let count = 0;
        for (let [address, l] of this.m_orphanTx) {
            count += l.length;
        }
        return count;
    }
    async _addToQueueMayNonceExist(txTime) {
        for (let i = 0; i < this.m_transactions.length; i++) {
            if (this.m_transactions[i].tx.address === txTime.tx.address && this.m_transactions[i].tx.nonce === txTime.tx.nonce) {
                let txOld = this.m_transactions[i];
                if (this._isTimeout(this.m_transactions[i])) {
                    let retCode = await this._onCheck(txTime, txOld);
                    if (retCode) {
                        return retCode;
                    }
                    this.m_transactions.splice(i, 1);
                    this._addToQueue(txTime, i);
                    let returnCode = await this._onAddedTx(txTime, txOld);
                    if (!returnCode) {
                        txTime.broadcastTimes = txTime.broadcastTimes + 1;
                    }
                    return error_code_1.ErrorCode.RESULT_OK;
                }
                let _err = await this._checkSmallNonceTx(txTime.tx, this.m_transactions[i].tx);
                if (_err === error_code_1.ErrorCode.RESULT_OK) {
                    let retCode = await this._onCheck(txTime, txOld);
                    if (retCode) {
                        return retCode;
                    }
                    this.m_transactions.splice(i, 1);
                    this._addToQueue(txTime, i);
                    let returnCode = await this._onAddedTx(txTime, txOld);
                    if (!returnCode) {
                        txTime.broadcastTimes = txTime.broadcastTimes + 1;
                    }
                    return error_code_1.ErrorCode.RESULT_OK;
                }
                return _err;
            }
        }
        return error_code_1.ErrorCode.RESULT_ERROR_NONCE_IN_TX;
    }
    async _addToOrphanMayNonceExist(txTime) {
        let s = txTime.tx.address;
        let l;
        //判断孤交易池是否已经满了
        let orphanNumber = this._getOrphanTxCount();
        if (orphanNumber >= this.m_maxphanTxCount) {
            this.m_logger.error(`orphan tx pool is full,orphan number=${orphanNumber},m_transactionsNumber=${this.m_transactions.length}`);
            return error_code_1.ErrorCode.RESULT_OUT_OF_MEMORY;
        }
        else {
            this.m_logger.debug(`add orphan tx ,orphan number=${orphanNumber},m_transactionsNumber=${this.m_transactions.length}`);
        }
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
                if (this._isTimeout(l[i])) {
                    l.splice(i, 1, txTime);
                    return error_code_1.ErrorCode.RESULT_OK;
                }
                let _err = await this._checkSmallNonceTx(txTime.tx, l[i].tx);
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
