'use strict';

const Base = require('../../base/base.js');
const {Result: DHTResult, Config} = require('../util.js');
const Task = require('./task.js');
const {ResendControlor} = require('../package_sender.js');

const TaskConfig = Config.Task;

const LOG_INFO = Base.BX_INFO;
const LOG_WARN = Base.BX_WARN;
const LOG_DEBUG = Base.BX_DEBUG;
const LOG_CHECK = Base.BX_CHECK;
const LOG_ASSERT = Base.BX_ASSERT;
const LOG_ERROR = Base.BX_ERROR;

// <TODO>
// 1.控制每个周期发包总量
class TouchNodeTask extends Task {
    constructor(owner, {ttl = 0, isForward = false, timeout = TaskConfig.TimeoutMS, excludePeerids = null} = {}) {
        if (new.target === TouchNodeTask) {
            throw new Error('TouchNodeTask is a base frame, it must be extended.');
        }
        super(owner, {timeout});

        this.m_requestPeeridSet = new Set();
        this.m_pendingPeerList = new Map();

        this.m_ttl = ttl;
        this.m_isForward = isForward;
        this.m_package = null;
        this.m_excludePeerids = new Set([...(excludePeerids || [])]);
        this.m_arrivePeeridSet = new Set();
    }

    _startImpl() {
        this.m_package = this._createPackage();
        if (this.servicePath && this.servicePath.length > 0) {
            this.m_package.body.servicePath = this.servicePath;
        }

        this.m_package.common.ttl = this.m_ttl;
        
        let peerList = this._getInitTargetNodes();
        if (peerList.length === 0) {
            this._onComplete(DHTResult.FAILED);
            return;
        } else if (this._isExcludeLocalPeer) {
            let localPeer = this.bucket.localPeer;
            for (let i = 0; i < peerList.length; i++) {
                if (peerList[i].peerid === localPeer.peerid) {
                    peerList.splice(i, 1);
                    break;
                }
            }
        }

        for (let peer of peerList) {
            this._sendPackage(peer);
        }
    }

    _processImpl(response, remotePeer) {
        let arrivedPeerCount = this.m_arrivePeeridSet.size;

        if (response.body.r_nodes) {
            response.body.r_nodes.forEach(peerid => {
                this.m_arrivePeeridSet.add(peerid);
                this.m_requestPeeridSet.add(peerid);
                this.m_pendingPeerList.delete(peerid);
            });
        }

        this.m_arrivePeeridSet.add(response.src.peerid);
        this.m_pendingPeerList.delete(response.common.src.peerid);

        if (this.m_arrivePeeridSet.size != arrivedPeerCount && this.m_package.body) {
            let eNodes = null;
            if (this.m_excludePeerids.size > 0) {
                eNodes = new Set([...this.m_arrivePeeridSet, ...this.m_excludePeerids]);
            } else {
                eNodes = this.m_arrivePeeridSet;
            }
            this.m_package.body.e_nodes = [...eNodes];
        }

        if (response.body.n_nodes) {
            let localPeer = this.bucket.localPeer;
            for (let peer of response.body.n_nodes) {
                if (!this._isExcludeLocalPeer || peer.peerid != localPeer.peerid) {
                    this._sendPackage({peerid: peer.id, eplist: peer.eplist}, remotePeer);
                }
            }
        }

        if (this.m_pendingPeerList.size === 0) {
            this._onComplete(DHTResult.SUCCESS);
            return;
        }
    }

    _retryImpl() {
        let outtimePeers = [];
        for (let [peerid, peer] of this.m_pendingPeerList) {
            if (peer.tryTimes < TaskConfig.tryTimes && !peer.resender.isTimeout()) {
                peer.tryTimes++; // 不能依赖resend的timeout，可能会因为没有得到对方的eplist一直不触发timeout
                if (peer.peer.eplist.length > 0) {
                    peer.resender.send();
                }

                if (peer.agencyPeer) {
                    this.m_owner.handshakeSource(peer.peer, peer.agencyPeer, true);
                }
            } else {
                outtimePeers.push(peerid);
            }
        }

        outtimePeers.forEach(peerid => this.m_pendingPeerList.delete(peerid));

        if (this.m_pendingPeerList.size === 0) {
            this._onComplete(DHTResult.SUCCESS);
            return;
        }
    }

    _sendPackage(peer, agencyPeer) {
        if (this.m_ttl > 0) {
            // 对方收到包后需要转发处理，超时时间应该比本地任务短，否则可能本地任务超时结束还收不到对方的结果；
            // 1500ms作为对方超时判定和网络传输的冗余
            this.m_package.body.timeout = this.m_deadline - Date.now() - 1500;
            if (this.m_package.body.timeout <= 0) {
                delete this.m_package.body.timeout;
                this.m_ttl = 0;
                this.m_package.common.ttl = 0;
            }
        }

        if (!this.m_requestPeeridSet.has(peer.peerid)
            && !this.m_excludePeerids.has(peer.peerid)) {

            let peerEx = {
                peer,
                tryTimes: 1,
                agencyPeer,
                resender: new ResendControlor(peer, this.m_package, this.packageSender, TaskConfig.MaxIdleTimeMS, TaskConfig.TryTimes),
            };
            this.m_pendingPeerList.set(peer.peerid, peerEx);
            this.m_requestPeeridSet.add(peer.peerid);
            if (peer.eplist.length === 0 && agencyPeer) {
                this.m_owner.handshakeSource(peer, agencyPeer, true);
            } else {
                peerEx.resender.send();
            }
            return true;
        }
        return false;
    }

    get _isExcludeLocalPeer() {
        return true;
    }

    // override以下必须由子类重载
    _getInitTargetNodes() {
        throw new Error('TouchNodeTask._getInitTargetNodes it must be override.');
        // return nodeList;
    }

    _stopImpl() {
        throw new Error('TouchNodeTask._stopImpl it must be override.');
    }

    _createPackage() {
        throw new Error('TouchNodeTask._createPackage it must be override.');
        // return package;
    }

    _onCompleteImpl(result) {
        throw new Error('TouchNodeTask._onCompleteImpl it must be override.');
    }
}

class BroadcastNodeTask extends TouchNodeTask {
    constructor(owner, arrivePeerCount, {ttl = 0, isForward = false, timeout = TaskConfig.TimeoutMS, excludePeerids = null} = {}) {
        if (new.target === BroadcastNodeTask) {
            throw new Error('BroadcastNodeTask is a base frame, it must be extended.');
        }
        super(owner, {ttl, isForward, timeout, excludePeerids});
        this.m_arrivePeerCount = arrivePeerCount;
    }

    _getInitTargetNodes() {
        this.m_excludePeerids.add(this.bucket.localPeer.peerid);
        return this.bucket.getRandomPeers({excludePeerids: this.m_excludePeerids, count: this.m_arrivePeerCount});
    }
}

class TouchNodeConvergenceTask extends TouchNodeTask {
    constructor(owner, {ttl = 0, isForward = false, timeout = TaskConfig.TimeoutMS, excludePeerids = null} = {}) {
        if (new.target === TouchNodeConvergenceTask) {
            throw new Error('TouchNodeConvergenceTask is a base frame, it must be extended.');
        }
        super(owner, {ttl, isForward, timeout, excludePeerids});
    }

    _getInitTargetNodes() {
        let option = this.m_isForward? {maxDistance: this.bucket.distanceToLocal(this._targetKey)} : {};
        if (this.m_excludePeerids.size > 0) {
            option.excludePeerids = this.m_excludePeerids;
        }
        return this.bucket.findClosestPeers(this._targetKey, option);
    }

    // override 以下必须由子类重载
    get _targetKey() {
        throw new Error('TouchNodeConvergenceTask.key it must be override.');
        // return key;
    }
}

module.exports.TouchNodeTask = TouchNodeTask;
module.exports.TouchNodeConvergenceTask = TouchNodeConvergenceTask;
module.exports.BroadcastNodeTask = BroadcastNodeTask;