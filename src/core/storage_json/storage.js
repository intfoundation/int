"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require("assert");
const fs = require("fs-extra");
const path = require("path");
const error_code_1 = require("../error_code");
const serializable_1 = require("../serializable");
const storage_1 = require("../storage");
const digest = require("../lib/digest");
const util_1 = require("util");
class JsonStorageKeyValue {
    constructor(dbRoot, name, logger) {
        this.name = name;
        this.logger = logger;
        this.m_root = dbRoot[name];
    }
    get root() {
        const r = this.m_root;
        return r;
    }
    async set(key, value) {
        try {
            assert(key);
            this.m_root[key] = serializable_1.deepCopy(value);
            return { err: error_code_1.ErrorCode.RESULT_OK };
        }
        catch (e) {
            this.logger.error(`set ${key} `, e);
            return { err: error_code_1.ErrorCode.RESULT_EXCEPTION };
        }
    }
    async get(key) {
        try {
            assert(key);
            if (util_1.isUndefined(this.m_root[key])) {
                return { err: error_code_1.ErrorCode.RESULT_NOT_FOUND };
            }
            return { err: error_code_1.ErrorCode.RESULT_OK, value: serializable_1.deepCopy(this.m_root[key]) };
        }
        catch (e) {
            this.logger.error(`get ${key} `, e);
            return { err: error_code_1.ErrorCode.RESULT_EXCEPTION };
        }
    }
    async hset(key, field, value) {
        try {
            assert(key);
            assert(field);
            if (!this.m_root[key]) {
                this.m_root[key] = Object.create(null);
            }
            this.m_root[key][field] = serializable_1.deepCopy(value);
            return { err: error_code_1.ErrorCode.RESULT_OK };
        }
        catch (e) {
            this.logger.error(`hset ${key} ${field} `, e);
            return { err: error_code_1.ErrorCode.RESULT_EXCEPTION };
        }
    }
    async hget(key, field) {
        try {
            assert(key);
            assert(field);
            if (util_1.isUndefined(this.m_root[key])) {
                return { err: error_code_1.ErrorCode.RESULT_NOT_FOUND };
            }
            return { err: error_code_1.ErrorCode.RESULT_OK, value: serializable_1.deepCopy(this.m_root[key][field]) };
        }
        catch (e) {
            this.logger.error(`hget ${key} ${field} `, e);
            return { err: error_code_1.ErrorCode.RESULT_EXCEPTION };
        }
    }
}
class JsonReadableDatabase {
    constructor(storageRoot, name, logger) {
        this.name = name;
        this.logger = logger;
        this.m_root = storageRoot[name];
    }
    get root() {
        const r = this.m_root;
        return r;
    }
    async getReadableKeyValue(name) {
        const err = storage_1.Storage.checkTableName(name);
        if (err) {
            return { err };
        }
        let tbl = new JsonStorageKeyValue(this.m_root, name, this.logger);
        return { err: error_code_1.ErrorCode.RESULT_OK, kv: tbl };
    }
}
class JsonReadWritableDatabase extends JsonReadableDatabase {
    constructor(...args) {
        super(args[0], args[1], args[2]);
    }
    async getReadWritableKeyValue(name) {
        let err = storage_1.Storage.checkTableName(name);
        if (err) {
            return { err };
        }
        let tbl = new JsonStorageKeyValue(this.m_root, name, this.logger);
        return { err: error_code_1.ErrorCode.RESULT_OK, kv: tbl };
    }
    async createKeyValue(name) {
        let err = storage_1.Storage.checkTableName(name);
        if (err) {
            return { err };
        }
        if (!util_1.isNullOrUndefined(this.m_root[name])) {
            err = error_code_1.ErrorCode.RESULT_ALREADY_EXIST;
        }
        else {
            this.m_root[name] = Object.create(null);
            err = error_code_1.ErrorCode.RESULT_OK;
        }
        let tbl = new JsonStorageKeyValue(this.m_root, name, this.logger);
        return { err, kv: tbl };
    }
}
class JsonStorageTransaction {
    constructor(storageRoot) {
        this.m_transactionRoot = serializable_1.deepCopy(storageRoot);
        this.m_storageRoot = storageRoot;
    }
    async beginTransaction() {
        return error_code_1.ErrorCode.RESULT_OK;
    }
    async commit() {
        return error_code_1.ErrorCode.RESULT_OK;
    }
    async rollback() {
        for (const k of Object.keys(this.m_storageRoot)) {
            delete this.m_storageRoot[k];
        }
        Object.assign(this.m_storageRoot, this.m_transactionRoot);
        return error_code_1.ErrorCode.RESULT_OK;
    }
}
class JsonStorage extends storage_1.Storage {
    constructor() {
        super(...arguments);
        this.m_isInit = false;
    }
    get root() {
        const r = this.m_root;
        return r;
    }
    _createLogger() {
        return new storage_1.JStorageLogger();
    }
    get isInit() {
        return this.m_isInit;
    }
    async init(readonly) {
        if (this.m_root) {
            return error_code_1.ErrorCode.RESULT_SKIPPED;
        }
        assert(!this.m_root);
        fs.ensureDirSync(path.dirname(this.m_filePath));
        let options = {};
        let err = error_code_1.ErrorCode.RESULT_OK;
        if (fs.existsSync(this.m_filePath)) {
            try {
                const root = fs.readJSONSync(this.m_filePath);
                this.m_root = serializable_1.fromStringifiable(root);
            }
            catch (e) {
                err = error_code_1.ErrorCode.RESULT_EXCEPTION;
            }
        }
        else {
            this.m_root = Object.create(null);
        }
        if (!err) {
            this.m_isInit = true;
        }
        setImmediate(() => {
            this.m_eventEmitter.emit('init', err);
    });
        return err;
    }
    async uninit() {
        await this.flush();
        if (this.m_root) {
            delete this.m_root;
        }
        return error_code_1.ErrorCode.RESULT_OK;
    }
    async messageDigest() {
        let buf = await fs.readFile(this.m_filePath);
        let hash = digest.hash256(buf).toString('hex');
        return { err: error_code_1.ErrorCode.RESULT_OK, value: hash };
    }
    async getReadableDataBase(name) {
        let err = storage_1.Storage.checkDataBaseName(name);
        if (err) {
            return { err };
        }
        return { err: error_code_1.ErrorCode.RESULT_OK, value: new JsonReadableDatabase(this.m_root, name, this.m_logger) };
    }
    async createDatabase(name) {
        let err = storage_1.Storage.checkDataBaseName(name);
        if (err) {
            return { err };
        }
        if (util_1.isUndefined(this.m_root[name])) {
            this.m_root[name] = Object.create(null);
        }
        return { err: error_code_1.ErrorCode.RESULT_OK, value: new JsonReadWritableDatabase(this.m_root, name, this.m_logger) };
    }
    async getReadWritableDatabase(name) {
        let err = storage_1.Storage.checkDataBaseName(name);
        if (err) {
            return { err };
        }
        return { err: error_code_1.ErrorCode.RESULT_OK, value: new JsonReadWritableDatabase(this.m_root, name, this.m_logger) };
    }
    async beginTransaction() {
        let transcation = new JsonStorageTransaction(this.m_root);
        await transcation.beginTransaction();
        return { err: error_code_1.ErrorCode.RESULT_OK, value: transcation };
    }
    async flush(root) {
        if (root) {
            this.m_root = root;
        }
        const s = serializable_1.toStringifiable(this.m_root, true);
        await fs.writeJSON(this.m_filePath, s, { spaces: 4, flag: 'w' });
    }
}
exports.JsonStorage = JsonStorage;
