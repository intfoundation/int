"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require('assert');
const error_code_1 = require("../error_code");
const chain_1 = require("../chain");
const util_1 = require("util");
const client_1 = require("../../client");
const { LogShim } = require('../lib/log_shim');
class BaseExecutor {
    constructor(options) {
        this.m_logs = [];
        this.m_logger = options.logger;
        this.m_eventDefinations = options.eventDefinations;
    }
    async prepareContext(blockHeader, storage, externContext) {
        let database = (await storage.getReadWritableDatabase(chain_1.Chain.dbUser)).value;
        let context = Object.create(externContext);
        // context.getNow = (): number => {
        //     return blockHeader.timestamp;
        // };
        Object.defineProperty(context, 'now', {
            writable: false,
            value: blockHeader.timestamp
        });
        Object.defineProperty(context, 'height', {
            writable: false,
            value: blockHeader.number
        });
        Object.defineProperty(context, 'storage', {
            writable: false,
            value: database
        });
        context.emit = (name, param) => {
            if (this.m_eventDefinations.has(name)) {
                let log = new chain_1.EventLog();
                log.name = name;
                log.param = param;
                this.m_logs.push(log);
            }
            else {
                this.m_logger.error(`undefined event ${name}`);
                assert(false, `undefined event ${name}`);
            }
        };
        return context;
    }
}
class TransactionExecutor extends BaseExecutor {
    constructor(handler, listener, tx, logger) {
        super({
            eventDefinations: handler.getEventDefinations(),
            logger: new LogShim(logger).bind(`[transaction: ${tx.hash}]`, true).log
        });
        this.m_addrIndex = 0;
        this.m_listener = listener;
        this.m_tx = tx;
    }
    async _dealNonce(tx, storage) {
        // 检查nonce
        let kvr = await storage.getKeyValue(chain_1.Chain.dbSystem, chain_1.Chain.kvNonce);
        if (kvr.err !== error_code_1.ErrorCode.RESULT_OK) {
            this.m_logger.error(`methodexecutor, _dealNonce, getReadWritableKeyValue failed`);
            return kvr.err;
        }
        let nonce = -1;
        let nonceInfo = await kvr.kv.get(tx.address);
        if (nonceInfo.err === error_code_1.ErrorCode.RESULT_OK) {
            nonce = nonceInfo.value;
        }
        if (tx.nonce !== nonce + 1) {
            this.m_logger.error(`methodexecutor, _dealNonce, nonce error,nonce should ${nonce + 1}, but ${tx.nonce}, txhash=${tx.hash} address=${tx.address}`);
            return error_code_1.ErrorCode.RESULT_ERROR_NONCE_IN_TX;
        }
        await kvr.kv.set(tx.address, tx.nonce);
        return error_code_1.ErrorCode.RESULT_OK;
    }
    async execute(blockHeader, storage, externContext, flag) {
        if (!(flag && flag.ignoreNoce)) {
            let nonceErr = await this._dealNonce(this.m_tx, storage);
            if (nonceErr !== error_code_1.ErrorCode.RESULT_OK) {
                return { err: nonceErr };
            }
        }
        let context = await this.prepareContext(blockHeader, storage, externContext);
        let receipt = new chain_1.Receipt();
        let work = await storage.beginTransaction();
        if (work.err) {
            this.m_logger.error(`methodexecutor, beginTransaction error,storagefile=${storage.filePath}`);
            return { err: work.err };
        }
        receipt.returnCode = await this._execute(context, this.m_tx.input);
        assert(util_1.isNumber(receipt.returnCode), `invalid handler return code ${receipt.returnCode}`);
        if (!util_1.isNumber(receipt.returnCode)) {
            this.m_logger.error(`methodexecutor failed for invalid handler return code type, return=`, receipt.returnCode);
            return { err: error_code_1.ErrorCode.RESULT_INVALID_PARAM };
        }
        receipt.setSource({ sourceType: chain_1.ReceiptSourceType.transaction, txHash: this.m_tx.hash });
        if (receipt.returnCode) {
            this.m_logger.warn(`handler return code=${receipt.returnCode}, will rollback storage`);
            await work.value.rollback();
        }
        else {
            this.m_logger.debug(`handler return code ${receipt.returnCode}, will commit storage`);
            let err = await work.value.commit();
            if (err) {
                this.m_logger.error(`methodexecutor, transaction commit error, err=${err}, storagefile=${storage.filePath}`);
                return { err };
            }
            receipt.eventLogs = this.m_logs;
        }
        return { err: error_code_1.ErrorCode.RESULT_OK, receipt };
    }
    async _execute(env, input) {
        try {
            this.m_logger.debug(`will execute tx ${this.m_tx.hash}: ${this.m_tx.method},from ${this.m_tx.address}, params ${JSON.stringify(this.m_tx.input)}`);
            return await this.m_listener(env, this.m_tx.input);
        }
        catch (e) {
            this.m_logger.error(`execute method linstener e=`, e.stack);
            return error_code_1.ErrorCode.RESULT_EXECUTE_ERROR;
        }
    }
    async prepareContext(blockHeader, storage, externContext) {
        let context = await super.prepareContext(blockHeader, storage, externContext);
        // 执行上下文
        Object.defineProperty(context, 'caller', {
            writable: false,
            value: this.m_tx.address
        });
        context.createAddress = () => {
            let buf = Buffer.from(this.m_tx.address + this.m_tx.nonce + this.m_addrIndex);
            this.m_addrIndex++;
            return client_1.addressFromPublicKey(buf);
        };
        return context;
    }
}
exports.TransactionExecutor = TransactionExecutor;
class EventExecutor extends BaseExecutor {
    constructor(handler, listener, logger) {
        super({
            eventDefinations: handler.getEventDefinations(),
            logger
        });
        this.m_bBeforeBlockExec = true;
        this.m_listener = listener;
    }
    async execute(blockHeader, storage, externalContext) {
        this.m_logger.debug(`execute event on ${blockHeader.number}`);
        let context = await this.prepareContext(blockHeader, storage, externalContext);
        let work = await storage.beginTransaction();
        if (work.err) {
            this.m_logger.error(`eventexecutor, beginTransaction error,storagefile=${storage.filePath}`);
            return { err: work.err };
        }
        let receipt = new chain_1.Receipt();
        let returnCode;
        try {
            returnCode = await this.m_listener(context);
        }
        catch (e) {
            this.m_logger.error(`execute event linstener error, e=`, e);
            returnCode = error_code_1.ErrorCode.RESULT_EXCEPTION;
        }
        assert(util_1.isNumber(returnCode), `event handler return code invalid ${returnCode}`);
        if (!util_1.isNumber(returnCode)) {
            this.m_logger.error(`execute event failed for invalid return code`);
            returnCode = error_code_1.ErrorCode.RESULT_INVALID_PARAM;
        }
        receipt.returnCode = returnCode;
        if (receipt.returnCode === error_code_1.ErrorCode.RESULT_OK) {
            this.m_logger.debug(`event handler commit storage`);
            let err = await work.value.commit();
            if (err) {
                this.m_logger.error(`eventexecutor, transaction commit error,storagefile=${storage.filePath}`);
                return { err };
            }
        }
        else {
            this.m_logger.debug(`event handler return code ${returnCode} rollback storage`);
            await work.value.rollback();
        }
        return { err: error_code_1.ErrorCode.RESULT_OK, receipt };
    }
}
exports.EventExecutor = EventExecutor;
