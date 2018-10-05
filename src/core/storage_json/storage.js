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
exports.JsonStorage = JsonStorage;
