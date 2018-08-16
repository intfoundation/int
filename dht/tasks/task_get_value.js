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

class GetValueTask extends TouchNodeConvergenceTask {
    constructor(owner, tableName, keyName, flags, {ttl = 0, isForward = false, timeout = TaskConfig.TimeoutMS, excludePeerids = null} = {}, callback) {
        super(owner, {ttl, isForward, timeout, excludePeerids});

        this.m_tableName = tableName;
        this.m_keyName = keyName;
        this.m_flags = flags;

        this.m_values = null;
    }

    get tableName() {
        return this.m_tableName;
    }

    get keyName() {
        return this.m_keyName;
    }

    get flags() {
        return this.m_flags;
    }

    _processImpl(response, remotePeer) {
        LOG_INFO(`LOCALPEER:(${this.bucket.localPeer.peerid}:${this.servicePath}) remotePeer:${response.common.src.peerid} responsed GetValue(${this.m_tableName}:${this.m_keyName}:${this.m_flags})`);
        if (response.body.values) {
            if (response.body.r_nodes) {
                response.body.r_nodes.forEach(peerid => this.m_arrivePeeridSet.add(peerid));
            }
            this.m_arrivePeeridSet.add(response.src.peerid);

            this.m_values = new Map(response.body.values);
            this._onComplete(DHTResult.SUCCESS);
        } else {
            super._processImpl(response, remotePeer);
        }
    }

    _onCompleteImpl(result) {
        LOG_INFO(`LOCALPEER:(${this.bucket.localPeer.peerid}:${this.servicePath}) complete GetValue(count=${this.m_values? this.m_values.size : 0})`);
        this._callback(result, this.m_values, this.m_arrivePeeridSet);
    }

    _createPackage() {
        let cmdPackage = this.packageFactory.createPackage(DHTCommandType.FIND_VALUE_REQ);

        cmdPackage.body = {
            taskid: this.m_id,
            flags: this.m_flags,
            tableName: this.m_tableName,
            key: this.m_keyName,
        };
        return cmdPackage;
    }

    get _targetKey() {
        return this.m_tableName;
    }

    _stopImpl() {
    }
}

module.exports = GetValueTask;