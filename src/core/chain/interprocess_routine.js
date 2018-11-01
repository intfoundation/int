"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const path = require("path");
const fs = require("fs-extra");
const childProcess = require("child_process");
const assert = require('assert');
const util_1 = require("util");
const error_code_1 = require("../error_code");
const reader_1 = require("../lib/reader");
const writer_1 = require("../lib/writer");
const storage_1 = require("../storage_sqlite/storage");
const executor_routine_1 = require("./executor_routine");
var RoutineType;
(function (RoutineType) {
    RoutineType[RoutineType["execute"] = 0] = "execute";
    RoutineType[RoutineType["verify"] = 1] = "verify";
})(RoutineType || (RoutineType = {}));
class BlockExecutorWorkerRoutine {
    constructor() {
    }
    static encodeParams(params) {
        const writer = new writer_1.BufferWriter();
        let err;
        if (params.type === RoutineType.execute) {
            err = params.block.encodeWithoutReceipt(writer);
        }
        else if (params.type === RoutineType.verify) {
            err = params.block.encode(writer);
        }
        else {
            assert(false, `invalid routine type`);
            return { err: error_code_1.ErrorCode.RESULT_INVALID_PARAM };
        }
        if (err) {
            return { err };
        }
        const blockPath = params.chain.tmpManager.getPath(`${params.name}.block`);
        try {
            fs.writeFileSync(blockPath, writer.render());
        }
        catch (e) {
            params.chain.logger.error(`write block to ${blockPath} failed `, e);
            return { err: error_code_1.ErrorCode.RESULT_EXCEPTION };
        }
        try {
            const message = {
                type: params.type,
                name: params.name,
                dataDir: params.chain.dataDir,
                blockPath,
                storagePath: params.storage.filePath
            };
            return { err: error_code_1.ErrorCode.RESULT_OK, message };
        }
        catch (e) {
            return { err: error_code_1.ErrorCode.RESULT_INVALID_PARAM };
        }
    }
    static async decodeParams(creator, message) {
        let ccr = await creator.createChainInstance(message.dataDir, {
            readonly: true
        });
        if (ccr.err) {
            return { err: ccr.err };
        }
        const chain = ccr.chain;
        let block = chain.newBlock();
        let blockRaw;
        let err;
        try {
            blockRaw = fs.readFileSync(message.blockPath);
        }
        catch (e) {
            chain.logger.error(`read block from ${message.blockPath} failed `, e);
            return { err: error_code_1.ErrorCode.RESULT_INVALID_PARAM };
        }
        if (message.type === RoutineType.execute) {
            err = block.decodeWithoutReceipt(new reader_1.BufferReader(blockRaw));
        }
        else if (message.type === RoutineType.verify) {
            err = block.decode(new reader_1.BufferReader(blockRaw));
        }
        else {
            assert(false, `invalid routine type`);
            return { err: error_code_1.ErrorCode.RESULT_INVALID_PARAM };
        }
        if (err) {
            chain.logger.error(`decode block from params failed `, err);
            return { err };
        }
        const storage = new storage_1.SqliteStorage({
            filePath: message.storagePath,
            logger: chain.logger
        });
        err = await storage.init();
        if (err) {
            chain.logger.error(`init storage ${message.storagePath} failed `, err);
            return { err };
        }
        return { err: error_code_1.ErrorCode.RESULT_OK, params: { type: message.type, chain, storage, block, name: message.name } };
    }
    static encodeResult(result) {
        const message = Object.create(null);
        message.name = result.name;
        message.err = result.err;
        message.type = result.type;
        if (result.type === RoutineType.execute) {
            if (result.block) {
                const writer = new writer_1.BufferWriter();
                let err = result.block.encode(writer);
                if (err) {
                    return { err };
                }
                const blockPath = result.chain.tmpManager.getPath(`${result.name}.block`);
                try {
                    fs.writeFileSync(blockPath, writer.render());
                }
                catch (e) {
                    result.chain.logger.error(`write block to ${blockPath} failed `, e);
                    return { err: error_code_1.ErrorCode.RESULT_EXCEPTION };
                }
                message.blockPath = blockPath;
            }
        }
        else if (result.type === RoutineType.verify) {
            if (!util_1.isNullOrUndefined(result.valid)) {
                message.valid = result.valid;
            }
        }
        else {
            assert(false, `invalid result type`);
            return { err: error_code_1.ErrorCode.RESULT_INVALID_PARAM };
        }
        if (result.storage) {
            const writer = new writer_1.BufferWriter();
            if (result.storage.storageLogger) {
                let err = result.storage.storageLogger.encode(writer);
                if (err) {
                    return { err };
                }
                const redoPath = result.chain.tmpManager.getPath(`${result.name}.redo`);
                try {
                    fs.writeFileSync(redoPath, writer.render());
                }
                catch (e) {
                    result.chain.logger.error(`write redo log to ${redoPath} failed `, e);
                    return { err: error_code_1.ErrorCode.RESULT_EXCEPTION };
                }
                message.redoPath = redoPath;
            }
        }
        return { err: error_code_1.ErrorCode.RESULT_OK, message };
    }
    static decodeResult(params, message) {
        let result = Object.create(null);
        result.name = message.name;
        result.chain = params.chain;
        result.type = message.type;
        assert(result.name === params.name, `routine params' name is ${params.name} while result name is ${result.name}`);
        if (result.name !== params.name) {
            params.chain.logger.error(`routine result name mismatch`);
            return { err: error_code_1.ErrorCode.RESULT_INVALID_PARAM };
        }
        result.err = message.err;
        if (message.type === RoutineType.execute) {
            if (message.blockPath) {
                let blockRaw;
                try {
                    blockRaw = fs.readFileSync(message.blockPath);
                }
                catch (e) {
                    params.chain.logger.error(`read block from ${message.blockPath} failed `, e);
                    return { err: error_code_1.ErrorCode.RESULT_INVALID_PARAM };
                }
                let reader = new reader_1.BufferReader(blockRaw);
                let block = params.chain.newBlock();
                let err = block.decode(reader);
                if (err) {
                    params.chain.logger.error(`decode block from ${message.blockPath} failed `, err);
                    return { err };
                }
                result.block = block;
                params.chain.logger.debug(`about to remove tmp block `, message.blockPath);
                fs.removeSync(message.blockPath);
            }
        }
        else if (message.type === RoutineType.verify) {
            if (!util_1.isNullOrUndefined(message.valid)) {
                result.valid = message.valid;
            }
        }
        else {
            assert(false, `invalid routine type`);
            return { err: error_code_1.ErrorCode.RESULT_INVALID_PARAM };
        }
        if (message.redoPath) {
            let redoRaw;
            try {
                redoRaw = fs.readFileSync(message.redoPath);
            }
            catch (e) {
                params.chain.logger.error(`read redo log from ${message.redoPath} failed `, e);
                return { err: error_code_1.ErrorCode.RESULT_INVALID_PARAM };
            }
            let reader = new reader_1.BufferReader(redoRaw);
            params.storage.createLogger();
            let err = params.storage.storageLogger.decode(reader);
            if (err) {
                params.chain.logger.error(`decode redo log from ${message.redoPath} failed `, err);
                return { err };
            }
            params.chain.logger.debug(`about to remove tmp redo log `, message.redoPath);
            fs.removeSync(message.redoPath);
            result.storage = params.storage;
        }
        return { err: error_code_1.ErrorCode.RESULT_OK, result };
    }
    async run(params) {
        let result = Object.create(null);
        result.name = params.name;
        result.chain = params.chain;
        result.type = params.type;
        do {
            const nber = await params.chain.newBlockExecutor(params.block, params.storage);
            if (nber.err) {
                result.err = nber.err;
                break;
            }
            if (params.type === RoutineType.execute) {
                let err = await nber.executor.execute();
                result.err = err;
                if (!result.err) {
                    result.block = params.block;
                    result.storage = params.storage;
                }
            }
            else if (params.type === RoutineType.verify) {
                let vr = await nber.executor.verify();
                result.err = vr.err;
                if (!result.err) {
                    result.valid = vr.valid;
                    result.block = params.block;
                    result.storage = params.storage;
                }
            }
            else {
                assert(false, `invalid routine type`);
                result.err = error_code_1.ErrorCode.RESULT_INVALID_PARAM;
            }
        } while (false);
        await params.storage.uninit();
        return result;
    }
}
exports.BlockExecutorWorkerRoutine = BlockExecutorWorkerRoutine;
class InterprocessRoutineManager {
    constructor(chain) {
        this.m_chain = chain;
    }
    create(options) {
        const routine = new InterprocessRoutine({
            name: options.name,
            chain: this.m_chain,
            block: options.block,
            storage: options.storage
        });
        return { err: error_code_1.ErrorCode.RESULT_OK, routine };
    }
}
exports.InterprocessRoutineManager = InterprocessRoutineManager;
class InterprocessRoutine extends executor_routine_1.BlockExecutorRoutine {
    constructor(options) {
        super({
            name: options.name,
            logger: options.chain.logger,
            block: options.block,
            storage: options.storage
        });
        this.m_state = executor_routine_1.BlockExecutorRoutineState.init;
        this.m_cancelSet = false;
        this.m_chain = options.chain;
    }
    async _executeOrVerify(type) {
        if (this.m_state !== executor_routine_1.BlockExecutorRoutineState.init) {
            return { err: error_code_1.ErrorCode.RESULT_INVALID_STATE };
        }
        this.m_state = executor_routine_1.BlockExecutorRoutineState.running;
        this.m_worker = new WorkerProxy(this.m_logger);
        const result = await this.m_worker.run({
            type,
            name: this.m_name,
            chain: this.m_chain,
            block: this.m_block,
            storage: this.m_storage
        });
        if (this.m_cancelSet) {
            return { err: error_code_1.ErrorCode.RESULT_CANCELED };
        }
        if (result.block) {
            this.m_block = result.block;
        }
        return { err: error_code_1.ErrorCode.RESULT_OK, result: { err: result.err } };
    }
    async execute() {
        return this._executeOrVerify(RoutineType.execute);
    }
    async verify() {
        return this._executeOrVerify(RoutineType.verify);
    }
    cancel() {
        if (this.m_state === executor_routine_1.BlockExecutorRoutineState.finished) {
            return;
        }
        else if (this.m_state === executor_routine_1.BlockExecutorRoutineState.init) {
            this.m_state = executor_routine_1.BlockExecutorRoutineState.finished;
            return;
        }
        this.m_cancelSet = true;
        this.m_worker.cancel();
    }
}
class WorkerProxy {
    constructor(logger) {
        this.m_logger = logger;
    }
    async run(params) {
        await params.storage.uninit();
        const epr = BlockExecutorWorkerRoutine.encodeParams(params);
        if (epr.err) {
            return { err: error_code_1.ErrorCode.RESULT_INVALID_PARAM, type: params.type, chain: params.chain, name: params.name };
        }
        const workerPath = path.join(__dirname, '../../routine/executor_routine.js');
        if (this.m_logger.level === 'debug') {
            let command = JSON.stringify(epr.message).replace(/\\\\/g, '/').replace(/\"/g, '\\"');
            this.m_logger.debug('run command in worker routine: ', command);
        }
        this.m_childProcess = childProcess.fork(workerPath);
        if (!this.m_childProcess.send(epr.message)) {
            return { err: error_code_1.ErrorCode.RESULT_EXCEPTION, type: params.type, chain: params.chain, name: params.name };
        }
        const result = await new Promise((resolve) => {
            const errListener = () => {
                this.m_logger.debug(`routine process error`);
                resolve({ err: error_code_1.ErrorCode.RESULT_EXCEPTION, type: params.type, chain: params.chain, name: params.name });
            };
            this.m_childProcess.on('error', errListener);
            this.m_childProcess.on('message', (message) => {
                this.m_childProcess.removeListener('error', errListener);
                if (this.m_logger.level === 'debug') {
                    const rawResult = JSON.stringify(message).replace(/\\\\/g, '/').replace(/\"/g, '\\"');
                    this.m_logger.debug('result of worker routine: ', rawResult);
                }
                const dr = BlockExecutorWorkerRoutine.decodeResult(params, message);
                if (dr.err) {
                    resolve({ err: dr.err, type: params.type, name: params.name, chain: params.chain });
                }
                else {
                    resolve(dr.result);
                }
            });
        });
        return result;
    }
    cancel() {
        if (!this.m_childProcess || this.m_childProcess.killed) {
            return;
        }
        this.m_logger.debug(`executor canceled, will kill routine process`);
        this.m_childProcess.kill();
    }
}
