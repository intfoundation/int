"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const events_1 = require("events");
const fs = require("fs-extra");
const assert = require('assert');
const error_code_1 = require("../error_code");
const logger_1 = require("./logger");
const reader_1 = require("../lib/reader");
class IReadableStorage {
}
exports.IReadableStorage = IReadableStorage;
class IReadWritableStorage extends IReadableStorage {
}
exports.IReadWritableStorage = IReadWritableStorage;
class Storage extends IReadWritableStorage {
    constructor(options) {
        super();
        this.m_eventEmitter = new events_1.EventEmitter();
        this.m_filePath = options.filePath;
        this.m_logger = options.logger;
    }
    createLogger(logger) {
        if (!this.m_storageLogger) {
            if (!logger) {
                logger = this._createLogger();
                logger.init();
            }
            this.m_storageLogger = new logger_1.LoggedStorage(this, logger);
        }
    }
    get storageLogger() {
        if (this.m_storageLogger) {
            return this.m_storageLogger.logger;
        }
    }
    on(event, listener) {
        this.m_eventEmitter.on(event, listener);
        return this;
    }
    once(event, listener) {
        this.m_eventEmitter.once(event, listener);
        return this;
    }
    async redo(logBuf) {
        let logger = this._createLogger();
        let err = logger.decode(new reader_1.BufferReader(logBuf));
        if (err) {
            return err;
        }
        return logger.redoOnStorage(this);
    }
    get filePath() {
        return this.m_filePath;
    }
    async reset() {
        const err = await this.remove();
        if (err) {
            return err;
        }
        return await this.init();
    }
    async remove() {
        await this.uninit();
        if (fs.existsSync(this.m_filePath)) {
            try {
                this.m_logger.debug(`about to remove storage file `, this.m_filePath);
                fs.unlinkSync(this.m_filePath);
            }
            catch (e) {
                this.m_logger.error(`remove storage ${this.m_filePath} failed `, e);
                return error_code_1.ErrorCode.RESULT_EXCEPTION;
            }
        }
        return error_code_1.ErrorCode.RESULT_OK;
    }
    messageDigest() {
        return Promise.resolve({ err: error_code_1.ErrorCode.RESULT_NOT_SUPPORT });
    }
    static getKeyValueFullName(dbName, kvName) {
        return `${dbName}${this.keyValueNameSpec}${kvName}`;
    }
    static checkDataBaseName(name) {
        if (Storage.splitFullName(name).dbName) {
            return error_code_1.ErrorCode.RESULT_INVALID_PARAM;
        }
        return error_code_1.ErrorCode.RESULT_OK;
    }
    static checkTableName(name) {
        if (Storage.splitFullName(name).dbName) {
            return error_code_1.ErrorCode.RESULT_INVALID_PARAM;
        }
        return error_code_1.ErrorCode.RESULT_OK;
    }
    static splitFullName(fullName) {
        let i = fullName.indexOf(this.keyValueNameSpec);
        if (i > 0) {
            let dbName = fullName.substr(0, i);
            let kvName = fullName.substr(i + 1);
            return {
                dbName,
                kvName
            };
        }
        return {};
    }
    async getKeyValue(dbName, kvName) {
        let err = Storage.checkDataBaseName(dbName);
        if (err) {
            return { err };
        }
        err = Storage.checkTableName(dbName);
        if (err) {
            return { err };
        }
        let dbr = await this.getReadWritableDatabase(dbName);
        if (dbr.err) {
            return { err: dbr.err };
        }
        return dbr.value.getReadWritableKeyValue(kvName);
    }
    async getTable(fullName) {
        let names = Storage.splitFullName(fullName);
        if (!names.dbName) {
            return { err: error_code_1.ErrorCode.RESULT_INVALID_PARAM };
        }
        let dbr = await this.getReadWritableDatabase(names.dbName);
        if (dbr.err) {
            return { err: dbr.err };
        }
        if (names.kvName) {
            return dbr.value.getReadWritableKeyValue(names.kvName);
        }
        else {
            assert(false, `invalid fullName ${fullName}`);
            return { err: error_code_1.ErrorCode.RESULT_EXCEPTION };
        }
    }
}
Storage.keyValueNameSpec = '#';
exports.Storage = Storage;
