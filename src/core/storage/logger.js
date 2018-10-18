"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
class LoggedStorage {
    constructor(storage, logger) {
        this.m_storage = storage;
        this.m_logger = logger;
        this.m_logger.init();
        this._wrapStorage();
    }
    get logger() {
        return this.m_logger;
    }
    _wrapStorage() {
        let storage = this.m_storage;
        {
            let proto = storage.beginTransaction;
            storage.beginTransaction = async () => {
                let ltr = await this.m_logger.beginTransaction();
                await ltr.value.beginTransaction();
                let btr = await proto.bind(storage)();
                this._wrapTransaction(btr.value, ltr.value);
                return btr;
            };
        }
        {
            let proto = storage.getReadWritableDatabase;
            storage.getReadWritableDatabase = async (name) => {
                let ltr = await this.m_logger.getReadWritableDatabase(name);
                let dbr = await proto.bind(storage)(name);
                this._wrapDatabase(dbr.value, ltr.value);
                return dbr;
            };
        }
        {
            let proto = storage.createDatabase;
            storage.createDatabase = async (name) => {
                let ltr = await this.m_logger.createDatabase(name);
                let dbr = await proto.bind(storage)(name);
                this._wrapDatabase(dbr.value, ltr.value);
                return dbr;
            };
        }
    }
    _wrapDatabase(database, logger) {
        {
            let proto = database.getReadWritableKeyValue;
            database.getReadWritableKeyValue = async (name) => {
                let ltr = await logger.getReadWritableKeyValue(name);
                let btr = await proto.bind(database)(name);
                this._wrapKeyvalue(btr.kv, ltr.kv);
                return btr;
            };
        }
        {
            let proto = database.createKeyValue;
            database.createKeyValue = async (name) => {
                let ltr = await logger.createKeyValue(name);
                let btr = await proto.bind(database)(name);
                this._wrapKeyvalue(btr.kv, ltr.kv);
                return btr;
            };
        }
    }
    _wrapTransaction(transaction, logger) {
        {
            let proto = transaction.commit;
            transaction.commit = async () => {
                logger.commit();
                return await proto.bind(transaction)();
            };
        }
        {
            let proto = transaction.rollback;
            transaction.rollback = async () => {
                logger.rollback();
                return await proto.bind(transaction)();
            };
        }
    }
    _wrapKeyvalue(kv, logger) {
        {
            let proto = kv.set;
            kv.set = async (key, value) => {
                await logger.set(key, value);
                return await proto.bind(kv)(key, value);
            };
        }
        {
            let proto = kv.hset;
            kv.hset = async (key, field, value) => {
                await logger.hset(key, field, value);
                return await proto.bind(kv)(key, field, value);
            };
        }
        {
            let proto = kv.hmset;
            kv.hmset = async (key, fields, values) => {
                await logger.hmset(key, fields, values);
                return await proto.bind(kv)(key, fields, values);
            };
        }
        {
            let proto = kv.hclean;
            kv.hclean = async (key) => {
                await logger.hclean(key);
                return await proto.bind(kv)(key);
            };
        }
        {
            let proto = kv.lset;
            kv.lset = async (key, index, value) => {
                await logger.lset(key, index, value);
                return await proto.bind(kv)(key, index, value);
            };
        }
        {
            let proto = kv.lpush;
            kv.lpush = async (key, value) => {
                await logger.lpush(key, value);
                return await proto.bind(kv)(key, value);
            };
        }
        {
            let proto = kv.lpushx;
            kv.lpushx = async (key, value) => {
                await logger.lpushx(key, value);
                return await proto.bind(kv)(key, value);
            };
        }
        {
            let proto = kv.lpop;
            kv.lpop = async (key) => {
                await logger.lpop(key);
                return await proto.bind(kv)(key);
            };
        }
        {
            let proto = kv.rpush;
            kv.rpush = async (key, value) => {
                await logger.rpush(key, value);
                return await proto.bind(kv)(key, value);
            };
        }
        {
            let proto = kv.rpushx;
            kv.rpushx = async (key, value) => {
                await logger.rpushx(key, value);
                return await proto.bind(kv)(key, value);
            };
        }
        {
            let proto = kv.rpop;
            kv.rpop = async (key) => {
                await logger.rpop(key);
                return await proto.bind(kv)(key);
            };
        }
        {
            let proto = kv.linsert;
            kv.linsert = async (key, index, value) => {
                await logger.linsert(key, index, value);
                return await proto.bind(kv)(key, index, value);
            };
        }
        {
            let proto = kv.lremove;
            kv.lremove = async (key, index) => {
                await logger.lremove(key, index);
                return await proto.bind(kv)(key, index);
            };
        }
    }
}
exports.LoggedStorage = LoggedStorage;
