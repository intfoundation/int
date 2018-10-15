"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const error_code_1 = require("../error_code");
class TransactionLogger {
    constructor(owner) {
        this.owner = owner;
    }
    async beginTransaction() {
        this.owner.appendLog(`{let trans = (await storage.beginTransaction()).value;`);
        return error_code_1.ErrorCode.RESULT_OK;
    }
    async commit() {
        this.owner.appendLog(`await trans.commit();}`);
        return error_code_1.ErrorCode.RESULT_OK;
    }
    async rollback() {
        this.owner.appendLog(`await trans.rollback();}`);
        return error_code_1.ErrorCode.RESULT_OK;
    }
}
class KeyValueLogger {
    constructor(owner, name) {
        this.owner = owner;
        this.name = name;
    }
    get(key) {
        return Promise.resolve({ err: error_code_1.ErrorCode.RESULT_NOT_SUPPORT });
    }
    getall() {
        return Promise.resolve({ err: error_code_1.ErrorCode.RESULT_NOT_SUPPORT });
    }
    hexists(key, field) {
        return Promise.resolve({ err: error_code_1.ErrorCode.RESULT_NOT_SUPPORT });
    }
    hget(key, field) {
        return Promise.resolve({ err: error_code_1.ErrorCode.RESULT_NOT_SUPPORT });
    }
    hmget(key, fields) {
        return Promise.resolve({ err: error_code_1.ErrorCode.RESULT_NOT_SUPPORT });
    }
    hlen(key) {
        return Promise.resolve({ err: error_code_1.ErrorCode.RESULT_NOT_SUPPORT });
    }
    hkeys(key) {
        return Promise.resolve({ err: error_code_1.ErrorCode.RESULT_NOT_SUPPORT });
    }
    hvalues(key) {
        return Promise.resolve({ err: error_code_1.ErrorCode.RESULT_NOT_SUPPORT });
    }
    hgetall(key) {
        return Promise.resolve({ err: error_code_1.ErrorCode.RESULT_NOT_SUPPORT });
    }
    lindex(key, index) {
        return Promise.resolve({ err: error_code_1.ErrorCode.RESULT_NOT_SUPPORT });
    }
    llen(key) {
        return Promise.resolve({ err: error_code_1.ErrorCode.RESULT_NOT_SUPPORT });
    }
    lrange(key, start, stop) {
        return Promise.resolve({ err: error_code_1.ErrorCode.RESULT_NOT_SUPPORT });
    }
    async set(key, value) {
        this.owner.appendLog(`await ${this.name}.set(${JSON.stringify(key)}, ${JSON.stringify(value)});`);
        return { err: error_code_1.ErrorCode.RESULT_OK };
    }
    // hash
    async hset(key, field, value) {
        this.owner.appendLog(`await ${this.name}.hset(${JSON.stringify(key)}, ${JSON.stringify(field)}, ${JSON.stringify(value)});`);
        return { err: error_code_1.ErrorCode.RESULT_OK };
    }
    async hmset(key, fields, values) {
        this.owner.appendLog(`await ${this.name}.hmset(${JSON.stringify(key)}, ${JSON.stringify(fields)}, ${JSON.stringify(values)});`);
        return { err: error_code_1.ErrorCode.RESULT_OK };
    }
    async hclean(key) {
        this.owner.appendLog(`await ${this.name}.hclean(${JSON.stringify(key)});`);
        return { err: error_code_1.ErrorCode.RESULT_OK };
    }
    async hdel(key, field) {
        this.owner.appendLog(`await ${this.name}.hdel(${key},${field})`);
        return { err: error_code_1.ErrorCode.RESULT_OK };
    }
    // array
    async lset(key, index, value) {
        this.owner.appendLog(`await ${this.name}.lset(${JSON.stringify(key)}, ${index}, ${JSON.stringify(value)});`);
        return { err: error_code_1.ErrorCode.RESULT_OK };
    }
    async lpush(key, value) {
        this.owner.appendLog(`await ${this.name}.lpush(${JSON.stringify(key)}, ${JSON.stringify(value)});`);
        return { err: error_code_1.ErrorCode.RESULT_OK };
    }
    async lpushx(key, value) {
        this.owner.appendLog(`await ${this.name}.lpushx(${JSON.stringify(key)}, ${JSON.stringify(value)});`);
        return { err: error_code_1.ErrorCode.RESULT_OK };
    }
    async lpop(key) {
        this.owner.appendLog(`await ${this.name}.lpop(${JSON.stringify(key)});`);
        return { err: error_code_1.ErrorCode.RESULT_OK };
    }
    async rpush(key, value) {
        this.owner.appendLog(`await ${this.name}.rpush(${JSON.stringify(key)}, ${JSON.stringify(value)});`);
        return { err: error_code_1.ErrorCode.RESULT_OK };
    }
    async rpushx(key, value) {
        this.owner.appendLog(`await ${this.name}.rpushx(${JSON.stringify(key)}, ${JSON.stringify(value)});`);
        return { err: error_code_1.ErrorCode.RESULT_OK };
    }
    async rpop(key) {
        this.owner.appendLog(`await ${this.name}.rpop(${JSON.stringify(key)});`);
        return { err: error_code_1.ErrorCode.RESULT_OK };
    }
    async linsert(key, index, value) {
        this.owner.appendLog(`await ${this.name}.linsert(${JSON.stringify(key)}, ${index}, ${JSON.stringify(value)});`);
        return { err: error_code_1.ErrorCode.RESULT_OK };
    }
    async lremove(key, index) {
        this.owner.appendLog(`await ${this.name}.hset(${JSON.stringify(key)}, ${index});`);
        return { err: error_code_1.ErrorCode.RESULT_OK };
    }
}
class DatabaseLogger {
    constructor(owner, name) {
        this.owner = owner;
        this.name = name;
        this.m_nextVal = 0;
    }
    _kvVal() {
        let val = `kv${this.m_nextVal}`;
        ++this.m_nextVal;
        return val;
    }
    async createKeyValue(name) {
        let val = this._kvVal();
        this.owner.appendLog(`let ${val} = (await ${this.name}.createKeyValue(${JSON.stringify(name)})).kv;`);
        return { err: error_code_1.ErrorCode.RESULT_OK, kv: new KeyValueLogger(this.owner, val) };
    }
    async getReadWritableKeyValue(name) {
        let val = this._kvVal();
        this.owner.appendLog(`let ${val} = (await ${this.name}.getReadWritableKeyValue(${JSON.stringify(name)})).kv;`);
        return { err: error_code_1.ErrorCode.RESULT_OK, kv: new KeyValueLogger(this.owner, val) };
    }
}
class JStorageLogger {
    constructor() {
        this.m_log = '';
        this.m_nextVal = 0;
        this.m_log = '';
    }
    _dbVal() {
        let val = `db${this.m_nextVal}`;
        ++this.m_nextVal;
        return val;
    }
    get log() {
        return this.m_log;
    }
    redoOnStorage(storage) {
        return new Promise((resolve) => {
            eval(this.m_log);
        });
    }
    encode(writer) {
        writer.writeVarString(this.m_log);
        return error_code_1.ErrorCode.RESULT_OK;
    }
    decode(reader) {
        this.m_log = reader.readVarString();
        return error_code_1.ErrorCode.RESULT_OK;
    }
    init() {
        this.m_log = 'async function redo() {';
    }
    finish() {
        this.appendLog('}; redo().then(()=>{resolve(0);})');
    }
    appendLog(log) {
        this.m_log += log;
    }
    async createDatabase(name) {
        let val = this._dbVal();
        this.appendLog(`let ${val} = (await storage.createKeyValue(${JSON.stringify(name)})).value;`);
        return { err: error_code_1.ErrorCode.RESULT_OK, value: new DatabaseLogger(this, val) };
    }
    async getReadWritableDatabase(name) {
        let val = this._dbVal();
        this.appendLog(`let ${val} = (await storage.getReadWritableDatabase(${JSON.stringify(name)})).value;`);
        return { err: error_code_1.ErrorCode.RESULT_OK, value: new DatabaseLogger(this, val) };
    }
    async beginTransaction() {
        return { err: error_code_1.ErrorCode.RESULT_OK, value: new TransactionLogger(this) };
    }
}
exports.JStorageLogger = JStorageLogger;
