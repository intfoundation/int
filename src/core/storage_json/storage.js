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
    async hdel(key, field) {
        try {
            if (util_1.isUndefined(this.m_root[key])) {
                return { err: error_code_1.ErrorCode.RESULT_NOT_FOUND };
            }
            delete this.m_root[key][field];
            return { err: error_code_1.ErrorCode.RESULT_OK };
        }
        catch (e) {
            this.logger.error(`hdel ${key} ${field} `, e);
            return { err: error_code_1.ErrorCode.RESULT_EXCEPTION };
        }
    }
    async hlen(key) {
        try {
            assert(key);
            if (util_1.isUndefined(this.m_root[key])) {
                return { err: error_code_1.ErrorCode.RESULT_NOT_FOUND };
            }
            return { err: error_code_1.ErrorCode.RESULT_OK, value: Object.keys(this.m_root[key]).length };
        }
        catch (e) {
            this.logger.error(`hlen ${key} `, e);
            return { err: error_code_1.ErrorCode.RESULT_EXCEPTION };
        }
    }
    async hexists(key, field) {
        try {
            assert(key);
            assert(field);
            if (util_1.isUndefined(this.m_root[key])) {
                return { err: error_code_1.ErrorCode.RESULT_NOT_FOUND };
            }
            return { err: error_code_1.ErrorCode.RESULT_OK, value: !util_1.isUndefined(this.m_root[key][field]) };
        }
        catch (e) {
            this.logger.error(`hexsits ${key} ${field}`, e);
            return { err: error_code_1.ErrorCode.RESULT_EXCEPTION };
        }
    }
    async hmset(key, fields, values) {
        try {
            assert(key);
            assert(fields.length === values.length);
            if (!this.m_root[key]) {
                this.m_root[key] = Object.create(null);
            }
            for (let ix = 0; ix < fields.length; ++ix) {
                this.m_root[key][fields[ix]] = serializable_1.deepCopy(values[ix]);
            }
            return { err: error_code_1.ErrorCode.RESULT_OK };
        }
        catch (e) {
            this.logger.error(`hmset ${key} ${fields} `, e);
            return { err: error_code_1.ErrorCode.RESULT_EXCEPTION };
        }
    }
    async hmget(key, fields) {
        try {
            assert(key);
            if (util_1.isUndefined(this.m_root[key])) {
                return { err: error_code_1.ErrorCode.RESULT_NOT_FOUND };
            }
            let values = [];
            for (let f of fields) {
                values.push(serializable_1.deepCopy(this.m_root[key][f]));
            }
            return { err: error_code_1.ErrorCode.RESULT_OK, value: values };
        }
        catch (e) {
            this.logger.error(`hmget ${key} ${fields} `, e);
            return { err: error_code_1.ErrorCode.RESULT_EXCEPTION };
        }
    }
    async hkeys(key) {
        try {
            assert(key);
            if (util_1.isUndefined(this.m_root[key])) {
                return { err: error_code_1.ErrorCode.RESULT_NOT_FOUND };
            }
            return { err: error_code_1.ErrorCode.RESULT_OK, value: Object.keys(this.m_root[key]) };
        }
        catch (e) {
            this.logger.error(`hkeys ${key} `, e);
            return { err: error_code_1.ErrorCode.RESULT_EXCEPTION };
        }
    }
    async hvalues(key) {
        try {
            assert(key);
            if (util_1.isUndefined(this.m_root[key])) {
                return { err: error_code_1.ErrorCode.RESULT_NOT_FOUND };
            }
            return { err: error_code_1.ErrorCode.RESULT_OK, value: Object.values(this.m_root[key]).map((x) => serializable_1.deepCopy(x)) };
        }
        catch (e) {
            this.logger.error(`hvalues ${key} `, e);
            return { err: error_code_1.ErrorCode.RESULT_EXCEPTION };
        }
    }
    async hgetall(key) {
        try {
            if (util_1.isUndefined(this.m_root[key])) {
                return { err: error_code_1.ErrorCode.RESULT_NOT_FOUND };
            }
            return {
                err: error_code_1.ErrorCode.RESULT_OK, value: Object.keys(this.m_root[key]).map((x) => {
                    return { key: x, value: serializable_1.deepCopy(this.m_root[key][x]) };
                })
            };
        }
        catch (e) {
            this.logger.error(`hgetall ${key} `, e);
            return { err: error_code_1.ErrorCode.RESULT_EXCEPTION };
        }
    }
    async hclean(key) {
        try {
            delete this.m_root[key];
            return { err: error_code_1.ErrorCode.RESULT_OK };
        }
        catch (e) {
            this.logger.error(`hclean ${key} `, e);
            return { err: error_code_1.ErrorCode.RESULT_EXCEPTION };
        }
    }
    async lindex(key, index) {
        try {
            if (util_1.isUndefined(this.m_root[key])) {
                return { err: error_code_1.ErrorCode.RESULT_NOT_FOUND };
            }
            return { err: error_code_1.ErrorCode.RESULT_OK, value: serializable_1.deepCopy(this.m_root[key][index]) };
        }
        catch (e) {
            this.logger.error(`lindex ${key} ${index}`, e);
            return { err: error_code_1.ErrorCode.RESULT_EXCEPTION };
        }
    }
    async lset(key, index, value) {
        try {
            assert(key);
            this.m_root[key][index] = serializable_1.deepCopy(value);
            return { err: error_code_1.ErrorCode.RESULT_OK };
        }
        catch (e) {
            this.logger.error(`lset ${key} ${index} `, e);
            return { err: error_code_1.ErrorCode.RESULT_EXCEPTION };
        }
    }
    async llen(key) {
        try {
            if (util_1.isUndefined(this.m_root[key])) {
                return { err: error_code_1.ErrorCode.RESULT_NOT_FOUND };
            }
            return { err: error_code_1.ErrorCode.RESULT_OK, value: this.m_root[key].length };
        }
        catch (e) {
            this.logger.error(`llen ${key} `, e);
            return { err: error_code_1.ErrorCode.RESULT_EXCEPTION };
        }
    }
    async lrange(key, start, stop) {
        try {
            assert(key);
            if (util_1.isUndefined(this.m_root[key])) {
                return { err: error_code_1.ErrorCode.RESULT_NOT_FOUND };
            }
            const { err, value: len } = await this.llen(key);
            if (err) {
                return { err };
            }
            if (!len) {
                return { err: error_code_1.ErrorCode.RESULT_OK, value: [] };
            }
            if (start < 0) {
                start = len + start;
            }
            if (stop < 0) {
                stop = len + stop;
            }
            if (stop >= len) {
                stop = len - 1;
            }
            return { err: error_code_1.ErrorCode.RESULT_OK, value: serializable_1.deepCopy(this.m_root[key].slice(start, stop + 1)) };
        }
        catch (e) {
            this.logger.error(`lrange ${key} ${start} ${stop}`, e);
            return { err: error_code_1.ErrorCode.RESULT_EXCEPTION };
        }
    }
    async lpush(key, value) {
        try {
            assert(key);
            if (!this.m_root[key]) {
                this.m_root[key] = [];
            }
            this.m_root[key].unshift(serializable_1.deepCopy(value));
            return { err: error_code_1.ErrorCode.RESULT_OK };
        }
        catch (e) {
            this.logger.error(`lpush ${key} `, e);
            return { err: error_code_1.ErrorCode.RESULT_EXCEPTION };
        }
    }
    async lpushx(key, value) {
        try {
            assert(key);
            if (!this.m_root[key]) {
                this.m_root[key] = [];
            }
            this.m_root[key].unshift(...value.map((e) => serializable_1.deepCopy(e)));
            return { err: error_code_1.ErrorCode.RESULT_OK };
        }
        catch (e) {
            this.logger.error(`lpushx ${key} `, e);
            return { err: error_code_1.ErrorCode.RESULT_EXCEPTION };
        }
    }
    async lpop(key) {
        try {
            assert(key);
            if (this.m_root[key] && this.m_root[key].length > 0) {
                return { err: error_code_1.ErrorCode.RESULT_OK, value: serializable_1.deepCopy(this.m_root[key].shift()) };
            }
            else {
                return { err: error_code_1.ErrorCode.RESULT_NOT_FOUND };
            }
        }
        catch (e) {
            this.logger.error(`lpop ${key} `, e);
            return { err: error_code_1.ErrorCode.RESULT_EXCEPTION };
        }
    }
    async rpush(key, value) {
        try {
            assert(key);
            if (!this.m_root[key]) {
                this.m_root[key] = [];
            }
            this.m_root[key].push(serializable_1.deepCopy(value));
            return { err: error_code_1.ErrorCode.RESULT_OK };
        }
        catch (e) {
            this.logger.error(`rpush ${key} `, e);
            return { err: error_code_1.ErrorCode.RESULT_EXCEPTION };
        }
    }
    async rpushx(key, value) {
        try {
            assert(key);
            if (!this.m_root[key]) {
                this.m_root[key] = [];
            }
            this.m_root[key].push(...value.map((e) => serializable_1.deepCopy(e)));
            return { err: error_code_1.ErrorCode.RESULT_OK };
        }
        catch (e) {
            this.logger.error(`lpushx ${key} `, e);
            return { err: error_code_1.ErrorCode.RESULT_EXCEPTION };
        }
    }
    async rpop(key) {
        try {
            assert(key);
            if (this.m_root[key] && this.m_root[key].length > 0) {
                return { err: error_code_1.ErrorCode.RESULT_OK, value: serializable_1.deepCopy(this.m_root[key].pop()) };
            }
            else {
                return { err: error_code_1.ErrorCode.RESULT_NOT_FOUND };
            }
        }
        catch (e) {
            this.logger.error(`rpop ${key} `, e);
            return { err: error_code_1.ErrorCode.RESULT_EXCEPTION };
        }
    }
    async linsert(key, index, value) {
        try {
            assert(key);
            this.m_root[key].splice(index, 0, serializable_1.deepCopy(value));
            return { err: error_code_1.ErrorCode.RESULT_OK };
        }
        catch (e) {
            this.logger.error(`linsert ${key} ${index} `, value, e);
            return { err: error_code_1.ErrorCode.RESULT_EXCEPTION };
        }
    }
    async lremove(key, index) {
        try {
            assert(key);
            return { err: error_code_1.ErrorCode.RESULT_OK, value: serializable_1.deepCopy(this.m_root[key].splice(index, 1)[0]) };
        }
        catch (e) {
            this.logger.error(`lremove ${key} `, e);
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
        try {
            const raw = JSON.stringify(this.m_root, undefined, 4);
            let hash = digest.hash256(Buffer.from(raw, 'utf8')).toString('hex');
            return { err: error_code_1.ErrorCode.RESULT_OK, value: hash };
        }
        catch (e) {
            this.m_logger.error('json storage messagedigest exception ', e);
            return { err: error_code_1.ErrorCode.RESULT_EXCEPTION };
        }
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
