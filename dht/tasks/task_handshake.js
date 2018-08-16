'use strict';

const Base = require('../../base/base.js');
const {Result: DHTResult, Config} = require('../util.js');
const {Peer} = require('../peer.js');
const Task = require('./task.js');
const DHTPackage = require('../packages/package.js');
const DHTCommandType = DHTPackage.CommandType;
const {ResendControlor} = require('../package_sender.js');

const LOG_INFO = Base.BX_INFO;
const LOG_WARN = Base.BX_WARN;
const LOG_DEBUG = Base.BX_DEBUG;
const LOG_CHECK = Base.BX_CHECK;
const LOG_ASSERT = Base.BX_ASSERT;
const LOG_ERROR = Base.BX_ERROR;

const TaskConfig = Config.Task;

function handshakeTaskID(srcPeerid, taskid) {
    return `@src:${srcPeerid}@taskid:${taskid}`;
}

function isEmptyEPList(eplist) {
    return !eplist || eplist.length == 0;
}

// isHoleImmediately = false表示先尝试自己向对方发起握手，几次失败后再试着通过中介peer进行打洞；否则两者同时进行，以最快速度建立连接
// passive = true表示优先通过中介让对方反向接入，一段时间后才主动向对方发起握手，可用于在实时性要求不高时检测本地网络是否能被新peer主动连接
class HandshakeSourceTask extends Task {
    constructor(owner, targetPeer, agencyPeer, isHoleImmediately, passive) {
        super(owner, {timeout: TaskConfig.HandshakeTimeoutMS, maxIdleTime: TaskConfig.MaxIdleTimeMS});

        this.m_id = handshakeTaskID(this.bucket.localPeer.peerid, this.m_id);
        this.m_handshakePackage = null;
        this.m_handshakeResender = null;
        this.m_targetPeer = targetPeer;
        this.m_handshakeTimes = 0;
        this.m_holePackage = null;
        this.m_holeResender = null;
        this.m_agencyPeer = agencyPeer;
        this.m_isHoleImmediately = isHoleImmediately;
        this.m_isPassive = passive;
    }

    get peerid() {
        return this.m_targetPeer.peerid;
    }

    _startImpl() {
        if (this._isConnected()) {
            setImmediate(this._onComplete(DHTResult.SUCCESS));
            return;
        }

        this.m_handshakePackage = this.packageFactory.createPackage(DHTPackage.CommandType.HANDSHAKE_REQ);
        this.m_handshakePackage.body = {taskid: this.id};
        this.m_handshakeResender = new ResendControlor(this.m_targetPeer, this.m_handshakePackage, this.packageSender, super.m_maxIdleTime, 5);

        if (!isEmptyEPList(this.m_targetPeer.eplist) && !this.m_isPassive) {
            this.m_handshakeResender.send();
            this.m_handshakeTimes = 1;
        }
        
        // 本地有监听地址时才可能被反向穿透
        let localEPlist = this.bucket.localPeer.eplist;
        if (localEPlist && localEPlist.length > 0) {
            if (this.m_isHoleImmediately || this.m_isPassive || isEmptyEPList(this.m_targetPeer.eplist)) {
                this.m_holePackage = this.packageFactory.createPackage(DHTPackage.CommandType.HOLE_CALL_REQ);
                this.m_holePackage.body = {
                    taskid: this.id,
                    target: {peerid: this.m_targetPeer.peerid, eplist: this.m_targetPeer.eplist},
                };
                this.m_holeResender = new ResendControlor(this.m_agencyPeer, this.m_holePackage, super.m_maxIdleTime, 5);
                this.m_holeResender.send();
            }
        }
    }

    _processImpl(response, remotePeer) {
        LOG_INFO(`LOCALPEER:(${this.bucket.localPeer.peerid}:${this.servicePath}) remotePeer:${response.common.src.peerid} responsed HandshakeSourceTask(${this.m_targetPeer.peerid})`);
        if (this._isConnected()
            || response.cmdType === DHTPackage.CommandType.HANDSHAKE_REQ
            || response.cmdType === DHTPackage.CommandType.HANDSHAKE_RESP) {
            
            let isIncomingPeer = (response.cmdType === DHTPackage.CommandType.HANDSHAKE_REQ);
            setImmediate(() => this._onComplete(DHTResult.SUCCESS, isIncomingPeer));
            return;
        }

        if (response.cmdType === DHTPackage.CommandType.HOLE_CALL_RESP) {
            this.m_agencyPeer = null; // 打洞中介已经收到包，停止重发
            if (response.body.target && response.body.target.peerid === this.m_targetPeer.peerid
                && isEmptyEPList(response.body.target.eplist)) {
                if (isEmptyEPList(this.m_targetPeer.eplist)) {
                    setImmediate(() => this._onComplete(DHTResult.FAILED));
                }
            } else {
                this.m_targetPeer.eplist = Peer.unionEplist(this.m_targetPeer.eplist, response.body.target.eplist);
            }
        }
    }

    _retryImpl() {
        if (this._isConnected()) {
            setImmediate(() => this._onComplete(DHTResult.SUCCESS));
            return;
        }
        let localEPlist = this.bucket.localPeer.eplist;
        if (localEPlist && localEPlist.length > 0) {
            if ((this.m_isHoleImmediately || this.m_isPassive || this.m_handshakeTimes >= 2) && this.m_agencyPeer) {
                if (!this.m_holePackage) {
                    this.m_holePackage = this.packageFactory.createPackage(DHTPackage.CommandType.HOLE_CALL_REQ);
                    this.m_holePackage.body = {
                        taskid: this.id,
                        target: {peerid: this.m_targetPeer.peerid, eplist: this.m_targetPeer.eplist},
                    };
                    this.m_holeResender = new ResendControlor(this.m_agencyPeer, this.m_holePackage, super.m_maxIdleTime, 5);
                }
                this.m_holeResender.send();
            }
        }

        if (!isEmptyEPList(this.m_targetPeer.eplist) && (!this.m_isPassive || this.m_handshakeTimes > 1)) {
            this.m_handshakeResender.send();
        }
        this.m_handshakeTimes++; // 无论是否真的send都计数一次，以决定何时开始打洞
    }

    _onCompleteImpl(result) {
        LOG_INFO(`LOCALPEER:(${this.bucket.localPeer.peerid}:${this.servicePath}) HandshakeSourceTask(to:${this.m_targetPeer.peerid}) complete.`);
    }

    _isConnected() {
        let bucket = this.bucket;
        let peer = bucket.findPeer(this.m_targetPeer.peerid);
        return peer && !peer.isTimeout(bucket.TIMEOUT_MS);
    }

    _stopImpl() {
    }
}

class HandshakeAgencyTask extends Task {
    constructor(owner, srcPeer, targetPeer, taskid) {
        super(owner, {timeout: TaskConfig.HandshakeTimeoutMS, maxIdleTime: TaskConfig.MaxIdleTimeMS});

        this.m_id = taskid;
        this.m_holePackage = null;
        this.m_holeResender = null;
        this.m_srcPeer = srcPeer;
        this.m_targetPeer = targetPeer;
        this.m_isDone = false;
    }

    get srcPeerid() {
        return this.m_srcPeer.peerid;
    }

    get targetPeerid() {
        return this.m_targetPeer.peerid;
    }

    _startImpl() {
        this.m_holePackage = this.packageFactory.createPackage(DHTPackage.CommandType.HOLE_CALLED_REQ);
        this.m_holePackage.body = {
            taskid: this.id,
            src: {peerid: this.m_srcPeer.peerid, eplist: this.m_srcPeer.eplist},
        };
        this.m_holeResender = new ResendControlor(this.m_targetPeer, this.m_holePackage, this.packageSender, super.m_maxIdleTime, 5);
        this.m_holeResender.send();
    }

    _processImpl(response, remotePeer) {
        LOG_INFO(`LOCALPEER:(${this.bucket.localPeer.peerid}:${this.servicePath}) remotePeer:${response.common.src.peerid} responsed HandshakeAgencyTask(${this.m_srcPeer.peerid}=>${this.m_targetPeer.peerid})`);

        if (response.cmdType === DHTPackage.CommandType.HOLE_CALLED_RESP) {
            // 收到响应包后只标记一下，协助打洞任务不需要任何结果，只等到超时就好了，后续有源peer发来的重发包直接忽略；
            // 如果这里立即完成，无法识别后续重发包
            this.m_isDone = true;
        }
    }

    _retryImpl() {
        if (this.m_isDone) {
            return;
        }

        this.m_holeResender.send();
    }

    _onCompleteImpl(result) {
        LOG_INFO(`LOCALPEER:(${this.bucket.localPeer.peerid}:${this.servicePath}) HandshakeAgencyTask(${this.m_srcPeer.peerid}=>${this.m_targetPeer.peerid}) complete.`);
    }

    _stopImpl() {
    }
}

class HandshakeTargetTask extends Task {
    constructor(owner, srcPeer, taskid) {
        super(owner, {timeout: TaskConfig.HandshakeTimeoutMS, maxIdleTime: TaskConfig.MaxIdleTimeMS});

        this.m_id = taskid;
        this.m_handshakePackage = null;
        this.m_handshakeResender = null;
        this.m_srcPeer = srcPeer;
    }

    get peerid() {
        return this.m_srcPeer.peerid;
    }

    _startImpl() {
        // 打洞的目的是要src能连接上target，target是否能连接上src不能作为成功打洞的标准
        // if (this._isConnected()) {
        //     setImmediate(() => this._onComplete(DHTResult.SUCCESS));
        //     return;
        // }

        this.m_handshakePackage = this.packageFactory.createPackage(DHTPackage.CommandType.HANDSHAKE_REQ);
        this.m_handshakePackage.body = {taskid: this.id};

        this.m_handshakeResender = new ResendControlor(this.m_srcPeer, this.m_handshakePackage, this.packageSender, super.m_maxIdleTime, 5);
        this.m_handshakeResender.send();
    }

    _processImpl(response, remotePeer) {
        LOG_INFO(`LOCALPEER:(${this.bucket.localPeer.peerid}:${this.servicePath}) remotePeer:${response.common.src.peerid} responsed HandshakeTargetTask(${this.m_srcPeer.peerid})`);
        
        // 对方发来握手包，说明对方能连接上，可以结束了
        if (response.cmdType === DHTPackage.CommandType.HANDSHAKE_REQ
            || response.cmdType === DHTPackage.CommandType.HANDSHAKE_RESP) {
            setImmediate(() => this._onComplete(DHTResult.SUCCESS));
            return;
        }
    }

    _retryImpl() {
        this.m_handshakeResender.send();
    }

    _onCompleteImpl(result) {
        LOG_INFO(`LOCALPEER:(${this.bucket.localPeer.peerid}:${this.servicePath}) HandshakeTargetTask(to:${this.m_srcPeer.peerid}) complete.`);
    }

    _stopImpl() {
    }
}

module.exports.Source = HandshakeSourceTask;
module.exports.Agency = HandshakeAgencyTask;
module.exports.Target = HandshakeTargetTask;
