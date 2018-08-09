'use strict';

const {HashDistance, Config, EndPoint} = require('./util.js');
const PeerConfig = Config.Peer;
const ServiceDescriptor = require('./service_descriptor.js');

const Base = require('../base/base.js');
const BaseUtil = require('../base/util.js');

const LOG_INFO = Base.BX_INFO;
const LOG_WARN = Base.BX_WARN;
const LOG_DEBUG = Base.BX_DEBUG;
const LOG_CHECK = Base.BX_CHECK;
const LOG_ASSERT = Base.BX_ASSERT;
const LOG_ERROR = Base.BX_ERROR;

class Peer {
    constructor({peerid, eplist, natType = NAT_TYPE.unknown, onlineDuration = 0, services = null, additionalInfo = null, hash = null}) {
        let now = Date.now();
        this.m_peerid = peerid;
        this.m_eplist = new Set(eplist || []);
        this._eraseZeroEP();
        this.m_additionalInfo = null;
        this._setAdditionalInfo(additionalInfo);
        this.m_address = null;
        this.m_lastRecvTime = 0;
        this.m_lastSendTime = 0;
        let calcHash = HashDistance.hash(peerid);
        if (hash && HashDistance.checkEqualHash(hash, calcHash)) {
            this.m_hash = hash;
        } else {
            this.m_hash = calcHash;
        }

        this.m_isIncome = false;
        this.m_servicesMgr = new ServiceDescriptor('', ServiceDescriptor.FLAGS_SIGNIN_SERVER, null);
        this.m_servicesMgr.updateServices(services);
        this.m_natType = natType;
        this.m_onlineTime = Math.ceil(now / 1000 - onlineDuration);
    }

    get peerid() {
        return this.m_peerid;
    }

    get hash() {
        return this.m_hash;
    }

    get eplist() {
        return [...this.m_eplist];
    }

    set eplist(newValue) {
        if (newValue !== this.m_eplist) {
            this.m_eplist = new Set(newValue);
            this._eraseZeroEP();
        }
    }

    get address() {
        return this.m_address;
    }

    set address(newValue) {
        // TCP当前通信地址只作为双方通信的地址，不能加入eplist用于传播
        if (newValue) {
            if (newValue.address && newValue.port && newValue.family) {
                this.m_address = Object.assign({}, newValue);

                if (newValue.protocol === EndPoint.PROTOCOL.udp) {
                    this.unionEplist([EndPoint.toString(newValue)]);
                }
            }
        } else {
            // 当前tcp通信地址在eplist中没有记录，不可随意删除
            if (this.m_address && this.m_address.protocol === EndPoint.PROTOCOL.udp) {
                this.m_address = null;
            }
        }
    }

    get natType() {
        return this.m_natType;
    }

    set natType(newValue) {
        this.m_natType = newValue;
    }

    get onlineDuration() {
        let duration = Math.ceil(Date.now() / 1000 - this.m_onlineTime);
        return duration > 1? duration : 1;
    }

    unionEplist(eplist) {
        if (eplist) {
            for (let ep of eplist) {
                if (!EndPoint.isZero(ep)) {
                    this.m_eplist.add(ep);
                }
            }
        }
    }

    toStructForPackage() {
        let obj = {
            peerid: this.m_peerid,
            hash: this.m_hash,
            eplist: [...this.eplist],
        };

        return obj;
    }


    toStruct() {
        let obj = {
            peerid: this.m_peerid,
            hash: this.m_hash,
            eplist: [],
            natType: this.natType,
            onlineDuration: this.onlineDuration,
        };

        if (this.m_additionalInfo) {
            obj.additionalInfo = [...this.m_additionalInfo];
        }

        let servicesObj = this._servicesStruct();
        if (servicesObj) {
            obj.services = servicesObj.services;
        }

        {
            // 0地址传播没有意义
            this.m_eplist.forEach((info, ep) => {
                if (!EndPoint.isZero(ep)) {
                    obj.eplist.push(ep);
                }
            });
        }
        return obj;
    }
    
    _servicesStruct() {
        let obj;
        if (!this.m_servicesMgr.services) {
            return obj;
        }
    
        obj = {
            services: [],
        };
        
        this.m_servicesMgr.services.forEach((desc, id) => {
            let subSvcObj = desc.toStructForPackage();
            subSvcObj.id = id;
            obj.services.push(subSvcObj);
        });
/*
        {
            LOG_INFO(`_servicesStruct(${this.peerid}) actived, service list:`);
            if (obj.services)
                obj.services.forEach((subSrv) => LOG_INFO(`ServiceID:${subSrv.id}, flags:${subSrv.flags}`));
        }
*/
        return obj;
    }
    
    get lastRecvTime() {
        return this.m_lastRecvTime;
    }

    set lastRecvTime(newValue) {
        this.m_lastRecvTime = newValue;
        if (!this.m_lastSendTime) {
            this.m_isIncome = true;
        }
    }

    get lastSendTime() {
        return this.m_lastSendTime;
    }

    set lastSendTime(newValue) {
        this.m_lastSendTime = newValue;
        // 避免第一次发包收到响应前被判定为超时
        if (!this.m_lastRecvTime) {
            this.m_lastRecvTime = newValue;
        }
    }

    get additionalInfo() {
        return this.m_additionalInfo;
    }

    getAdditionalInfo(keyName) {
        return this.m_additionalInfo? this.m_additionalInfo.get(keyName) : undefined;
    }

    set additionalInfo(newValue) {
        this._setAdditionalInfo(newValue);
    }

    updateAdditionalInfo(keyName, newValue) {
        if (!this.m_additionalInfo) {
            this.m_additionalInfo = new Map();
        }
        this.m_additionalInfo.set(keyName, newValue);
    }

    deleteAdditionalInfo(keyName) {
        if (this.m_additionalInfo) {
            this.m_additionalInfo.delete(keyName);
            if (this.m_additionalInfo.size === 0) {
                this.m_additionalInfo = null;
            }
        }
    }

    findService(servicePath) {
        return this.m_servicesMgr.findService(servicePath);
    }
        
    getServiceInfo(servicePath, key) {
        return this.m_servicesMgr.getServiceInfo(servicePath, key);
    }

    /*
        SERVICE: {
                id: string,
                flags: int
                info: [[key,value]...],
                services: ARRAY[SERVICE],
            }
        services: ARRAY[SERVICE]
    */
    updateServices(services) {
        this.m_servicesMgr.updateServices(services);
    }
    
    // 一段时间内收到过包才认为它在线
    isOnline(limitMS) {
        this._correctTime();
        return Date.now() - this.m_lastRecvTime < limitMS;
    }

    // 发出包后一段时间内没有收到包认为它超时
    isTimeout(limitMS) {
        this._correctTime();
        return this.m_lastSendTime - this.m_lastRecvTime > limitMS;
    }
    
    get services() {
        return this.m_servicesMgr.services;
    }

    static isValidPeerid(peerid) {
        return typeof peerid === 'string' && peerid.length > 0;
    }

    static unionEplist(eplist1, eplist2) {
        return [... new Set([...(eplist1 || []), ...(eplist2 || [])])];
    }

    _correctTime() {
        let now = Date.now();
        if (this.m_lastRecvTime > now) {
            this.m_lastRecvTime = now;
        }
        if (this.m_lastSendTime > now) {
            this.m_lastSendTime = now;
        }
    }

    _setAdditionalInfo(newValue) {
        if (!newValue) {
            this.m_additionalInfo = null;
        } else if (newValue !== this.m_additionalInfo) {
            this.m_additionalInfo = new Map([...newValue]);
        }
    }

    _eraseZeroEP() {
        // 只删除udp的0地址, 保留tcp
        let zeroEPList = [];
        for (let ep of this.m_eplist.keys()) {
            const { protocol } = EndPoint.toAddress(ep);
            if (EndPoint.isZero(ep) && protocol == EndPoint.PROTOCOL.udp) {
                zeroEPList.push(ep);
            }
        }
        zeroEPList.forEach(ep => this.m_eplist.delete(ep));
    }
}

// 本地PEER负责维护自己的地址列表，定时更新当前有效地址
class LocalPeer extends Peer {
    constructor({peerid, eplist, services = null, additionalInfo = [], hash = null,
        EP_TIMEOUT = PeerConfig.epTimeout, MAX_EP_COUNT = PeerConfig.maxEPCount, _eplistWithUpdateState = null}) {

        super({peerid, eplist: [], services, additionalInfo, hash});
        this.EP_TIMEOUT = EP_TIMEOUT;
        this.MAX_EP_COUNT = MAX_EP_COUNT;
        this.m_eplist = new Map();
        if (!(_eplistWithUpdateState instanceof Map)) {
            if (eplist) {
                for (let ep of eplist) {
                    this.m_eplist.set(ep, {isInitEP: true});
                }
                this._eraseZeroEP();
            }
        } else {
            _eplistWithUpdateState.forEach((attr, ep) => {
                if (attr.isInitEP) {
                    this.m_eplist.set(ep, {isInitEP: true});
                } else {
                    this.m_eplist.set(ep, {updateTime: attr.updateTime});
                }
            });
        }
        this.m_initEPCount = this.m_eplist.size;

        this.m_passivePeerCount = 0; // 对方被动发现peer数
        this.m_incomingPeerCount = 0; // 对方主动接入peer数
    }

    get eplist() {
        let now = Date.now();
        let validEpList = new Set();
        this.m_eplist.forEach((info, ep) => {
            if (info.isInitEP) {
                validEpList.add(ep);
            } else if (now - info.updateTime < this.EP_TIMEOUT){
                if (EndPoint.toAddress(ep).protocol === EndPoint.PROTOCOL.udp ||
                    info.isReuseListener) {
                    validEpList.add(ep);
                }
            }
        });
        return [...validEpList];
    }

    set eplist(newValue) {
        if (newValue !== this.m_eplist) {
            let eraseEPList = [];
            this.m_eplist.forEach((info, ep) => info.isInitEP? 0 : eraseEPList.push(ep));
            eraseEPList.forEach(ep => this.m_eplist.delete(ep));

            this.unionEplist(newValue);
        }
    }

    unionEplist(eplist, isReuseListener) {
        let now = Date.now();

        let _unionEPList = (newEPList, _isReuseListener) => {
            for (let ep of newEPList) {
                if (EndPoint.isZero(ep)) {
                    continue;
                }
    
                let info = this.m_eplist.get(ep);
                if (!info) {
                    // 对称NAT，记录EP没有意义
                    if (!this.isSymmetricNAT) {
                        info = {updateTime: now};
                        this.m_eplist.set(ep, info);
                    }
                } else if(!info.isInitEP) {
                    info.updateTime = now;
                }
                // tcp需要区分是否是监听socket，监听socket可以传播出去，非监听socket传播出去没有意义，而且数量巨大
                if (info && _isReuseListener) {
                    info.isReuseListener = true;
                }
            }
        }

        // 如果一个endpoint的ip是0地址或者内网ip
        // 并且这个endpoint的协议是tcp协议,
        // 就需要做NAT转换
        let additionalEPList = [];
        if (!isReuseListener) {
            this.m_eplist.forEach((info, ep) => {
                // 不是初始声明的endpoint, 而且也不是复用连接的endpoint
                if ( !info.isInitEP && !info.isReuseListener ) {
                    return
                }

                const outerAddress = BaseUtil.EndPoint.toAddress(eplist[0]);
                const [isOk, newEp ] = BaseUtil.doNAT(ep, outerAddress);
                if ( isOk ) {
                    additionalEPList.push(newEp);
                }
            });
        }

        _unionEPList(eplist, isReuseListener);
        _unionEPList(additionalEPList, true);
        this._knockOut();
    }

    // 设置向特定EP发包的socket地址
    setSenderEP(ep, senderEP) {
        let epInfo = this.m_eplist.get(ep);
        if (epInfo) {
            epInfo.senderEP = senderEP;
        }
    }
    
    get lastRecvTime() {
        return Date.now();
    }

    set lastRecvTime(newValue) {
    }

    get lastSendTime() {
        return Date.now();
    }

    set lastSendTime(newValue) {
    }

    isTimeout() {
        return false;
    }
    
    setServiceInfo(servicePath, newValue) {
        let descriptor = findService(servicePath);
        if (descriptor) {
            descriptor.serviceInfo = newValue;
        }
    }

    signinService(servicePath) {
        this.m_servicesMgr.signinService(servicePath);
    }

    signoutService(servicePath) {
        this.m_servicesMgr.signoutService(servicePath);
    }
    
    updateServiceInfo(servicePath, key, value) {
        this.m_servicesMgr.updateServiceInfo(servicePath, key, value);
    }

    deleteServiceInfo(servicePath, key) {
        this.m_servicesMgr.deleteServiceInfo(servicePath, key);
    }

    toStructForPackage() {
        let obj = this.toStruct();
        // 对称NAT的EP分发出去没有意义
        if (this.isSymmetricNAT) {
            if (obj.eplist) {
                delete obj.eplist;
            }
        }
        return obj;
    }

    get isSymmetricNAT() {
        // 对于对称NAT中的节点，会从公网上发现很多不同的EP
        return this.m_eplist.size - this.m_initEPCount > PeerConfig.maxEPCount;
    }

    get natType() {
        if (this.onlineDuration > PeerConfig.NATTypeTime) {
            return NAT_TYPE.unknown;
        }

        if (this.isSymmetricNAT) {
            LOG_INFO(`isSymmetricNAT:eplist.size=${this.m_eplist.size},initEPCount=${this.m_initEPCount}`);
            return NAT_TYPE.symmetricNAT;
        } else if (this.m_passivePeerCount > 64 && this.m_incomingPeerCount / this.m_passivePeerCount < 0.1) {
            LOG_INFO(`restrictedNAT:this.m_passivePeerCount=${this.m_passivePeerCount},this.m_incomingPeerCount=${this.m_incomingPeerCount}`);
            return NAT_TYPE.restrictedNAT;
        } else {
            // 其他peer看到的地址都和发包采用地址相同，认为它有一个公网地址
            if (this.m_eplist) {
                let now = Date.now();
                for (let [ep, epInfo] of this.m_eplist) {
                    LOG_INFO(`now=${now},ep=${ep},epInfo=${JSON.stringify(epInfo)}`);
                    let epAddress = EndPoint.toAddress(ep);
                    if (epInfo.senderEP && now - epInfo.updateTime <= this.EP_TIMEOUT && !EndPoint.isNAT(epAddress)) {
                        let epSenderAddress = EndPoint.toAddress(epInfo.senderEP);
                        // 收发地址完全匹配，或者发送地址是'0.0.0.0'但port匹配，刚好映射到相同port的情况时，会误判
                        if (ep === epInfo.senderEP || 
                            (EndPoint.isZero(epSenderAddress) && epAddress.port === epSenderAddress.port)) {
                            return NAT_TYPE.internet;
                        }
                    }
                }
            }
        }
        return NAT_TYPE.NAT;
    }

    _knockOut() {
        let now = Date.now();

        let outtimeEPList = [];
        let isNat = false;
        for (let [ep, info] of this.m_eplist) {
            if (info.isInitEP) {
                continue;
            }

            if (now - info.updateTime > this.EP_TIMEOUT) {
                outtimeEPList.push(ep);
            } else {
                let addr = EndPoint.toAddress(ep);
                if (addr.protocol === EndPoint.PROTOCOL.tcp && !info.isReuseListener) {
                    // TCP非监听地址只能用来通过收发地址的匹配性参考性识别NAT，保留无益
                    if (isNat || !info.senderEP) {
                        outtimeEPList.push(ep);
                    } else {
                        let senderAddress = EndPoint.toAddress(info.senderEP);
                        if ((ep === info.senderEP || (EndPoint.isZero(senderAddress) && addr.port === senderAddress.port))) {
                            outtimeEPList.push(ep);
                        } else {
                            isNat = true;
                        }
                    }
                }
                if (now < info.updateTime) {
                    info.updateTime = now;
                }
            }
        }

        outtimeEPList.forEach(ep => this.m_eplist.delete(ep));
    }

    get _eplistWithUpdateState() {
        return this.m_eplist;
    }

    get incomingPeerCount() {
        return this.m_incomingPeerCount;
    }
    
    incomingPeerCountInc() {
        this.m_incomingPeerCount++;
    }

    get passivePeerCount() {
        return this.m_passivePeerCount;
    }
    
    passivePeerCountInc() {
        this.m_passivePeerCount++;
    }
}

const NAT_TYPE = {
    unknown: 0,
    internet: 1,
    NAT: 2,
    restrictedNAT: 3,
    symmetricNAT: 4,

    tostring(id) {
        switch(id) {
            case NAT_TYPE.internet: return 'internet';
            case NAT_TYPE.NAT: return 'NAT';
            case NAT_TYPE.restrictedNAT: return 'restrictedNAT';
            case NAT_TYPE.symmetricNAT: return 'symmetricNAT';
            default: return 'unknown';
        }
    },

    toID(strType) {
        switch(strType) {
            case 'internet' : return NAT_TYPE.internet;
            case 'NAT': return NAT_TYPE.NAT;
            case 'restrictedNAT': return NAT_TYPE.restrictedNAT;
            case 'symmetricNAT': return NAT_TYPE.symmetricNAT;
            default: return NAT_TYPE.unknown;
        }
    }
}

module.exports.Peer = Peer;
module.exports.LocalPeer = LocalPeer;
module.exports.NAT_TYPE = NAT_TYPE;