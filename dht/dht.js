'use strict';

const EventEmitter = require('events');
const Base = require('../base/base.js');
const {HashDistance, Result: DHTResult, Config, EndPoint, FLAG_PRECISE, TOTAL_KEY} = require('./util.js');
const {Peer, LocalPeer} = require('./peer.js');
const Bucket = require('./bucket.js');
const DistributedValueTable = require('./distributed_value_table.js');
const TaskMgr = require('./taskmgr.js');
const DHTPackage = require('./packages/package.js');
const DHTPackageFactory = require('./package_factory.js');
const {PackageSender} = require('./package_sender.js');
const PackageProcessor = require('./package_processor.js');
const RouteTable = require('./route_table.js');
const LocalValueMgr = require('./local_value_mgr.js');
const PiecePackageRebuilder = require('./piece_package_rebuilder.js');
const net = require('net');

const DHTCommandType = DHTPackage.CommandType;

const LOG_TRACE = Base.BX_TRACE;
const LOG_INFO = Base.BX_INFO;
const LOG_WARN = Base.BX_WARN;
const LOG_DEBUG = Base.BX_DEBUG;
const LOG_CHECK = Base.BX_CHECK;
const LOG_ASSERT = Base.BX_ASSERT;
const LOG_ERROR = Base.BX_ERROR;

const ROOT_SERVICE_PATH = [];
const BASE_DHT_SERVICE_ID = '';

class DHTBase extends EventEmitter {
    constructor(mixSocket, localPeer, packageFactory, taskMgr) {
        super();
        this.m_bucket = new Bucket(localPeer);
        this.m_distributedValueTable = new DistributedValueTable();
        this.m_packageSender = new PackageSender(mixSocket, this.m_bucket);
        this.m_packageFactory = packageFactory;
        this.m_broadcastEventEmitter = new EventEmitter();
        
        let env = {
            bucket: this.m_bucket,
            packageSender: this.m_packageSender,
            packageFactory: this.m_packageFactory,
            distributedValueTable: this.m_distributedValueTable,
            broadcastEventEmitter: this.m_broadcastEventEmitter,
            taskMgr: taskMgr,
            taskExecutor: null,
        };
        this.m_taskExecutor = taskMgr.createTaskExecutor(env);
        this.m_packageSender.taskExecutor = this.m_taskExecutor;
        this.m_packageSender.on(PackageSender.Events.localPackage,
            cmdPackage => {
                let rootDHT = this;
                while (rootDHT.m_father) {
                    rootDHT = rootDHT.m_father;
                }
                this._process(cmdPackage, this.m_bucket.localPeer);
            });

        env.taskExecutor = this.m_taskExecutor;
        this.m_packageProcessor = new PackageProcessor(env);
        this.m_routeTable = new RouteTable(env);
        this.m_localValueMgr = new LocalValueMgr(env);
        
        this.m_subServiceDHTs = new Map();
    }

    get localPeer() {
        return new Peer(this.m_bucket.localPeer);
    }

    // callback({result, peerlist})
    findPeer(peerid, callback) {
        let appendLocalHost = (peers) => {
            if (peerid === this.m_bucket.localPeer.peerid) {
                let localPeer = null;
                if (peers.length === 0 || peers[0].peerid !== peerid) {
                    localPeer = new Peer(this.m_bucket.localPeer);
                    peers.unshift(localPeer);
                } else {
                    localPeer = peers[0];
                }
                
                let getLocalListenEPList = () => {
                    let eplist = [];
                    this.m_packageSender.mixSocket.eplist.forEach(ep => {
                        let addr = EndPoint.toAddress(ep);
                        if (EndPoint.isZero(addr)) {
                            addr.address = '127.0.0.1';
                            addr.family = 'IPv4';
                            ep = EndPoint.toString(addr);
                        }
                        eplist.push(ep);
                    });
                    return eplist;
                }
                localPeer.unionEplist(getLocalListenEPList());
            }
        }

        if (callback) {
            this._findPeer(peerid, (result, peers) => {
                peers = peers || [];
                if (peerid === this.m_bucket.localPeer.peerid) {
                    result = 0;
                    appendLocalHost(peers);
                }
                callback({result, peerlist: peers});
            });
        } else {
            return new Promise(resolve => {
                this._findPeer(peerid, (result, peers) => {
                    peers = peers || [];
                    if (peerid === this.m_bucket.localPeer.peerid) {
                        result = 0;
                        appendLocalHost(peers);
                    }
                    resolve({result, peerlist: peers})
                });
            });
        }
    }

    _findPeer(peerid, callback) {
        if (!Peer.isValidPeerid(peerid)) {
            if (callback) {
                callback(DHTResult.INVALID_ARGS, []);
            }
            LOG_ASSERT(false, `LOCALPEER(${this.m_bucket.localPeer.peerid}) findPeer peerid is invalid args:${peerid}.`);
            return DHTResult.INVALID_ARGS;
        }

        /* 就算是搜索自己，也可以返回距离自己较近的几个节点，在某些应用场景也是有价值的
        let peer = this.m_bucket.findPeer(peerid);
        if (peer && this.m_bucket.localPeer.peerid === peerid) {
            callback(DHTResult.SUCCESS, []);
            return DHTResult.SUCCESS;
        }
        */
        LOG_INFO(`LOCALPEER(${this.m_bucket.localPeer.peerid}:${this.servicePath}) findPeer peerid(${peerid}).`);

        this.m_taskExecutor.findPeer(peerid, callback);
        return DHTResult.PENDING;
    }

    saveValue(tableName, keyName, value) {
        if (typeof tableName === 'string' && tableName.length > 0
            && typeof keyName === 'string' && keyName.length > 0 && keyName != TOTAL_KEY
            && value !== undefined && value !== null) {

            LOG_INFO(`LOCALPEER(${this.m_bucket.localPeer.peerid}:${this.servicePath}) saveValue (${tableName}:${keyName}:${value}).`);

            this.m_localValueMgr.saveValue(tableName, keyName, value);
            return DHTResult.SUCCESS;
        } else {
            LOG_ASSERT(false, `SaveValue invalid args, (tableName: ${tableName}, keyName: ${keyName}, value: ${value}).`);
            return DHTResult.INVALID_ARGS;
        }
    }

    deleteValue(tableName, keyName) {
        if (typeof tableName === 'string' && tableName.length > 0
            && typeof keyName === 'string' && keyName.length > 0) {

            LOG_INFO(`LOCALPEER(${this.m_bucket.localPeer.peerid}:${this.servicePath}) deleteValue (${tableName}:${keyName}).`);
                
            this.m_localValueMgr.deleteValue(tableName, keyName);
            return DHTResult.SUCCESS;
        } else {
            LOG_ASSERT(false, `DeleteValue invalid args, (tableName: ${tableName}, keyName: ${keyName}).`);
            return DHTResult.INVALID_ARGS;
        }
    }

    // callback({result, values: Map<key, value>})
    getValue(tableName, keyName, flags = FLAG_PRECISE, callback = undefined) {
        if (callback) {
            this._getValue(tableName, keyName, flags, (result, values) => {
                callback({result, values: (values || new Map())})
            }, flags);
        } else {
            return new Promise(resolve => {
                this._getValue(tableName, keyName, flags, (result, values) => {
                    resolve({result, values: (values || new Map())});
                });
            });
        }
    }

    _getValue(tableName, keyName, flags = FLAG_PRECISE, callback = undefined) {
        if (typeof tableName === 'string' && tableName.length > 0
            && typeof keyName === 'string' && keyName.length > 0) {

            LOG_INFO(`LOCALPEER(${this.m_bucket.localPeer.peerid}:${this.servicePath}) getValue (${tableName}:${keyName}), flags:${flags}.`);
                
            // 可能本地节点就是最距离目标table最近的节点
/*            let values = null;
            if (keyName === TOTAL_KEY
                || (flags & FLAG_PRECISE)) {
                values = this.m_distributedValueTable.findValue(tableName, keyName);
            } else {
                values = this.m_distributedValueTable.findClosestValues(tableName, keyName);
            }

            if (values) {
                let localValues = this.m_localValueMgr.getValue(tableName, keyName);
                if (localValues && localValues.size > 0) {
                    localValues.forEach((value, key) => values.set(key, value));
                }

                if (callback) {
                    callback(DHTResult.SUCCESS, values);
                }
                return DHTResult.SUCCESS;
            }
            */
            this.m_taskExecutor.getValue(tableName, keyName, flags, {ttl: 1, isForward: false}, (result, values, arrivedPeerids) => {
                    let localValues = this.m_localValueMgr.getValue(tableName, keyName);
                    if (localValues && localValues.size > 0) {
                        if (!values) {
                            values = new Map();
                        }
                        localValues.forEach((value, key) => values.set(key, value));
                    }

                    if (callback) {
                        if (values && values.size > 0) {
                            result = DHTResult.SUCCESS;
                        }
                        callback(result, values);
                    }
                });

            return DHTResult.PENDING;
        } else {
            LOG_ASSERT(false, `GetValue invalid args, (tableName: ${tableName}, keyName: ${keyName}).`);
            return DHTResult.INVALID_ARGS;
        }
    }

    // callback({result, arrivedCount})
    emitBroadcastEvent(eventName, params, arriveNodeCount, callback) {
        if (callback) {
            this._emitBroadcastEvent(eventName, params, arriveNodeCount, (result, arrivedCount) => callback({result, arrivedCount}));
        } else {
            return new Promise(resolve => {
                this._emitBroadcastEvent(eventName, params, arriveNodeCount, (result, arrivedCount) => {
                    resolve({result, arrivedCount})
                });
            });
        }
    }

    _emitBroadcastEvent(eventName, params, arriveNodeCount, callback) {
        LOG_INFO(`LOCALPEER(${this.m_bucket.localPeer.peerid}:${this.servicePath}) emitBroadcastEvent(${eventName}:${params}:${arriveNodeCount})`);
        if (typeof eventName === 'string' && typeof arriveNodeCount === 'number' && arriveNodeCount > 0) {
            this.m_taskExecutor.emitBroadcastEvent(eventName,
                params,
                arriveNodeCount,
                this.m_bucket.localPeer.peerid,
                {ttl: 1, isForward: false},
                (result, arrivedPeerids) => callback(result, arrivedPeerids.size));
            return DHTResult.PENDING;
        } else {
            LOG_ASSERT(false, `emitBroadcastEvent invalid args, (eventName type: ${typeof eventName}, arriveNodeCount: ${arriveNodeCount}).`);
            return DHTResult.INVALID_ARGS;
        }
    }

    // listener(eventName, params, sourcePeerid)
    attachBroadcastEventListener(eventName, listener) {
        LOG_INFO(`LOCALPEER(${this.m_bucket.localPeer.peerid}:${this.servicePath}) attachBroadcastEventListener(${eventName})`);
        if (typeof eventName === 'string' && typeof listener === 'function') {
            this.m_broadcastEventEmitter.on(eventName, listener);
            return {eventName, listener, result: DHTResult.SUCCESS};
        } else {
            LOG_ASSERT(false, `attachBroadcastEventListener invalid args type, (eventName type: ${typeof eventName}, listener type: ${typeof listener}).`);
            return {result: DHTResult.INVALID_ARGS};
        }
    }

    // attachBroadcastEventListener相同输入参数
    detachBroadcastEventListener(eventName, listener) {
        LOG_INFO(`LOCALPEER(${this.m_bucket.localPeer.peerid}:${this.servicePath}) detachBroadcastEventListener(${eventName})`);
        if (typeof eventName === 'string' && typeof listener === 'function') {
            this.m_broadcastEventEmitter.removeListener(eventName, listener);
            return DHTResult.SUCCESS;
        } else {
            LOG_ASSERT(false, `detachBroadcastEventListener invalid args type, (eventName type: ${typeof eventName}, listener type: ${typeof listener}).`);
            return DHTResult.INVALID_ARGS;
        }
    }

    get servicePath() {
        return ROOT_SERVICE_PATH;
    }

    get serviceID() {
        return BASE_DHT_SERVICE_ID;
    }

    prepareServiceDHT(servicePath) {
        LOG_INFO(`LOCALPEER(${this.m_bucket.localPeer.peerid}:${this.servicePath}) prepareServiceDHT(${servicePath})`);
        if (!servicePath || servicePath.length <= 0) {
            LOG_ASSERT(false, `prepareServiceDHT invalid args type, (servicePath: ${servicePath}).`);
            return null;
        }

        let fatherDHT = this;
        let serviceDHT = null;
        for (let serviceID of servicePath) {
            serviceDHT = fatherDHT.m_subServiceDHTs.get(serviceID);
            if (!serviceDHT) {
                serviceDHT = new ServiceDHT(fatherDHT, serviceID);
                fatherDHT.m_subServiceDHTs.set(serviceID, serviceDHT);
            }
            fatherDHT = serviceDHT;
        }

        return serviceDHT;
    }

    findServiceDHT(servicePath) {
        LOG_INFO(`LOCALPEER(${this.m_bucket.localPeer.peerid}:${this.servicePath}) prepareServiceDHT(${servicePath})`);
        if (!servicePath || servicePath.length <= 0) {
            LOG_ASSERT(false, `findServiceDHT invalid args type, (servicePath: ${servicePath}).`);
            return null;
        }

        let fatherDHT = this;
        let serviceDHT = null;
        for (let serviceID of servicePath) {
            serviceDHT = fatherDHT.m_subServiceDHTs.get(serviceID);
            if (!serviceDHT) {
                return null;
            }
            fatherDHT = serviceDHT;
        }
        return serviceDHT;
    }

    getAllOnlinePeers() {
        let peerList = [];
        this.m_bucket.forEachPeer(peer => {
            if (!peer.isTimeout(this.m_bucket.TIMEOUT_MS)) {
                peerList.push(new Peer(peer));
            }
        });
        LOG_INFO(`LOCALPEER(${this.m_bucket.localPeer.peerid}:${this.servicePath}) getAllOnlinePeers(count=${peerList.length})`);
        return peerList;
    }

    getRandomPeers(count) {
        let peers = [];
        this.m_bucket.getRandomPeers({count}).forEach(peer => peers.push(new Peer(peer)));
        return peers;
    }

    // private:
    // servicePath是协议包所属目标服务相对当前子服务的子路径
    _process(cmdPackage, remotePeer, servicePath) {
        LOG_TRACE(`LOCALPEER(${this.m_bucket.localPeer.peerid}:${this.servicePath}) Got package(${DHTCommandType.toString(cmdPackage.cmdType)}), servicePath: ${cmdPackage.servicePath}`);
        if (!servicePath) {
            let targetServicePath = cmdPackage.servicePath || [];
            let selfServicePath = this.servicePath;
            if (targetServicePath.length < selfServicePath.length) {
                return;
            }
            for (let i = 0; i < selfServicePath.length; i++) {
                if (selfServicePath[i] !== targetServicePath[i]) {
                    return;
                }
            }
            servicePath = targetServicePath.slice(selfServicePath.length);
        }

        let [childServiceID, ...grandServicePath] = servicePath;
        if (!childServiceID) {
            if (this.isRunning()) {
                this.m_packageProcessor.process(cmdPackage, remotePeer);
            }
        } else {
            let childServiceDHT = this.m_subServiceDHTs.get(childServiceID);
            if (childServiceDHT) {
                childServiceDHT._process(cmdPackage, remotePeer, grandServicePath);
            }
        }
    }

    // serviceDescriptor是当前子服务网络的描述符
    _activePeer(peer, isSent, isReceived, isTrust, serviceDescriptor, cmdPackage) {
        // LOG_INFO(`LOCALPEER(${this.m_bucket.localPeer.peerid}:${this.servicePath}) Got new peer(${peer.peerid}) for (send:${isSent},recv:${isReceived},trust:${isTrust}),serviceDescriptor=${serviceDescriptor}`);
        if (!serviceDescriptor) {
            serviceDescriptor = peer.findService(this.servicePath);
            if (!serviceDescriptor) {
                this.m_bucket.removePeer(peer.peerid);
                return;
            }
        }

        let now = Date.now();
        let activedPeer = peer;
        if (serviceDescriptor.isSigninServer()) {
            if (this.isRunning()) {
                let existPeer = this.m_bucket.findPeer(peer.peerid);
                let isOnlineBefore = existPeer? existPeer.isOnline(this.m_bucket.TIMEOUT_MS) : true;
                let {peer: activedPeer, isNew, discard, replace} = this.m_bucket.activePeer(peer, isSent, isReceived, isTrust);
                if (isNew && !discard) {
                    LOG_TRACE(`LOCALPEER(${this.m_bucket.localPeer.peerid}:${this.servicePath}) Got new peer(${peer.peerid}) for (send:${isSent},recv:${isReceived},trust:${isTrust}),serviceDescriptor=${serviceDescriptor}`);
                    this.m_routeTable.ping(activedPeer);
                    // 没有替换掉线peer，说明该peer很大可能是第一次取得联系；
                    // 如果是替换，第一次联系的可能性会略小，因为之前可能是因为bucket没有空位才被抛弃
                    // 如果该peer之前已经在bucket中，但是离线状态，它很可能也是重新建立联系；
                    if (!replace || (!isNew && !isOnlineBefore)) {
                        this._onNewTouch(activedPeer, cmdPackage);
                    }
                }
            }
        } else {
            this.m_bucket.removePeer(peer.peerid);
        }

        let servicesForPeer = serviceDescriptor.services;
        if (servicesForPeer && this.m_subServiceDHTs) {
            this.m_subServiceDHTs.forEach((serviceDHT, serviceID) => {
                let serviceDescriptor = servicesForPeer.get(serviceID);
                if (serviceDescriptor) {
                    serviceDHT._activePeer(activedPeer, isSent, isReceived, isTrust, serviceDescriptor);
                }
            });
        }
    }

    _update() {
        // if (this.serviceID)
        if (this.m_bucket.peerCount != this.m_lastPeerCount) {
            this.m_lastPeerCount = this.m_bucket.peerCount; 
            LOG_INFO(`LOCALPEER(${this.m_bucket.localPeer.peerid}:${this.servicePath})<><><><><>connected to ${this.m_bucket.peerCount} peers, bucketCount = ${this.m_bucket.bucketCount}.`);

            // print other peers (peerid, addres, eplist) except myself
            this.m_bucket.m_buckets.forEach( bucket => {

                // @var {array<object>} get other peers
                let other_peers = bucket.peerList.filter(peer => {
                    return this.m_bucket.localPeer.peerid != peer.m_peerid
                }).map(peer => {
                    return {
                        peerid: peer.m_peerid,
                        eplist: peer.m_eplist,
                        address:peer.m_address
                    }
                })

                LOG_INFO('other peers', other_peers)
            })
        }
        // this.m_bucket.forEachPeer(peer => LOG_INFO(`peerid: ${peer.peerid}`));
        // this.m_bucket.log();

        if (this.m_subServiceDHTs) {
            this.m_subServiceDHTs.forEach(serviceDHT => serviceDHT._update());
        }

        if (this.isRunning()) {
            this.m_localValueMgr.updateToRemote();
            this.m_distributedValueTable.clearOuttimeValues();

            // 刷新路由表带有盲目性，最后做，因为前面各种操作过后，路由表刷新中的部分操作（比如ping）就不需要了
            this.m_routeTable.refresh();
        }
    }

    isRunning() {
        return true;
    }

    _onNewTouch(peer, cmdPackage) {
    }

    _onSubServiceDHTStartWork(subServiceDHT) {
        this._fillNewSubServiceDHT(subServiceDHT);
    }

    _onSubServiceDHTOffWork(subServiceDHT) {
        // 不删掉它，避免再次生成时产生多个对象
        // this.m_subServiceDHTs.delete(subServiceDHT.serviceID);
        if (this.m_subServiceDHTs.size === 0 && !this.isRunning() && this.m_father) {
            this.m_father._onSubServiceDHTOffWork(this);
        }
    }

    _fillNewSubServiceDHT(subServiceDHT) {
        this.m_bucket.forEachPeer(peer => subServiceDHT._activePeer(peer, false, false, false));
        if (this.m_father) {
            this.m_father._fillNewSubServiceDHT(subServiceDHT);
        }
    }
}

class DHT extends DHTBase {
    /*
    PEERINFO: {
         peerid: string,
         eplist: ARRAY[ep_string], // 因为tcp端口不可复用，主动向其他peer发起的连接都可能用不同的端口，无法通过通信端口识别本地监听端口;
                                   // 所以使用tcp监听时必须用以下两种方式告知哪些地址是监听地址：
                                   // 1.eplist指定其监听EndPoint
                                   // 2.在调用process处理包时为socket.isReuseListener指定该socket是否使用了监听地址;
                                   // 而UDP协议本地发出和接收的端口就是监听端口，可以通过通信端口发现自己监听的eplist；
                                   // 初始化eplist和后面发现的监听地址都会被传播出去，而TCP主动发起连接的随机地址不会被传播；
         additionalInfo: ARRAY[[key_string, value]],
    }
    localPeerInfo: PEERINFO
     */
    constructor(mixSocket, localPeerInfo, appid = 0) {
        LOG_INFO(`DHT will be created with mixSocket:${mixSocket}, and localPeerInfo:(peerid:${localPeerInfo.peerid}, eplist:${localPeerInfo.eplist})`);
        LOG_ASSERT(Peer.isValidPeerid(localPeerInfo.peerid), `Local peerid is invalid:${localPeerInfo.peerid}.`);

        let localPeer = new LocalPeer(localPeerInfo);
        let packageFactory = new DHTPackageFactory(appid);
        let taskMgr = new TaskMgr();
        super(mixSocket, localPeer, packageFactory, taskMgr);
        this.m_taskMgr = taskMgr;
        this.m_timer = null;
        this.m_highFrequencyTimer = null;

        this.m_piecePackageRebuilder = new PiecePackageRebuilder();

        this.m_stat = {
            udp: {
                pkgs: 0,
                bytes: 0,
            },
            tcp: {
                pkgs: 0,
                bytes: 0,
            },
        }
    }

    start() {
        LOG_INFO(`LOCALPEER(${this.m_bucket.localPeer.peerid}:${this.servicePath}) will start.`);
        if (!this.m_timer) {
            this.m_timer = setInterval(() => this._update(), 1000);
            // 对进行中的任务启用更高频的定时器，让任务处理更及时，并且压力更分散
            this.m_highFrequencyTimer = setInterval(() => this.m_taskExecutor.taskMgr.wakeUpAllTask(), 200);
            
            this._activePeer(this.m_bucket.localPeer, false, false, false);
            this._update();
            setImmediate(() => this.emit(DHT.EVENT.start));
        }
    }

    stop() {
        LOG_INFO(`LOCALPEER(${this.m_bucket.localPeer.peerid}:${this.servicePath}) will stop.`);
        if (this.m_timer) {
            clearInterval(this.m_timer);
            this.m_timer = null;
            clearInterval(this.m_highFrequencyTimer);
            this.m_highFrequencyTimer = null;
            setImmediate(() => this.emit(DHT.EVENT.stop));
        }
    }

    stat() {
        let senderStat = this.m_packageSender.stat();
        return {
            udp: {
                send: {
                    pkgs: senderStat.udp.pkgs,
                    bytes: senderStat.udp.bytes,
                },
                recv: {
                    pkgs: this.m_stat.udp.pkgs,
                    bytes: this.m_stat.udp.bytes,
                }
            },
            tcp: {
                send: {
                    pkgs: senderStat.tcp.pkgs,
                    bytes: senderStat.tcp.bytes,
                },
                recv: {
                    pkgs: this.m_stat.tcp.pkgs,
                    bytes: this.m_stat.tcp.bytes,
                }
            }
        }
    }

    process(socket, message, remoteAddr, localAddr) {
        // LOG_INFO(`Got package from(${remoteAddr.address}:${remoteAddr.port})`);
        let stat = this.m_stat.tcp;
        if (remoteAddr.protocol === EndPoint.PROTOCOL.udp) {
            stat = this.m_stat.udp;
        }
        stat.pkgs++;
        stat.bytes += message.length;

        let dhtDecoder = DHTPackageFactory.createDecoder(message, 0, message.length);
        if (!dhtDecoder) {
            LOG_ERROR(`LOCALPEER(${this.m_bucket.localPeer.peerid}:${this.servicePath}) Got Invalid message:${message}.`);
            return DHTResult.INVALID_PACKAGE;
        }

        // <TODO> 检查数据包的合法性
        let cmdPackage = dhtDecoder.decode();
        if (!cmdPackage || cmdPackage.appid != this.m_packageFactory.appid) {
            LOG_WARN(`LOCALPEER(${this.m_bucket.localPeer.peerid}:${this.servicePath}) Got invalid package from(${remoteAddr.address}:${remoteAddr.port})`);
            return dhtDecoder.totalLength;
        }

        if (cmdPackage.servicePath && cmdPackage.servicePath.length) {
            LOG_INFO('[DHT]', 'servicePath: ',`${cmdPackage.servicePath}`);
        }

        let localPeer = this.m_bucket.localPeer;
        const cmdType = cmdPackage.cmdType;
        if ((cmdType != DHTCommandType.PACKAGE_PIECE_REQ && cmdPackage.dest.peerid !== localPeer.peerid)
            || !HashDistance.checkEqualHash(cmdPackage.dest.hash, localPeer.hash)) {
            LOG_WARN(`LOCALPEER(${this.m_bucket.localPeer.peerid}:${this.servicePath}) Got package from other peer(id:${cmdPackage.dest.peerid},hash:${cmdPackage.dest.hash}), localPeer is (id:${localPeer.peerid},hash:${localPeer.hash})`);
            return dhtDecoder.totalLength;
        }

        if (cmdType === DHTCommandType.PACKAGE_PIECE_REQ) {
            this._processPackagePiece(socket, cmdPackage, remoteAddr, localAddr);
            return dhtDecoder.totalLength;
        }

        if (!HashDistance.checkEqualHash(cmdPackage.src.hash, HashDistance.hash(cmdPackage.src.peerid))) {
            LOG_WARN(`LOCALPEER(${this.m_bucket.localPeer.peerid}:${this.servicePath}) Got package hash verify failed.(id:${cmdPackage.dest.peerid},hash:${cmdPackage.dest.hash}), localPeer is (id:${localPeer.peerid},hash:${localPeer.hash})`);
            return dhtDecoder.totalLength;
        }

        LOG_TRACE(`LOCALPEER(${this.m_bucket.localPeer.peerid}:${this.servicePath}) Got package(${cmdPackage.cmdType}) from(${remoteAddr.address}:${remoteAddr.port})`);
        if (cmdPackage.common.dest.ep) {
            // maintain local peer valid internet address
            localPeer.unionEplist([cmdPackage.common.dest.ep], socket.isReuseListener);
            // 被公网IPV4地址连通的包才可以用以辅助识别公网IP地址
            if (cmdPackage.src.peerid !== this.m_bucket.localPeer.peerid && 
                net.isIPv4(remoteAddr.address) && !EndPoint.isNAT(remoteAddr)) {
                localPeer.setSenderEP(cmdPackage.common.dest.ep, EndPoint.toString(localAddr));
            }
        }

        let remotePeer = new Peer(cmdPackage.common.src);
        remotePeer.address = remoteAddr;
        
        this._activePeer(remotePeer, false, true, true, null, cmdPackage);
        remotePeer = this.m_bucket.findPeer(remotePeer.peerid) || remotePeer;
        this._process(cmdPackage, remotePeer);

        this.m_routeTable.onRecvPackage(cmdPackage, socket, remotePeer, remoteAddr);

        if (cmdPackage.nodes) {
            cmdPackage.nodes.forEach(node => {
                if (this.m_bucket.isExpandable(node.id)) {
                    this.m_taskExecutor.handshakeSource({peerid: node.id, eplist: node.eplist}, remotePeer, false, true);
                }
            });
        }

        return dhtDecoder.totalLength;
    }

    // 为了减少对应用层活动PEER的ping包，初始化中传入的socket上发送/接收任何包，应该通知一下DHT；
    // DHT模块可以减少对这些PEER的ping操作；
    // 启动时的初始节点也通过该接口传入；
    // remotePeerInfo：PEERINFO
    activePeer(remotePeerInfo, address, isSent, isReceived) {
        LOG_ASSERT(Peer.isValidPeerid(remotePeerInfo.peerid), `ActivePeer peerid is invalid:${remotePeerInfo.peerid}.`);
        if (!Peer.isValidPeerid(remotePeerInfo.peerid)) {
            return DHTResult.INVALID_ARGS;
        }

        let remotePeer = new Peer(remotePeerInfo);
        remotePeer.address = address;

        LOG_INFO(`LOCALPEER(${this.m_bucket.localPeer.peerid}:${this.servicePath}) got new PEER(${remotePeerInfo.peerid}:${remotePeerInfo.eplist}) from user.`);
        this._activePeer(remotePeer, isSent, isReceived, false);
        return DHTResult.SUCCESS;
    }

    ping(remotePeerInfo) {
        LOG_ASSERT(Peer.isValidPeerid(remotePeerInfo.peerid), `ActivePeer peerid is invalid:${remotePeerInfo.peerid}.`);
        if (!Peer.isValidPeerid(remotePeerInfo.peerid)) {
            return DHTResult.INVALID_ARGS;
        }
        this.m_routeTable.ping(remotePeerInfo);
    }

    updateLocalPeerAdditionalInfo(keyName, newValue) {
        LOG_INFO(`LOCALPEER(${this.m_bucket.localPeer.peerid}:${this.servicePath}) updateLocalPeerAdditionalInfo (${keyName}:${newValue}).`);
        this.m_bucket.localPeer.updateAdditionalInfo(keyName, newValue);
    }

    getLocalPeerAdditionalInfo(keyName) {
        LOG_INFO(`LOCALPEER(${this.m_bucket.localPeer.peerid}:${this.servicePath}) getLocalPeerAdditionalInfo (${keyName}).`);
        return this.m_bucket.localPeer.getAdditionalInfo(keyName);
    }

    deleteLocalPeerAdditionalInfo(keyName) {
        LOG_INFO(`LOCALPEER(${this.m_bucket.localPeer.peerid}:${this.servicePath}) deleteLocalPeerAdditionalInfo (${keyName}).`);
        return this.m_bucket.localPeer.deleteAdditionalInfo(keyName);
    }

    _update() {
        this.m_piecePackageRebuilder.clearTimeoutTasks();
        super._update()
    }

    _processPackagePiece(socket, cmdPackage, remoteAddr, localAddr) {
        LOG_INFO(`LOCALPEER(${this.m_bucket.localPeer.peerid}:${this.servicePath}) got package piece (taskid:${cmdPackage.body.taskid},max:${cmdPackage.body.max},no:${cmdPackage.body.no}).`);
        let respPackage = this.m_packageFactory.createPackage(DHTCommandType.PACKAGE_PIECE_RESP);
        respPackage.common.ackSeq = cmdPackage.common.seq;
        respPackage.body = {
            taskid: cmdPackage.body.taskid,
            no: cmdPackage.body.no,
        };

        let remotePeerInfo = {
            peerid: cmdPackage.body.peerid,
            eplist: [EndPoint.toString(remoteAddr)],
        };
        this.m_packageSender.sendPackage(remotePeerInfo, respPackage);

        let originalPackageBuffer = this.m_piecePackageRebuilder.onGotNewPiece(cmdPackage);
        if (originalPackageBuffer) {
            process.nextTick(() => this.process(socket, originalPackageBuffer, remoteAddr, localAddr));
        }
    }

    _onNewTouch(peer, cmdPackage) {
        // 统计一些数据，识别本地peer的网络环境
        if (cmdPackage) {
            if (DHTPackage.CommandType.isResp(cmdPackage.cmdType)) {
                this.m_bucket.localPeer.passivePeerCountInc();
            } else {
                this.m_bucket.localPeer.incomingPeerCountInc();
            }
        }
    }
}

DHT.EVENT = {
    start: 'start',
    stop: 'stop',
};

DHT.RESULT = DHTResult;
DHT.Package = DHTPackage;

class ServiceDHT extends DHTBase {
    constructor(father, serviceID) {
        super(father.m_packageSender.mixSocket,
            father.m_bucket.localPeer,
            father.m_packageFactory,
            father.m_taskExecutor.taskMgr);

        this.m_father = father;
        this.m_serviceID = serviceID;

        if (father.servicePath.length > 0) {
            this.m_servicePath = [...father.servicePath, this.serviceID];
        } else {
            this.m_servicePath = [this.serviceID];
        }
        this.m_taskExecutor.servicePath = this.m_servicePath;
        this.m_packageProcessor.servicePath = this.m_servicePath;
        this.m_flags = 0;
    }

    get servicePath() {
        return this.m_servicePath;
    }

    get serviceID() {
        return this.m_serviceID;
    }

    signinVistor() {
        LOG_INFO(`LOCALPEER(${this.m_bucket.localPeer.peerid}:${this.servicePath}) signinVistor.`);
        let isRunningBefore = this.isRunning();
        this.m_flags |= ServiceDHT.FLAGS_SIGNIN_VISTOR;

        if (!isRunningBefore) {
            this._onStartWork();
        }
    }

    signoutVistor() {
        LOG_INFO(`LOCALPEER(${this.m_bucket.localPeer.peerid}:${this.servicePath}) signoutVistor.`);
        this.m_flags &= ~ServiceDHT.FLAGS_SIGNIN_VISTOR;
        if (this.m_subServiceDHTs.size === 0 && !this.isRunning()) {
            this.m_father._onSubServiceDHTOffWork(this);
        }
    }

    signinServer() {
        LOG_INFO(`LOCALPEER(${this.m_bucket.localPeer.peerid}:${this.servicePath}) signinServer.`);
        let isRunningBefore = this.isRunning();
        this.m_flags |= ServiceDHT.FLAGS_SIGNIN_SERVER;
        let localPeer = this.m_bucket.localPeer;
        localPeer.signinService(this.m_servicePath);
        this.m_bucket.activePeer(localPeer);
        if (!isRunningBefore) {
            this._onStartWork();
        }
    }

    signoutServer() {
        LOG_INFO(`LOCALPEER(${this.m_bucket.localPeer.peerid}:${this.servicePath}) signoutServer.`);
        this.m_flags &= ~ServiceDHT.FLAGS_SIGNIN_SERVER;
        let localPeer = this.m_bucket.localPeer;
        localPeer.signoutService(this.m_servicePath);
        this.m_bucket.removePeer(localPeer.peerid);
        if (this.m_subServiceDHTs.size === 0 && !this.isRunning()) {
            this.m_father._onSubServiceDHTOffWork(this);
        }
    }

    updateServiceInfo(key, value) {
        LOG_INFO(`LOCALPEER(${this.m_bucket.localPeer.peerid}:${this.servicePath}) updateServiceInfo(${key}:${value}).`);
        this.m_bucket.localPeer.updateServiceInfo(this.m_servicePath, key, value);
    }

    getServiceInfo(key) {
        LOG_INFO(`LOCALPEER(${this.m_bucket.localPeer.peerid}:${this.servicePath}) getServiceInfo(${key}).`);
        let value = this.m_bucket.localPeer.getServiceInfo(this.m_servicePath, key);
        LOG_INFO(`LOCALPEER(${this.m_bucket.localPeer.peerid}:${this.servicePath}) getServiceInfo(${key}:${value}).`);
        return value;
    }

    deleteServiceInfo(key) {
        LOG_INFO(`LOCALPEER(${this.m_bucket.localPeer.peerid}:${this.servicePath}) deleteServiceInfo(${key}).`);
        this.m_bucket.localPeer.deleteServiceInfo(this.m_servicePath, key);
    }

    isRunning() {
        return this.m_flags != 0;
    }

    _onStartWork() {
        this.m_father._onSubServiceDHTStartWork(this);
        if (this.m_subServiceDHTs) {
            this.m_subServiceDHTs.forEach(subSrv => subSrv._onSuperServiceStartWork(this));
        }
    }

    _onSuperServiceStartWork(superService) {
        this.m_bucket.forEachPeer(peer => superService._activePeer(peer, false, false, false));
        if (this.m_subServiceDHTs) {
            this.m_subServiceDHTs.forEach(subSrv => subSrv._onSuperServiceStartWork(superService));
        }
    }
}
ServiceDHT.FLAGS_SIGNIN_VISTOR = 0x1;
ServiceDHT.FLAGS_SIGNIN_SERVER = 0x1 << 1;

module.exports = DHT;