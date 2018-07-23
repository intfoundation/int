'use strict';

const EventEmitter = require('events');
const Base = require('../base/base.js');
const {HashDistance, EndPoint, Config} = require('./util.js');
const Bucket = require('./bucket.js');
const DHTPackageFactory = require('./package_factory.js');
const DHTPackage = require('./packages/package.js');
const Peer = require('./peer.js');
const DHTCommandType = DHTPackage.CommandType;

const LOG_TRACE = Base.BX_TRACE;
const LOG_INFO = Base.BX_INFO;
const LOG_WARN = Base.BX_WARN;
const LOG_DEBUG = Base.BX_DEBUG;
const LOG_CHECK = Base.BX_CHECK;
const LOG_ASSERT = Base.BX_ASSERT;
const LOG_ERROR = Base.BX_ERROR;

class PackageSender extends EventEmitter {
    constructor(mixSocket, bucket) {
        super();
        this.m_mixSocket = mixSocket;
        this.m_bucket = bucket;
        this.m_taskExecutor = null;

        this.m_stat = {
            udp: {
                pkgs: 0,
                bytes: 0,
            },
            tcp: {
                pkgs: 0,
                bytes: 0,
            }
        }
    }
    
    get mixSocket() {
        return this.m_mixSocket;
    }

    set taskExecutor(newValue) {
        this.m_taskExecutor = newValue;
    }

    sendPackage(peer, cmdPackage, ignoreRouteCache) {
        let localPeer = this.m_bucket.localPeer;
        let peerStruct = localPeer.toStructForPackage();
        if (!peer.hash) {
            peer.hash = HashDistance.hash(peer.peerid);
        }

        if (peer.peerid === localPeer.peerid) {
            cmdPackage.fillCommon(peerStruct, peer, []);
            setImmediate(() => this.emit(PackageSender.Events.localPackage, cmdPackage));
            return;
        }

        let recommandNodes = [];

        if (peer instanceof Peer.Peer &&
            peer.onlineDuration < Config.Peer.recommandNeighborTime &&
            !peer.__noRecommandNeighbor) {

            let closePeerList = this.m_bucket.findClosestPeers(peer.peerid);
            if (closePeerList && closePeerList.length > 0) {
                for (let closePeer of closePeerList) {
                    if (closePeer.isOnline(this.m_bucket.TIMEOUT_MS) &&
                        closePeer.peerid != peer.peerid &&
                        closePeer.peerid != peerStruct.peerid) {
                        recommandNodes.push({id: closePeer.peerid, eplist: closePeer.eplist});
                    }
                }
            }
        }
        cmdPackage.fillCommon(peerStruct, peer, recommandNodes);
        
        peer.lastSendTime = Date.now();
        cmdPackage.isTooLarge = false;
        let eplist = peer.eplist;
        if (!eplist || !eplist.length) {
            eplist = [EndPoint.toString(peer.address)];
        } else {
            let addr = peer.address;
            if (addr && addr.protocol === EndPoint.PROTOCOL.tcp) {
                eplist.push(EndPoint.toString(addr));
            }
        }
        this.m_mixSocket.send(cmdPackage, eplist, ignoreRouteCache, null,
            (pkg, remoteAddr, socket, protocol) => this._onPreSendPackage(pkg, remoteAddr, socket, protocol, peer),
            null);
    }

    stat() {
        return this.m_stat;
    }

    _onPreSendPackage(cmdPackage, remoteAddr, socket, protocol, peer) {
        if (cmdPackage.isTooLarge) {
            return null;
        }
        
        cmdPackage.dest.ep = EndPoint.toString(remoteAddr);
        LOG_TRACE(`PEER(${this.m_bucket.localPeer.peerid}) Send package(${DHTCommandType.toString(cmdPackage.cmdType)}) to peer(${cmdPackage.dest.peerid}:${remoteAddr.address}:${remoteAddr.port})`);

        let encoder = DHTPackageFactory.createEncoder(cmdPackage);
        let buffer = encoder.encode();

        if (buffer.length <= DHTPackageFactory.PACKAGE_LIMIT ||
            protocol === this.m_mixSocket.PROTOCOL.tcp ||
            !this.m_taskExecutor) {

            if (peer instanceof Peer.Peer &&
                !peer.__noRecommandNeighbor) {
                peer.__noRecommandNeighbor = true;
            }

            let stat = this.m_stat.udp;
            if (protocol === EndPoint.PROTOCOL.tcp) {
                stat = this.m_stat.tcp;
            }
            stat.pkgs++;
            stat.bytes += buffer.length;
            return buffer;
        } else {
            // split package
            cmdPackage.isTooLarge = true;
            this.m_taskExecutor.splitPackage(cmdPackage, peer);
            return null;
        }
    }
}

PackageSender.Events = {
    localPackage: 'localPackage',
}

let g_resenderQueue = [];
function removeTimeoutResender() {
    let now = Date.now();
    if (g_resenderQueue.length > 1024) {
        let i = 0;
        while (i < g_resenderQueue.length) {
            let resender = g_resenderQueue[i];
            // 先把超时包去掉
            if (resender.isTimeout() || now - resender.lastSendTime > 600000) {
                resender.m_timesLimitForce = 0;
                g_resenderQueue.splice(i, 1);
            } else {
                i++;
            }
        }
    }

    if (g_resenderQueue.length > 1024) {
        let i = 0;
        while (i < g_resenderQueue.length) {
            let resender = g_resenderQueue[i];
            // 重发包太多时候，限制最多重发两次
            if (resender.tryTimes > 2) {
                resender.m_timesLimitForce = 0;
                g_resenderQueue.splice(i, 1);
            } else {
                i++;
            }
        }
    }
}

class ResendControlor {
    // 如果不设置peer/pkg/sender，不能调用send，自己调用needResend判定是否需要resend，调用sender.sendPackage后调用onSend控制下次重试的节奏
    // 如果设置了peer/pkg/sender，可以随时调用send重试一次，send函数内部决定是否真的到了重试的时机
    // 内部不设定时器自动resend，使用方需要resend时需手动触发，不用担心任务完成还有额外的resend包发出
    constructor(peer = null, pkg = null, sender = null, initInterval = 1000, timesLimit = 5) {
        this.m_peer = peer;
        this.m_pkg = pkg;
        this.m_sender = sender;

        this.m_interval = initInterval;
        this.m_tryTimes = 0;
        this.m_timesLimit = timesLimit;
        this.m_timesLimitForce = timesLimit;
        this.m_lastTime = 0;

        g_resenderQueue.push(this);
        removeTimeoutResender();
    }

    send() {
        if (!(this.m_peer && this.m_pkg && this.m_sender && this.needResend())) {
            return;
        }

        this.onSend();
        this.m_sender.sendPackage(this.m_peer, this.m_pkg, (this.m_tryTimes % 2 === 0));
    }

    onSend() {
        this.m_tryTimes++;
        this.m_lastTime = Date.now();
        if (this.m_tryTimes >= 2) {
            this.m_interval *= 2;
        }
    }

    needResend() {
        return !this.isTimeout() && Date.now() >= this.m_lastTime + this.m_interval;
    }

    isTimeout() {
        return this.m_tryTimes >= Math.min(this.m_timesLimit, this.m_timesLimitForce);
    }

    get tryTimes() {
        return this.m_tryTimes;
    }
    
    get lastSendTime() {
        return this.m_lastTime;
    }
}

module.exports.PackageSender = PackageSender;
module.exports.ResendControlor = ResendControlor;