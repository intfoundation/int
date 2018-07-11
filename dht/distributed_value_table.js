'use strict';

const Base = require('../base/base.js');
const {Config, HashDistance, TOTAL_KEY} = require('./util.js');

const LOG_INFO = Base.BX_INFO;
const LOG_WARN = Base.BX_WARN;
const LOG_DEBUG = Base.BX_DEBUG;
const LOG_CHECK = Base.BX_CHECK;
const LOG_ASSERT = Base.BX_ASSERT;
const LOG_ERROR = Base.BX_ERROR;

const ValueTableConfig = Config.ValueTable;
const HashConfig = Config.Hash;

class DistributedValueTableMgr {
    constructor({ TABLE_COUNT = ValueTableConfig.TableCount,
        TABLE_SIZE = ValueTableConfig.TableSize,
        TIMEOUT_MS = ValueTableConfig.ValueTimeoutMS } = {}) {

        this.TABLE_COUNT = TABLE_COUNT;
        this.TABLE_SIZE = TABLE_SIZE;
        this.TIMEOUT_MS = TIMEOUT_MS;

        // <tableName, table>
        this.m_tables = new Map();
        this.m_earlyUpdateTime = 0;
    }

    updateValue(tableName, keyName, value) {
        let table = this.m_tables.get(tableName);
        if (!table) {
            table = new DistributedValueTable();
            this.m_tables.set(tableName, table);
        }

        table.updateValue(keyName, value);
    }

    clearOuttimeValues() {
        let now = Date.now();
        if (now - this.m_earlyUpdateTime <= this.TIMEOUT_MS) {
            return;
        }

        this.m_earlyUpdateTime = now;
        if (this.m_tables.size > this.TABLE_COUNT) {
            let outtimeTableList = [];
            this.m_tables.forEach((table, tableName) => {
                    if (now - table.lastUpdateTime > this.TIMEOUT_MS) {
                        outtimeTableList.push(tableName);
                    }
                });
            outtimeTableList.forEach(tableName => this.m_tables.delete(tableName));
        }

        this.m_tables.forEach((table) => {
                if (now - table.earlyUpdateTime > this.TIMEOUT_MS) {
                    table.knockOut(this.TABLE_SIZE, this.TIMEOUT_MS);
                }

                if (table.earlyUpdateTime < this.m_earlyUpdateTime) {
                    this.m_earlyUpdateTime = table.earlyUpdateTime;
                }
            });
    }

    get tableCount() {
        return this.m_tables.size;
    }

    get valueCount() {
        let count = 0;
        this.m_tables.forEach(table => count += table.valueCount);
        return count;
    }

    findValue(tableName, keyName) {
        let table = this.m_tables.get(tableName);
        if (table) {
            return table.findValue(keyName);
        }
        return null;
    }
    
    findClosestValues(tableName, keyName, {count = ValueTableConfig.FindCloseKeyCount, maxDistance = HashDistance.MAX_HASH} = {}) {
        let table = this.m_tables.get(tableName);
        if (table) {
            return table.findClosestValues(keyName, {count, maxDistance});
        }
        return null;
    }

    forEachValue(valueProcess) {
        for (let [tableName, table] of this.m_tables) {
            for (let [keyName, valueObj] of table.values) {
                valueProcess(tableName, keyName, valueObj);
            }
        }
    }

    log() {
        for (let [tableName, table] of this.m_tables) {
            LOG_INFO(`Table(${tableName}) count(${table.values.size}):`);
            for (let [keyName, valueObj] of table.values) {
                LOG_INFO(`\t${keyName}\t${valueObj.value}`);
            }
        }
    }

}

class DistributedValueTable {
    constructor() {
        this.m_values = new Map();
        this.m_earlyUpdateTime = 0;
        this.m_lastUpdateTime = 0;
    }

    get values() {
        return this.m_values;
    }

    get valueCount() {
        return this.m_values.size;
    }

    get earlyUpdateTime() {
        if (this.m_earlyUpdateTime === 0) {
            let now = Date.now();
            this.m_earlyUpdateTime = now;
            this.m_values.forEach((valueObj, keyName) => {
                if (valueObj.updateTime < this.m_earlyUpdateTime) {
                    this.m_earlyUpdateTime = valueObj.updateTime;
                }
            });
        }

        return this.m_earlyUpdateTime;
    }

    get lastUpdateTime() {
        return this.m_lastUpdateTime;
    }

    updateValue(keyName, value) {
        let now = Date.now();
        let valueObj = this.m_values.get(keyName);
        if (!valueObj) {
            valueObj = {
                value: value,
                keyHash: HashDistance.checkHash(keyName),
                updateTime: now,
            };
            this.m_values.set(keyName, valueObj);
        } else {
            if (this.m_earlyUpdateTime === valueObj.updateTime) {
                this.m_earlyUpdateTime = this.earlyUpdateTime;
            }
            valueObj.value = value;
            valueObj.updateTime = now;
        }

        this.m_lastUpdateTime = now;
    }

    knockOut(timeoutMS) {
        let now = Date.now();
        this.m_earlyUpdateTime = now;
        // timeout
        let outtimeKeyList = [];
        this.m_values.forEach((valueObj, keyName) => {
                if (now - valueObj.updateTime > timeoutMS) {
                    outtimeKeyList.push(keyName);
                } else if (valueObj.updateTime < this.m_earlyUpdateTime) {
                    this.m_earlyUpdateTime = valueObj.updateTime;
                }
            });

        outtimeKeyList.forEach(keyName => this.m_values.delete(keyName));
    }

    findValue(keyName) {
        if (keyName === TOTAL_KEY) {
            let keyValues = new Map();
            this.m_values.forEach((valueObj, key) => keyValues.set(key, valueObj.value));
            return keyValues;
        }

        let valueObj = this.m_values.get(keyName);
        if (valueObj) {
            return new Map([[keyName, valueObj.value]]);
        }
        return null;
    }

    findClosestValues(keyName, {count = ValueTableConfig.FindCloseKeyCount, maxDistance = HashDistance.MAX_HASH} = {}) {
        LOG_ASSERT(count >= 0, `Try find negative(${count}) values.`);
        if (count < 0) {
            return new Map();
        }

        let hash = HashDistance.checkHash(keyName);
        let foundValueList = [];
        for (let [key, valueObj] of this.m_values) {
            let curValueDistance = HashDistance.calcDistanceByHash(valueObj.keyHash, hash);
            if (HashDistance.compareHash(curValueDistance, maxDistance) > 0) {
                continue;
            }

            let farthestValue = foundValueList.length > 0? foundValueList[foundValueList.length - 1] : null;
            if (foundValueList.length < count
                || HashDistance.compareHash(curValueDistance, HashDistance.calcDistanceByHash(farthestValue.valueObj.keyHash, hash)) < 0) {
                let done = false;
                for (let j = 0; j < foundValueList.length; j++) {
                    if (HashDistance.compareHash(curValueDistance, HashDistance.calcDistanceByHash(foundValueList[j].valueObj.keyHash, hash)) < 0) {
                        foundValueList.splice(j, 0, {valueObj, key: key});
                        done = true;
                        if (foundValueList.length > count) {
                            foundValueList.pop();
                        }
                        break;
                    }
                }
                if (!done) {
                    foundValueList.push({valueObj, key: key});
                }
            }
        }

        let foundValueTable = new Map();
        foundValueList.forEach(item => foundValueTable.set(item.key, item.valueObj.value));
        return foundValueTable;
    }
}

module.exports = DistributedValueTableMgr;