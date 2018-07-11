'use strict';

const Base = require('../base/base.js');
const {Config, TOTAL_KEY} = require('./util.js');

const LOG_INFO = Base.BX_INFO;
const LOG_WARN = Base.BX_WARN;
const LOG_DEBUG = Base.BX_DEBUG;
const LOG_CHECK = Base.BX_CHECK;
const LOG_ASSERT = Base.BX_ASSERT;
const LOG_ERROR = Base.BX_ERROR;

const ValueTableConfig = Config.ValueTable;
const HashConfig = Config.Hash;

class LocalValueMgr {
    constructor({taskExecutor}) {
        // <tableName, table>
        this.m_tables = new Map();

        this.m_taskExecutor = taskExecutor;
    }

    saveValue(tableName, keyName, value) {
        let table = this.m_tables.get(tableName);
        if (!table) {
            table = new Map();
            this.m_tables.set(tableName, table);
        } else {
            let valueObj = table.get(keyName);
            if (valueObj) {
                valueObj.value = value;
                valueObj.updateTime = 0;
                return;
            }
        }

        table.set(keyName, {value, updateTime: 0});
    }

    deleteValue(tableName, keyName) {
        if (keyName === TOTAL_KEY) {
            this.m_tables.delete(tableName);
            return;
        }

        let table = this.m_tables.get(tableName);
        if (table) {
            if (table.delete(keyName) && table.size === 0) {
                this.m_tables.delete(tableName);
            }
        }
    }

    getValue(tableName, keyName) {
        if (keyName === TOTAL_KEY) {
            let table = this.m_tables.get(tableName);
            if (table) {
                let keyValues = new Map();
                table.forEach((valueObj, key) => keyValues.set(key, valueObj.value));
                return keyValues;
            }
            return null;
        }

        let table = this.m_tables.get(tableName);
        if (table) {
            let valueObj = table.get(keyName);
            if (valueObj) {
                return new Map([[keyName, valueObj.value]]);
            }
        }
        return null;
    }

    updateToRemote({outtimeMS = ValueTableConfig.ValueUpdateIntervalMS} = {}) {
        let now = Date.now();
        for (let [tableName, table] of this.m_tables) {
            let values = new Map();
            for (let [key, valueObj] of table) {
                if (now - valueObj.updateTime >= outtimeMS) {
                    valueObj.updateTime = now;
                    values.set(key, valueObj.value);
                }
            }

            if (values.size > 0) {
                this.m_taskExecutor.updateValue(tableName, values, {ttl: 1, isForward: false});
            }
        }
    }

    log() {
        for (let [tableName, table] of this.m_tables) {
            LOG_INFO(`Table(${tableName}) count(${table.size}):`);
            for (let [keyName, valueObj] of table) {
                LOG_INFO(`\t${keyName}\t${valueObj.value}`);
            }
        }
    }

}

module.exports = LocalValueMgr;