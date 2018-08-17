'use strict';

const Base = require('../../base/base.js');
const {Result: DHTResult, Config} = require('../util.js');
const DestributedValueTable = require('../distributed_value_table.js');
const {TouchNodeConvergenceTask} = require('./task_touch_node_recursion.js');
const DHTPackage = require('../packages/package.js');
const DHTCommandType = DHTPackage.CommandType;

const LOG_INFO = Base.BX_INFO;
const LOG_WARN = Base.BX_WARN;
const LOG_DEBUG = Base.BX_DEBUG;
const LOG_CHECK = Base.BX_CHECK;
const LOG_ASSERT = Base.BX_ASSERT;
const LOG_ERROR = Base.BX_ERROR;

const SaveValueConfig = Config.SaveValue;
const TaskConfig = Config.Task;

class SaveValueTask extends TouchNodeConvergenceTask {
    constructor(owner, tableName, keyValueMap, {ttl = 0, isForward = false, timeout = TaskConfig.TimeoutMS, excludePeerids = null} = {}) {
        super(owner, {ttl, isForward, timeout, excludePeerids});
        this.m_tableName = tableName;
        this.m_keyValueMap = keyValueMap;

        this.m_package = null;
    }

    get tableName() {
        return this.m_tableName;
    }

    addKeyValue(key, value) {
        this.m_keyValueMap.set(key, value);
    }

    rebuildPackage() {
        this.m_package = this._createPackage();
        if (this.servicePath && this.servicePath.length > 0) {
            this.m_package.body.servicePath = this.servicePath;
        }
    }

    _processImpl(response, remotePeer) {
        LOG_INFO(`LOCALPEER:(${this.bucket.localPeer.peerid}:${this.servicePath}) SaveValue (${this.m_tableName}) to ${remotePeer.peerid}`);
        super._processImpl(response, remotePeer);
    }

    _onCompleteImpl(result) {
        LOG_INFO(`LOCALPEER:(${this.bucket.localPeer.peerid}:${this.servicePath}) SaveValue complete(${this.m_tableName})`);
        this._callback(result, this.m_arrivePeeridSet);
    }

    _createPackage() {
        let cmdPackage = this.packageFactory.createPackage(DHTCommandType.UPDATE_VALUE_REQ);

        cmdPackage.body = {
            taskid: this.m_id,
            tableName: this.m_tableName,
            values: [...this.m_keyValueMap],
        };
        return cmdPackage;
    }

    get _targetKey() {
        return this.m_tableName;
    }

    _stopImpl() {
    }

    get _isExcludeLocalPeer() {
        return false;
    }
}

module.exports = SaveValueTask;