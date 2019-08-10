"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require("assert");
const error_code_1 = require("../error_code");
const chain_1 = require("../chain");
const transaction_1 = require("./transaction");
class BlockExecutor {
    constructor(options) {
        this.m_storage = options.storage;
        this.m_handler = options.handler;
        this.m_block = options.block;
        this.m_externContext = options.externContext;
        this.m_logger = options.logger;
        this.m_externParams = options.externParams.slice(0);
        Object.defineProperty(this.m_externContext, 'logger', {
            writable: false,
            value: this.m_logger
        });
        this.m_globalOptions = options.globalOptions;
    }
    finalize() {
        for (const ep of this.m_externParams) {
            ep.finalize();
        }
    }
    get externContext() {
        return this.m_externContext;
    }
    _newTransactionExecutor(l, tx) {
        return new transaction_1.TransactionExecutor(this.m_handler, l, tx, this.m_logger);
    }
    _newEventExecutor(l) {
        return new transaction_1.EventExecutor(this.m_handler, l, this.m_logger);
    }
    async execute() {
        let t1 = Date.now();
        let ret = await this._execute(this.m_block);
        let t2 = Date.now();
        this.m_logger.info(`runblock time====${t2 - t1}, count=${this.m_block.content.transactions.length}`);
        return ret;
    }
    async verify() {
        let oldBlock = this.m_block;
        this.m_block = this.m_block.clone();
        let err = await this.execute();
        if (err) {
            if (err === error_code_1.ErrorCode.RESULT_TX_CHECKER_ERROR) {
                return { err: error_code_1.ErrorCode.RESULT_OK, valid: error_code_1.ErrorCode.RESULT_TX_CHECKER_ERROR };
            }
            else {
                return { err };
            }
        }
        if (this.m_block.hash !== oldBlock.hash) {
            this.m_logger.error(`block ${oldBlock.number} hash mismatch!! 
            except storage hash ${oldBlock.header.storageHash}, actual ${this.m_block.header.storageHash}
            except hash ${oldBlock.hash}, actual ${this.m_block.hash}
            `);
        }
        if (this.m_block.hash === oldBlock.hash) {
            return { err: error_code_1.ErrorCode.RESULT_OK, valid: error_code_1.ErrorCode.RESULT_OK };
        }
        else {
            return { err: error_code_1.ErrorCode.RESULT_OK, valid: error_code_1.ErrorCode.RESULT_VERIFY_NOT_MATCH };
        }
    }
    async _execute(block) {
        this.m_logger.info(`begin execute block ${block.number}`);
        let receipts = [];
        let ebr = await this.executePreBlockEvent();
        if (ebr.err) {
            this.m_logger.error(`blockexecutor execute begin_event failed,errcode=${ebr.err},blockhash=${block.hash}`);
            return ebr.err;
        }
        receipts.push(...ebr.receipts);
        ebr = await this._executeTransactions();
        if (ebr.err) {
            this.m_logger.error(`blockexecutor execute method failed,errcode=${ebr.err},blockhash=${block.hash}`);
            return ebr.err;
        }
        receipts.push(...ebr.receipts);
        ebr = await this.executePostBlockEvent();
        if (ebr.err) {
            this.m_logger.error(`blockexecutor execute end_event failed,errcode=${ebr.err},blockhash=${block.hash}`);
            return ebr.err;
        }
        receipts.push(...ebr.receipts);
        // 票据
        block.content.setReceipts(receipts);
        // 更新块信息
        return await this._updateBlock(block);
    }
    async executeBlockEvent(listener) {
        let exec = this._newEventExecutor(listener);
        let ret = await exec.execute(this.m_block.header, this.m_storage, this.m_externContext);
        if (ret.err) {
            this.m_logger.error(`block event execute failed`);
        }
        return ret;
    }
    async executePreBlockEvent() {
        if (this.m_block.number === 0) {
            // call initialize
            if (this.m_handler.genesisListener) {
                const eber = await this.executeBlockEvent(this.m_handler.genesisListener);
                if (eber.err || eber.receipt.returnCode) {
                    this.m_logger.error(`handler's genesisListener execute failed`);
                    return { err: error_code_1.ErrorCode.RESULT_EXCEPTION };
                }
            }
        }
        let receipts = [];
        let listeners = await this.m_handler.getPreBlockListeners(this.m_block.number);
        for (const l of listeners) {
            const eber = await this.executeBlockEvent(l.listener);
            if (eber.err) {
                return { err: eber.err };
            }
            eber.receipt.setSource({ sourceType: chain_1.ReceiptSourceType.preBlockEvent, eventIndex: l.index });
            receipts.push(eber.receipt);
        }
        return { err: error_code_1.ErrorCode.RESULT_OK, receipts };
    }
    async executePostBlockEvent() {
        let receipts = [];
        let listeners = await this.m_handler.getPostBlockListeners(this.m_block.number);
        for (const l of listeners) {
            const eber = await this.executeBlockEvent(l.listener);
            if (eber.err) {
                return { err: eber.err };
            }
            eber.receipt.setSource({ sourceType: chain_1.ReceiptSourceType.postBlockEvent, eventIndex: l.index });
            receipts.push(eber.receipt);
        }
        return { err: error_code_1.ErrorCode.RESULT_OK, receipts };
    }
    async _executeTransactions() {
        let receipts = [];
        // 执行tx
        for (let tx of this.m_block.content.transactions) {
            const ret = await this.executeTransaction(tx);
            if (ret.err) {
                return { err: ret.err };
            }
            receipts.push(ret.receipt);
        }
        return { err: error_code_1.ErrorCode.RESULT_OK, receipts };
    }
    async executeTransaction(tx, flag) {
        const checker = this.m_handler.getTxPendingChecker(tx.method);
        if (!checker || checker(tx)) {
            this.m_logger.error(`verfiy block failed for tx ${tx.hash} ${tx.method} checker failed`);
            return { err: error_code_1.ErrorCode.RESULT_TX_CHECKER_ERROR };
        }
        let listener = this.m_handler.getTxListener(tx.method);
        assert(listener, `no listener for ${tx.method}`);
        if (!listener) {
            return { err: error_code_1.ErrorCode.RESULT_NOT_SUPPORT };
        }
        let exec = this._newTransactionExecutor(listener, tx);
        let ret = await exec.execute(this.m_block.header, this.m_storage, this.m_externContext, flag);
        return ret;
    }
    async _updateBlock(block) {
        // 写回数据库签名
        const mdr = await this.m_storage.messageDigest();
        if (mdr.err) {
            return mdr.err;
        }
        block.header.storageHash = mdr.value;
        block.header.updateContent(block.content);
        block.header.updateHash();
        return error_code_1.ErrorCode.RESULT_OK;
    }
}
exports.BlockExecutor = BlockExecutor;
