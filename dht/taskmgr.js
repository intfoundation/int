'use strict';

const Base = require('../base/base.js');
const {Result: DHTResult, Config, SequenceIncreaseGenerator} = require('./util.js');
const Task = require('./tasks/task.js');
const FindPeerTask = require('./tasks/task_find_peer.js');
const SaveValueTask = require('./tasks/task_save_value.js');
const GetValueTask = require('./tasks/task_get_value.js');
const BroadcastEventTask = require('./tasks/task_broadcast_event.js');
const SplitePackageTask = require('./tasks/task_split_package.js');
const HandshakeTask = require('./tasks/task_handshake.js');

const LOG_INFO = Base.BX_INFO;
const LOG_WARN = Base.BX_WARN;
const LOG_DEBUG = Base.BX_DEBUG;
const LOG_CHECK = Base.BX_CHECK;
const LOG_ASSERT = Base.BX_ASSERT;
const LOG_ERROR = Base.BX_ERROR;

const TaskConfig = Config.Task;

class TaskExecutor {
    constructor({taskMgr, bucket, packageSender, packageFactory, distributedValueTable}) {
        this.m_bucket = bucket;
        this.m_packageSender = packageSender;
        this.m_packageFactory = packageFactory;
        this.m_distributedValueTable = distributedValueTable;
        this.m_taskMgr = taskMgr;
        this.m_servicePath = '';
    }

    findPeer(peerid, callback = null) {
        for (let [taskid, task] of this.m_taskMgr.m_taskMap) {
            if (task.type === 'FindPeerTask'
                && task.peerid === peerid
                && task.servicePath == this.m_servicePath
                && !task.isComplete) {
                    task.addCallback(callback);
                    return;
            }
        }

        let newTask = new FindPeerTask(this, peerid);
        if (callback) {
            newTask.addCallback(callback);
        }
        this.m_taskMgr._run(newTask);
    }

    updateValue(tableName, keyValues, {ttl = 0, isForward = false, timeout = TaskConfig.TimeoutMS, excludePeerids = null} = {}, callback = null) {
        for (let [taskid, task] of this.m_taskMgr.m_taskMap) {
            if (task.type === 'SaveValueTask'
                && task.tableName === tableName
                && task.servicePath == this.m_servicePath
                && !task.isComplete) {
                    keyValues.forEach((v, k) => task.addKeyValue(k, v));
                    task.rebuildPackage();
                    return;
            }
        }

        let newTask = new SaveValueTask(this, tableName, keyValues, {ttl, isForward, timeout, excludePeerids});
        if (callback) {
            newTask.addCallback(callback);
        }
        this.m_taskMgr._run(newTask);
    }

    getValue(tableName, keyName, flags, {ttl = 0, isForward = false, timeout = TaskConfig.TimeoutMS, excludePeerids = null} = {}, callback) {
        for (let [taskid, task] of this.m_taskMgr.m_taskMap) {
            if (task.type === 'GetValueTask'
                && task.tableName === tableName
                && task.keyName === keyName
                && task.flags === flags
                && task.servicePath == this.m_servicePath
                && !task.isComplete) {
                    task.addCallback(callback);
                    return;
            }
        }

        let newTask = new GetValueTask(this, tableName, keyName, flags, {ttl, isForward, timeout, excludePeerids});
        if (callback) {
            newTask.addCallback(callback);
        }
        this.m_taskMgr._run(newTask);
    }

    emitBroadcastEvent(eventName, params, arriveNodeCount, sourcePeerid, {ttl = 0, isForward = false, timeout = TaskConfig.TimeoutMS, excludePeerids = null} = {}, callback) {
        // LOG_INFO(`BROADCAST: servicePath: ${this.servicePath}: eventName: ${eventName}`);
        let newTask = new BroadcastEventTask(this, eventName, params, arriveNodeCount, sourcePeerid, {ttl, isForward, timeout, excludePeerids});
        if (callback) {
            newTask.addCallback(callback);
        }
        this.m_taskMgr._run(newTask);
    }

    splitPackage(cmdPackage, peer) {
        let newTask = new SplitePackageTask(this, cmdPackage, peer);
        this.m_taskMgr._run(newTask);
    }

    // 主动发起握手
    handshakeSource(targetPeer, agencyPeer, isHoleImmediately, passive) {
        for (let [taskid, task] of this.m_taskMgr.m_taskMap) {
            if (task.type === 'HandshakeSourceTask'
                && task.peerid === targetPeer.peerid) {
                    return;
            }
        }

        let bucket = this.bucket;
        let peer = bucket.findPeer(targetPeer.peerid);
        if (peer && !peer.isTimeout(bucket.TIMEOUT_MS)) {
            return;
        }

        let newTask = new HandshakeTask.Source(this, targetPeer, agencyPeer, isHoleImmediately, passive);
        this.m_taskMgr._run(newTask);
    }

    // 协助握手
    handshakeAgency(srcPeer, targetPeer, taskid) {
        if (this.m_taskMgr.m_taskMap.get(taskid)) {
            return;
        }

        let newTask = new HandshakeTask.Agency(this, srcPeer, targetPeer, taskid);
        this.m_taskMgr._run(newTask);
    }

    // 被动握手
    handshakeTarget(srcPeer, taskid) {
        if (this.m_taskMgr.m_taskMap.get(taskid)) {
            return;
        }

        let newTask = new HandshakeTask.Target(this, srcPeer, taskid);
        this.m_taskMgr._run(newTask);
    }

    get bucket() {
        return this.m_bucket;
    }

    get packageFactory() {
        return this.m_packageFactory;
    }

    get packageSender() {
        return this.m_packageSender;
    }

    get distributedValueTable() {
        return this.m_distributedValueTable;
    }

    get taskMgr() {
        return this.m_taskMgr;
    }

    get servicePath() {
        return this.m_servicePath;
    }

    set servicePath(path) {
        this.m_servicePath = path;
    }

    genTaskID() {
        return this.m_taskMgr._genTaskID();
    }

    onTaskComplete(task) {
        this.m_taskMgr._onTaskComplete(task);
    }
}

class TaskMgr {
    constructor() {
        this.m_idGen = new SequenceIncreaseGenerator(TaskConfig.MinTaskID, TaskConfig.MaxTaskID);
        this.m_taskMap = new Map();
        this.m_completeTaskIDList = [];
    }

    createTaskExecutor({bucket, packageSender, packageFactory, distributedValueTable}) {
        return new TaskExecutor({taskMgr: this, bucket, packageSender, packageFactory, distributedValueTable});
    }

    getTaskByID(taskID) {
        let task = this.m_taskMap.get(taskID);
        if (task && !task.isComplete) {
            return task;
        }
        return null;
    }

    wakeUpAllTask() {
        for (let taskID of this.m_completeTaskIDList) {
            this.m_taskMap.delete(taskID);
        }
        this.m_completeTaskIDList.length = 0;

        this.m_taskMap.forEach(task => task.wakeUp());
    }

    _genTaskID() {
        let taskID = this.m_idGen.genSeq();

        if (this.m_taskMap.has(taskID)) {
            return this._genTaskID();
        }
        return taskID;
    }

    _run(task) {
        this.m_taskMap.set(task.id, task);
        task.start();
    }

    _onTaskComplete(task) {
        // 可能taskMap正在遍历，尽量不直接修改其中内容
        this.m_completeTaskIDList.push(task.id);
    }
}

module.exports = TaskMgr;