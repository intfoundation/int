'use strict';

const Base = require('../../base/base.js');
const {Result: DHTResult, Config} = require('../util.js');
const {BroadcastNodeTask} = require('./task_touch_node_recursion.js');
const DHTPackage = require('../packages/package.js');
const DHTCommandType = DHTPackage.CommandType;

const LOG_TRACE = Base.BX_TRACE;
const LOG_INFO = Base.BX_INFO;
const LOG_WARN = Base.BX_WARN;
const LOG_DEBUG = Base.BX_DEBUG;
const LOG_CHECK = Base.BX_CHECK;
const LOG_ASSERT = Base.BX_ASSERT;
const LOG_ERROR = Base.BX_ERROR;

const SaveValueConfig = Config.SaveValue;
const TaskConfig = Config.Task;

class BroadcastEventTask extends BroadcastNodeTask {
    constructor(owner, eventName, params, arrivePeerCount, sourcePeerid, {ttl = 0, isForward = false, timeout = TaskConfig.TimeoutMS, excludePeerids = null} = {}, callback) {
        super(owner, arrivePeerCount, {ttl, isForward, timeout, excludePeerids});

        this.m_eventName = eventName;
        this.m_params = params;
        this.m_sourcePeerid = sourcePeerid;
    }

    _processImpl(response, remotePeer) {
        LOG_INFO(`LOCALPEER:(${this.bucket.localPeer.peerid}:${this.servicePath}) remotePeer:${response.common.src.peerid} responsed broadcast event(${this.m_eventName}:${this.m_params}), servicePath:${response.servicePath}`);
        if (this.m_arrivePeeridSet.size >= this.m_arrivePeerCount) {
            if (response.body.r_nodes) {
                response.body.r_nodes.forEach(peerid => this.m_arrivePeeridSet.add(peerid));
            }
            this.m_arrivePeeridSet.add(response.common.src.peerid);

            this._onComplete(DHTResult.SUCCESS);
        } else {
            super._processImpl(response, remotePeer);
        }
    }

    _onCompleteImpl(result) {
        LOG_INFO(`LOCALPEER:(${this.bucket.localPeer.peerid}:${this.servicePath}) broadcast event(${this.m_eventName}:${this.m_params}), arrived ${this.m_arrivePeeridSet.size} peers`);
        this._callback(result, this.m_arrivePeeridSet);
    }

    _createPackage() {
        let cmdPackage = this.packageFactory.createPackage(DHTCommandType.BROADCAST_EVENT_REQ);

        cmdPackage.body = {
            taskid: this.m_id,
            event: this.m_eventName,
            source: this.m_sourcePeerid,
        };

        if (this.m_params !== undefined && this.m_params !== null) {
            cmdPackage.body.params = this.m_params;
        }
        return cmdPackage;
    }

    _stopImpl() {
    }
}

module.exports = BroadcastEventTask;