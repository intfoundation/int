"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const fs = require("fs-extra");
const path = require("path");
const assert = require("assert");
const sqlite = require("sqlite");
const sqlite3 = require("sqlite3");
const { TransactionDatabase } = require('sqlite3-transactions');
const error_code_1 = require("../error_code");
const serializable_1 = require("../serializable");
const storage_1 = require("../storage");
const util_1 = require("util");
const digest = require('../lib/digest');
const { LogShim } = require('../lib/log_shim');
class SqliteStorageKeyValue {
    constructor(db, fullName, logger) {
        this.db = db;
        this.fullName = fullName;
        this.logger = new LogShim(logger).bind(`[transaction: ${this.fullName}]`, true).log;
    }
    async set(key, value) {
        try {
            assert(key);
            const json = JSON.stringify(serializable_1.toStringifiable(value, true));
            const sql = `REPLACE INTO '${this.fullName}' (name, field, value) VALUES ('${key}', "____default____", '${json}')`;
            await this.db.exec(sql);
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
            const result = await this.db.get(`SELECT value FROM '${this.fullName}' \
                WHERE name=? AND field="____default____"`, key);
            if (result == null) {
                return { err: error_code_1.ErrorCode.RESULT_NOT_FOUND };
            }
            return { err: error_code_1.ErrorCode.RESULT_OK, value: serializable_1.fromStringifiable(JSON.parse(result.value)) };
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
            const json = JSON.stringify(serializable_1.toStringifiable(value, true));
            const sql = `REPLACE INTO '${this.fullName}' (name, field, value) VALUES ('${key}', '${field}', '${json}')`;
            await this.db.exec(sql);
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
            const result = await this.db.get(`SELECT value FROM '${this.fullName}' WHERE name=? AND field=?`, key, field);
            if (result == null) {
                return { err: error_code_1.ErrorCode.RESULT_NOT_FOUND };
            }
            return { err: error_code_1.ErrorCode.RESULT_OK, value: serializable_1.fromStringifiable(JSON.parse(result.value)) };
        }
        catch (e) {
            this.logger.error(`hget ${key} ${field} `, e);
            return { err: error_code_1.ErrorCode.RESULT_EXCEPTION };
        }
    }
    async hdel(key, field) {
        try {
            await this.db.exec(`DELETE FROM '${this.fullName}' WHERE name='${key}' and field='${field}'`);
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
            const result = await this.db.get(`SELECT count(*) as value FROM '${this.fullName}' WHERE name=?`, key);
            return { err: error_code_1.ErrorCode.RESULT_OK, value: result.value };
        }
        catch (e) {
            this.logger.error(`hlen ${key} `, e);
            return { err: error_code_1.ErrorCode.RESULT_EXCEPTION };
        }
    }
    async hexists(key, field) {
        let { err } = await this.hget(key, field);
        if (!err) {
            return { err: error_code_1.ErrorCode.RESULT_OK, value: true };
        }
        else if (err === error_code_1.ErrorCode.RESULT_NOT_FOUND) {
            return { err: error_code_1.ErrorCode.RESULT_OK, value: false };
        }
        else {
            this.logger.error(`hexists ${key} ${field} `, err);
            return { err };
        }
    }
    async hmset(key, fields, values) {
        try {
            assert(key);
            assert(fields.length === values.length);
            const statement = await this.db.prepare(`REPLACE INTO '${this.fullName}'  (name, field, value) VALUES (?, ?, ?)`);
            for (let i = 0; i < fields.length; i++) {
                await statement.run([key, fields[i], JSON.stringify(serializable_1.toStringifiable(values[i], true))]);
            }
            await statement.finalize();
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
            const sql = `SELECT * FROM '${this.fullName}' WHERE name=? AND field in (${fields.map((x) => '?').join(',')})`;
            // console.log({ sql });
            const result = await this.db.all(sql, key, ...fields);
            const resultMap = {};
            result.forEach((x) => resultMap[x.field] = serializable_1.fromStringifiable(JSON.parse(x.value)));
            const values = fields.map((x) => resultMap[x]);
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
            const result = await this.db.all(`SELECT * FROM '${this.fullName}' WHERE name=?`, key);
            return { err: error_code_1.ErrorCode.RESULT_OK, value: result.map((x) => x.field) };
        }
        catch (e) {
            this.logger.error(`hkeys ${key} `, e);
            return { err: error_code_1.ErrorCode.RESULT_EXCEPTION };
        }
    }
    async hvalues(key) {
        try {
            assert(key);
            const result = await this.db.all(`SELECT * FROM '${this.fullName}' WHERE name=?`, key);
            return { err: error_code_1.ErrorCode.RESULT_OK, value: result.map((x) => serializable_1.fromStringifiable(JSON.parse(x.value))) };
        }
        catch (e) {
            this.logger.error(`hvalues ${key} `, e);
            return { err: error_code_1.ErrorCode.RESULT_EXCEPTION };
        }
    }
    async hgetall(key) {
        try {
            const result = await this.db.all(`SELECT * FROM '${this.fullName}' WHERE name=?`, key);
            return {
                err: error_code_1.ErrorCode.RESULT_OK, value: result.map((x) => {
                    return { key: x.field, value: serializable_1.fromStringifiable(JSON.parse(x.value)) };
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
            const result = await this.db.exec(`DELETE FROM ${this.fullName} WHERE name='${key}'`);
            return { err: error_code_1.ErrorCode.RESULT_OK };
        }
        catch (e) {
            this.logger.error(`hclean ${key} `, e);
            return { err: error_code_1.ErrorCode.RESULT_EXCEPTION };
        }
    }
    async lindex(key, index) {
        return this.hget(key, index.toString());
    }
    async lset(key, index, value) {
        try {
            assert(key);
            assert(!util_1.isNullOrUndefined(index));
            const json = JSON.stringify(serializable_1.toStringifiable(value, true));
            const sql = `REPLACE INTO '${this.fullName}' (name, field, value) VALUES ('${key}', '${index.toString()}', '${json}')`;
            await this.db.exec(sql);
            return { err: error_code_1.ErrorCode.RESULT_OK };
        }
        catch (e) {
            this.logger.error(`lset ${key} ${index} `, e);
            return { err: error_code_1.ErrorCode.RESULT_EXCEPTION };
        }
    }
    async llen(key) {
        return await this.hlen(key);
    }
    async lrange(key, start, stop) {
        try {
            assert(key);
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
            let fields = [];
            for (let i = start; i <= stop; ++i) {
                fields.push(i);
            }
            const result = await this.db.all(`SELECT * FROM '${this.fullName}' WHERE name='${key}' AND field in (${fields.map((x) => `'${x}'`).join(',')})`);
            let ret = new Array(result.length);
            for (let x of result) {
                ret[parseInt(x.field) - start] = serializable_1.fromStringifiable(JSON.parse(x.value));
            }
            return { err: error_code_1.ErrorCode.RESULT_OK, value: ret };
        }
        catch (e) {
            this.logger.error(`lrange ${key} ${start} ${stop}`, e);
            return { err: error_code_1.ErrorCode.RESULT_EXCEPTION };
        }
    }
    async lpush(key, value) {
        try {
            assert(key);
            // update index += 1
            // set index[0] = value
            const json = JSON.stringify(serializable_1.toStringifiable(value, true));
            await this.db.exec(`UPDATE '${this.fullName}' SET field=field+1 WHERE name='${key}'`);
            const sql = `INSERT INTO '${this.fullName}' (name, field, value) VALUES ('${key}', '0', '${json}')`;
            // console.log('lpush', { sql });
            await this.db.exec(sql);
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
            const len = value.length;
            await this.db.exec(`UPDATE '${this.fullName}' SET field=field+${len} WHERE name='${key}'`);
            for (let i = 0; i < len; i++) {
                const json = JSON.stringify(serializable_1.toStringifiable(value[i], true));
                await this.db.exec(`INSERT INTO '${this.fullName}' (name, field, value) VALUES ('${key}', '${i}', '${json}')`);
            }
            return { err: error_code_1.ErrorCode.RESULT_OK };
        }
        catch (e) {
            this.logger.error(`lpushx ${key} `, e);
            return { err: error_code_1.ErrorCode.RESULT_EXCEPTION };
        }
    }
    async lpop(key) {
        try {
            const index = 0;
            assert(key);
            const { err, value: len } = await this.llen(key);
            if (err) {
                return { err };
            }
            if (len === 0) {
                return { err: error_code_1.ErrorCode.RESULT_NOT_FOUND };
            }
            else {
                const { err: err2, value } = await this.lindex(key, index);
                let sql = `DELETE FROM '${this.fullName}' WHERE name='${key}' AND field='${index}'`;
                await this.db.exec(sql);
                for (let i = index + 1; i < len; i++) {
                    sql = `UPDATE '${this.fullName}' SET field=field-1 WHERE name='${key}' AND field = ${i}`;
                    await this.db.exec(sql);
                }
                return { err: error_code_1.ErrorCode.RESULT_OK, value };
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
            const { err, value: len } = await this.llen(key);
            if (err) {
                return { err };
            }
            const json = JSON.stringify(serializable_1.toStringifiable(value, true));
            await this.db.exec(`INSERT INTO '${this.fullName}' (name, field, value) VALUES ('${key}', '${len}', '${json}')`);
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
            const { err, value: len } = await this.llen(key);
            if (err) {
                return { err };
            }
            for (let i = 0; i < value.length; i++) {
                const json = JSON.stringify(serializable_1.toStringifiable(value[i], true));
                await this.db.exec(`INSERT INTO '${this.fullName}' (name, field, value) \
                    VALUES ('${key}', '${len + i}', '${json}')`);
            }
            return { err: error_code_1.ErrorCode.RESULT_OK };
        }
        catch (e) {
            this.logger.error(`rpushx ${key} `, e);
            return { err: error_code_1.ErrorCode.RESULT_EXCEPTION };
        }
    }
    async rpop(key) {
        try {
            assert(key);
            const { err, value: len } = await this.llen(key);
            if (err) {
                return { err };
            }
            if (len === 0) {
                return { err: error_code_1.ErrorCode.RESULT_NOT_FOUND };
            }
            else {
                const { err: err2, value } = await this.lindex(key, len - 1);
                await this.db.exec(`DELETE FROM '${this.fullName}' WHERE name='${key}' AND field=${len - 1}`);
                return { err: error_code_1.ErrorCode.RESULT_OK, value };
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
            const { err, value: len } = await this.llen(key);
            if (err) {
                return { err };
            }
            if (len === 0 || index >= len) {
                return await this.lset(key, len, value);
            }
            else {
                for (let i = len - 1; i >= index; i--) {
                    await this.db.exec(`UPDATE '${this.fullName}' SET field=field+1 WHERE name='${key}' AND field = ${i}`);
                }
                return await this.lset(key, index, value);
            }
        }
        catch (e) {
            this.logger.error(`linsert ${key} ${index} `, e);
            return { err: error_code_1.ErrorCode.RESULT_EXCEPTION };
        }
    }
    async lremove(key, index) {
        try {
            assert(key);
            const { err, value: len } = await this.llen(key);
            if (err) {
                return { err };
            }
            if (len === 0) {
                return { err: error_code_1.ErrorCode.RESULT_NOT_FOUND };
            }
            else {
                const { err: err2, value } = await this.lindex(key, index);
                let sql = `DELETE FROM '${this.fullName}' WHERE name='${key}' AND field='${index}'`;
                // console.log('lremove', { sql });
                await this.db.exec(sql);
                for (let i = index + 1; i < len; i++) {
                    sql = `UPDATE '${this.fullName}' SET field=field-1 WHERE name='${key}' AND field = ${i}`;
                    // console.log({ sql });
                    await this.db.exec(sql);
                }
                return { err: error_code_1.ErrorCode.RESULT_OK, value };
            }
        }
        catch (e) {
            this.logger.error(`lremove ${key} `, e);
            return { err: error_code_1.ErrorCode.RESULT_EXCEPTION };
        }
    }
}
class SqliteStorageTransaction {
    constructor(db) {
        this.m_transcationDB = new TransactionDatabase(db.driver);
    }
    beginTransaction() {
        return new Promise((resolve, reject) => {
            this.m_transcationDB.beginTransaction((err, transcation) => {
                if (err) {
                    reject(err);
                }
                else {
                    this.m_transcation = transcation;
                    resolve(error_code_1.ErrorCode.RESULT_OK);
                }
            });
        });
    }
    commit() {
        return new Promise((resolve, reject) => {
            this.m_transcation.commit((err) => {
                if (err) {
                    reject(err);
                }
                else {
                    resolve(error_code_1.ErrorCode.RESULT_OK);
                }
            });
        });
    }
    rollback() {
        return new Promise((resolve, reject) => {
            this.m_transcation.rollback((err) => {
                if (err) {
                    reject(err);
                }
                else {
                    resolve(error_code_1.ErrorCode.RESULT_OK);
                }
            });
        });
    }
}
class SqliteReadableDatabase {
    constructor(name, db, logger) {
        this.name = name;
        this.logger = logger;
        this.m_db = db;
    }
    async getReadableKeyValue(name) {
        const fullName = storage_1.Storage.getKeyValueFullName(this.name, name);
        let tbl = new SqliteStorageKeyValue(this.m_db, fullName, this.logger);
        return { err: error_code_1.ErrorCode.RESULT_OK, kv: tbl };
    }
}
class SqliteReadWritableDatabase extends SqliteReadableDatabase {
    async createKeyValue(name) {
        let err = storage_1.Storage.checkTableName(name);
        if (err) {
            return { err };
        }
        const fullName = storage_1.Storage.getKeyValueFullName(this.name, name);
        // 先判断表是否存在
        let ret = await this.m_db.get(`SELECT COUNT(*) FROM sqlite_master where type='table' and name='${fullName}'`);
        if (ret[0] > 0) {
            err = error_code_1.ErrorCode.RESULT_ALREADY_EXIST;
        }
        else {
            err = error_code_1.ErrorCode.RESULT_OK;
            await this.m_db.exec(`CREATE TABLE IF NOT EXISTS  '${fullName}'\
            (name TEXT, field TEXT, value TEXT, unique(name, field))`);
        }
        let tbl = new SqliteStorageKeyValue(this.m_db, fullName, this.logger);
        return { err: error_code_1.ErrorCode.RESULT_OK, kv: tbl };
    }
    async getReadWritableKeyValue(name) {
        let tbl = new SqliteStorageKeyValue(this.m_db, storage_1.Storage.getKeyValueFullName(this.name, name), this.logger);
        return { err: error_code_1.ErrorCode.RESULT_OK, kv: tbl };
    }
}
class SqliteStorage extends storage_1.Storage {
    constructor() {
        super(...arguments);
        this.m_isInit = false;
    }
    _createLogger() {
        return new storage_1.JStorageLogger();
    }
    get isInit() {
        return this.m_isInit;
    }
    async init(readonly) {
        if (this.m_db) {
            return error_code_1.ErrorCode.RESULT_SKIPPED;
        }
        assert(!this.m_db);
        fs.ensureDirSync(path.dirname(this.m_filePath));
        let options = {};
        if (!readonly) {
            options.mode = sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE;
        }
        else {
            options.mode = sqlite3.OPEN_READONLY;
        }
        let err = error_code_1.ErrorCode.RESULT_OK;
        try {
            this.m_db = await sqlite.open(this.m_filePath, options);
        }
        catch (e) {
            err = error_code_1.ErrorCode.RESULT_EXCEPTION;
        }
        // await this.m_db.migrate({ force: 'latest', migrationsPath: path.join(__dirname, 'migrations') });
        if (!err) {
            this.m_isInit = true;
        }
        setImmediate(() => {
            this.m_eventEmitter.emit('init', err);
        });
        return err;
    }
    async uninit() {
        if (this.m_db) {
            await this.m_db.close();
            delete this.m_db;
        }
        return error_code_1.ErrorCode.RESULT_OK;
    }
    async messageDigest() {
        let buf = await fs.readFile(this.m_filePath);
        const sqliteHeaderSize = 100;
        if (buf.length < sqliteHeaderSize) {
            return { err: error_code_1.ErrorCode.RESULT_INVALID_FORMAT };
        }
        const content = Buffer.from(buf.buffer, sqliteHeaderSize, buf.length - sqliteHeaderSize);
        let hash = digest.hash256(content).toString('hex');
        return { err: error_code_1.ErrorCode.RESULT_OK, value: hash };
    }
    async getReadableDataBase(name) {
        let err = storage_1.Storage.checkDataBaseName(name);
        if (err) {
            return { err };
        }
        return { err: error_code_1.ErrorCode.RESULT_OK, value: new SqliteReadableDatabase(name, this.m_db, this.m_logger) };
    }
    async createDatabase(name) {
        let err = storage_1.Storage.checkDataBaseName(name);
        if (err) {
            return { err };
        }
        return { err: error_code_1.ErrorCode.RESULT_OK, value: new SqliteReadWritableDatabase(name, this.m_db, this.m_logger) };
    }
    async getReadWritableDatabase(name) {
        let err = storage_1.Storage.checkDataBaseName(name);
        if (err) {
            return { err };
        }
        return { err: error_code_1.ErrorCode.RESULT_OK, value: new SqliteReadWritableDatabase(name, this.m_db, this.m_logger) };
    }
    async beginTransaction() {
        assert(this.m_db);
        let transcation = new SqliteStorageTransaction(this.m_db);
        await transcation.beginTransaction();
        return { err: error_code_1.ErrorCode.RESULT_OK, value: transcation };
    }
    async toJsonStorage(storage) {
        let tableNames = new Map();
        try {
            const results = await this.m_db.all(`select name fromsqlite_master where type='table' order by name;`);
            for (const { name } of results) {
                const { dbName, kvName } = SqliteStorage.splitFullName(name);
                if (!tableNames.has(dbName)) {
                    tableNames.set(dbName, []);
                }
                tableNames.get(dbName).push(kvName);
            }
        }
        catch (e) {
            this.m_logger.error(`get all tables failed `, e);
            return { err: error_code_1.ErrorCode.RESULT_EXCEPTION };
        }
        let root = Object.create(null);
        for (let [dbName, kvNames] of tableNames.entries()) {
            let dbRoot = Object.create(null);
            root[dbName] = dbRoot;
            for (let kvName of kvNames) {
                let kvRoot = Object.create(null);
                dbRoot[kvName] = kvRoot;
                const tableName = SqliteStorage.getKeyValueFullName(dbName, kvName);
                try {
                    const elems = await this.m_db.all(`select * from ${tableName}`);
                    for (const elem of elems) {
                        if (util_1.isUndefined(elem.field)) {
                            kvRoot[elem.name] = serializable_1.fromStringifiable(JSON.parse(elem.value));
                        }
                        else {
                            const index = parseInt(elem.field);
                            if (isNaN(index)) {
                                if (util_1.isUndefined(kvRoot[elem.name])) {
                                    kvRoot[elem.name] = Object.create(null);
                                }
                                kvRoot[elem.name][elem.filed] = serializable_1.fromStringifiable(JSON.parse(elem.value));
                            }
                            else {
                                if (!util_1.isArray(kvRoot[elem.name])) {
                                    kvRoot[elem.name] = [];
                                }
                                let arr = kvRoot[elem.name];
                                if (arr.length > index) {
                                    arr[index] = serializable_1.fromStringifiable(JSON.parse(elem.value));
                                }
                                else {
                                    const offset = index - arr.length - 1;
                                    for (let ix = 0; ix < offset; ++ix) {
                                        arr.push(undefined);
                                    }
                                    arr.push(serializable_1.fromStringifiable(JSON.parse(elem.value)));
                                }
                            }
                        }
                    }
                }
                catch (e) {
                    this.m_logger.error(`database: ${dbName} kv: ${kvName} transfer error `, e);
                    return { err: error_code_1.ErrorCode.RESULT_EXCEPTION };
                }
            }
        }
        await storage.flush(root);
        return { err: error_code_1.ErrorCode.RESULT_OK };
    }
}
exports.SqliteStorage = SqliteStorage;
