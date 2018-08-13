'use strict';

const {Config, RandomGenerator, EndPoint} = require('./util.js');
const DHTPackage = require('./packages/package.js');
const Base = require('../base/base.js');
const Peer = require('./peer.js');
const assert = require('assert');
const LOG_WARN = Base.BX_WARN;
const LOG_INFO = Base.BX_INFO;

const RouteTableConfig = Config.RouteTable;

class RouteTable {
    constructor({taskExecutor, bucket, packageFactory, packageSender}) {
        this.m_taskExecutor = taskExecutor;
        this.m_bucket = bucket;
        this.m_packageFactory = packageFactory;
        this.m_packageSender = packageSender;
        this.m_nextExpandTime = 0;
        this.m_peerCountLastExpand = -128; // 最后一次扩充路由表时的peer数，初始置负数，保证第一次及时更新扩充路由表
        this.m_time4LastPackageFromInternet = 0;
    }

    refresh() {
        this._expand();
        this._pingAllTimeoutPeers();
        if (this.m_bucket.localPeer.natType === Peer.NAT_TYPE.NAT) {

        }
    }

    ping(peer) {
        let pingPackage = this.m_packageFactory.createPackage(DHTPackage.CommandType.PING_REQ);
        this.m_packageSender.sendPackage(peer, pingPackage);
    }

    onRecvPackage(cmdPackage, socket, remotePeer, remoteAddress) {
        if (!EndPoint.isNAT(remoteAddress)) {
            this.m_time4LastPackageFromInternet = Date.now();
        }
    }

    static _randomPeerid() {
        let length = RandomGenerator.integer(64, 16);
        return RandomGenerator.string(length);
    }

    _expand() {
        let now = Date.now();
        let maxInterval = this._maxExpandInterval();

        if (isFinite(this.m_nextExpandTime) && this.m_nextExpandTime - now > maxInterval) {
            this.m_nextExpandTime = now;
        }

        if (this.m_nextExpandTime <= now) {
            this.m_nextExpandTime = Infinity;
            this.m_peerCountLastExpand = this.m_bucket.peerCount;
            this.m_taskExecutor.findPeer(RouteTable._randomPeerid(),
                () => this.m_nextExpandTime = Date.now() + RandomGenerator.integer(this._maxExpandInterval(), RouteTableConfig.ExpandIntervalMS.Min)
            );
        }
    }

    // 查询周期随peer数量增多变长
    _maxExpandInterval() {
        let peerCount = this.m_bucket.peerCount;
        return RouteTableConfig.ExpandIntervalMS.dynamic(peerCount, peerCount - this.m_peerCountLastExpand);
    }

    // 受限/对称NAT应该对较多节点进行高频的ping维持穿透；
    // 全锥形NAT，只要近期有对外recv包即可维持穿透，维持相对长时间的ping间隔测试其他在线状态
    // 公网Peer不需要维持穿透状态，只要定时测试其他peer在线状态即可
    _pingAllTimeoutPeers() {
        let now = Date.now();
        let pingPackage = null;
        let pingInterval4NATType = RouteTableConfig.PingIntervalMS.Max;
        let localPeer = this.m_bucket.localPeer;
        switch (localPeer.natType) {
            case Peer.NAT_TYPE.unknown: // fallthrough
            case Peer.NAT_TYPE.restrictedNAT: // fallthrough
            case Peer.NAT_TYPE.symmetricNAT: // fallthrough
                pingInterval4NATType = 0;
                break;
            case Peer.NAT_TYPE.NAT:
                if (now - this.m_time4LastPackageFromInternet > RouteTableConfig.PingIntervalMS.Min) {
                    pingInterval4NATType = 0; // 很长时间没收到来自公网的包了，按受限NAT频率ping一遍
                }
                break;
            default:
                break;
        }

        // 近期离线
        let isOfflineRecently = (peer) => {
            return !peer.isOnline(this.m_bucket.TIMEOUT_MS) // 不在线
                && now - peer.lastRecvTime < this.m_bucket.TIMEOUT_MS + RouteTableConfig.PingIntervalMS.Retry * 3;
        }

        let shoudRetry = (peer) => {
            let pingInterval = pingInterval4NATType || RouteTableConfig.PingIntervalMS.dynamic(peer.bucketItem.distRank);
            // 在一个ping周期略长的时间内没有收到包，很可能是ping包丢失；
            // 近期离线的也应该retry，可能还能救回
            return (now - peer.lastRecvTime >= pingInterval && now - peer.lastRecvTime < pingInterval + RouteTableConfig.PingIntervalMS.Retry * 3) ||
                isOfflineRecently(peer);
        }

        let lastRank = {
            rank: -1,
            recentSendPeer: null,
            recentSendTime: 0,
        };

        let ping = (peer) => {
            if (!pingPackage) {
                pingPackage = this.m_packageFactory.createPackage(DHTPackage.CommandType.PING_REQ);
            }
            this.m_packageSender.sendPackage(peer, pingPackage);
        }

        this.m_bucket.forEachPeer(peer => {
            // 按距离确定ping时间间隔，刚刚超时的peer可能只是丢包，最近抓紧时间重试几次
            // 每个距离等级上都保留一个相对高频的ping，提高远距离peer之间的连通率
            if (!peer.bucketItem) {
                assert(!this.m_bucket.findPeer(peer.peerid));
                return;
            }
            if (peer.bucketItem.distRank != lastRank.rank) {
                if (lastRank.recentSendPeer && now - lastRank.recentSendTime > (pingInterval4NATType || RouteTableConfig.PingIntervalMS.Min)) {
                    ping(lastRank.recentSendPeer);
                }
                lastRank.rank = peer.bucketItem.distRank;
                lastRank.recentSendPeer = peer;
                lastRank.recentSendTime = peer.lastSendTime;
            }

            let pingInterval = pingInterval4NATType || RouteTableConfig.PingIntervalMS.dynamic(peer.bucketItem.distRank);
            if (now - peer.lastSendTime >= pingInterval ||
                (shoudRetry(peer) && now - peer.lastSendTime >= RouteTableConfig.PingIntervalMS.Retry)) {

                if (now - peer.lastSendTime > RouteTableConfig.PingIntervalMS.Max) {
                    // LOG_WARN(`Ping stopped. ${this.m_bucket.localPeer.peerid}=>${peer.peerid}, last send package time:${new Date(peer.lastSendTime).toDateString()}`);
                }
                if (!peer.isOnline(this.m_bucket.TIMEOUT_MS)) {
                    peer.address = null;
                    // LOG_WARN(`Ping stopped. ${this.m_bucket.localPeer.peerid}=>${peer.peerid}, last send package time:${new Date(peer.lastSendTime).toDateString()}`);
                }
                ping(peer);

                if (peer.lastSendTime > lastRank.recentSendTime) {
                    lastRank.recentSendTime = peer.lastSendTime;
                    lastRank.recentSendPeer = peer;
                }
            }
        });
    }
}

module.exports = RouteTable;