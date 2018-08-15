'use strict';

const Base = require('../../base/base.js');
const {Result: DHTResult, Config} = require('../util.js');

const LOG_INFO = Base.BX_INFO;
const LOG_WARN = Base.BX_WARN;
const LOG_DEBUG = Base.BX_DEBUG;
const LOG_CHECK = Base.BX_CHECK;
const LOG_ASSERT = Base.BX_ASSERT;
const LOG_ERROR = Base.BX_ERROR;

const TaskConfig = Config.Task;

class Task {
    constructor(owner, {timeout = TaskConfig.TimeoutMS, maxIdleTime = TaskConfig.MaxIdleTimeMS} = {}) {
        if (new.target === Task) {
            throw new Error('Task is a base class, it must be extended.');
        }

        if (!timeout) {
            timeout = TaskConfig.TimeoutMS;
        }
        this.m_owner = owner;
        this.m_id = owner.genTaskID();
        this.m_startTime = Date.now();
        this.m_deadline = this.m_startTime + timeout;
        this.m_lastActiveTime = Date.now();
        this.m_maxIdleTime = maxIdleTime;

        this.m_callbackList = [];
    }

    get id() {
        return this.m_id
    }

    get type() {
        return this.constructor.name;
    }

    get isComplete() {
        return this.m_isComplete;
    }

    start() {
        this._startImpl();
    }

    process(cmd, ...args) {
        this.m_lastActiveTime = Date.now();
        this._processImpl(cmd, ...args);
    }

    wakeUp() {
        let now = Date.now();

        if (now > this.m_deadline) {
            this._onComplete(DHTResult.TIMEOUT);
            return;
        }

        if (now - this.m_lastActiveTime > this.m_maxIdleTime) {
            this.m_lastActiveTime = now;
            this._retry();
        }
    }

    stop() {
        this._stopImpl();
        this._onComplete(DHTResult.STOPPED);
    }

    get bucket() {
        return this.m_owner.bucket;
    }

    get packageFactory() {
        return this.m_owner.packageFactory;
    }

    get packageSender() {
        return this.m_owner.packageSender;
    }

    get distributedValueTable() {
        return this.m_owner.distributedValueTable;
    }

    get servicePath() {
        return this.m_owner.servicePath;
    }

    addCallback(callback) {
        this.m_callbackList.push(callback);
    }

    _retry() {
        this._retryImpl();
    }

    _onComplete(result) {
        this.m_isComplete = true;
        this.m_owner.onTaskComplete(this);
        this._onCompleteImpl(result);
    }

    _callback(...args) {
        this.m_callbackList.forEach(callback => setImmediate(() => callback(...args)));
    }

    // override 子类必须明确重载下列函数以明确行为
    _startImpl() {
        throw new Error('Task._startImpl it must be override.');
    }

    _stopImpl() {
        throw new Error('Task._stopImpl it must be override.');
    }

    _processImpl() {
        throw new Error('Task._processImpl it must be override.');
    }

    _retryImpl() {
        throw new Error('Task._retryImpl it must be override.');
    }

    _onCompleteImpl(result) {
        throw new Error('Task._onCompleteImpl it must be override.');
    }
}

module.exports = Task;