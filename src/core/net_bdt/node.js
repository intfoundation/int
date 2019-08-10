"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const error_code_1 = require("../error_code");
const net_1 = require("../net");
const connection_1 = require("./connection");
const { P2P, Util, DHTAPPID } = require('bdt-p2p');
class BdtNode extends net_1.INode {
    // 初始化传入tcp port和udp port，传入0就不监听对应协议
    // @param options { 
    //              logger.level ['off', 'all', 'debug', 'info', 'trace', 'warn']
    // }
    constructor(options) {
        super(options);
        // vport 只是提供给bdt connect的一个抽象，可以不用在调用时传入
        // 先定死， bdt connect 和 listen都先用这个
        this.m_vport = 3000;
        this.m_skipList = [];
        this.m_tcpListenPort = options.tcpport;
        this.m_udpListenPort = options.udpport;
        this.m_host = options.host;
        this.m_options = Object.create(null);
        Object.assign(this.m_options, options);
        this.m_skipList.push(options.peerid);
        this.m_skipList.push(this.m_options.snPeer.peerid);
        this.m_bdtStack = undefined;
    }
    async init() {
        if (this.m_bdtStack) {
            return;
        }
        // bdt 的log控制参数
        P2P.debug({
            level: this.m_options.bdtLoggerOptions.level,
            file_dir: this.m_options.bdtLoggerOptions.file_dir,
            file_name: this.m_options.bdtLoggerOptions.file_name,
        });
        // 初始化 bdt
        await this.createBDTStack();
    }
    async createBDTStack() {
        // let randomPort = DHTUtil.RandomGenerator.integer(65525, 2048);
        // bdt 里0.0.0.0 只能找到公网ip, 这样会导致单机多进程或单机单进程的节点找不到对方
        // 为了方便测试， 补充加入本机的内网192 IP
        // 从配置文件里读取初始的DHT表
        let ips = Util.NetHelper.getLocalIPV4().filter((ip) => ip.match(/^192.168.\d+.\d+/));
        let addrList = [this.m_host, ...ips];
        let dhtEntry = [this.m_options.snPeer];
        if (this.m_options.initDHTEntry) {
            dhtEntry = dhtEntry.concat(this.m_options.initDHTEntry);
        }
        let bdtInitParams = {};
        bdtInitParams['peerid'] = this.m_peerid;
        if (this.m_tcpListenPort !== 0) {
            bdtInitParams['tcp'] = {
                addrList,
                initPort: this.m_tcpListenPort,
                maxPortOffset: 0,
            };
        }
        if (this.m_udpListenPort !== 0) {
            bdtInitParams['udp'] = {
                addrList,
                initPort: this.m_udpListenPort,
                maxPortOffset: 0,
            };
        }
        // 增加指定地址
        // 部分机器会因为监听'0.0.0.0'相同端口，监听本地IP时发生冲突，最终漏掉本地地址，导致同局域网地址连接不上
        let listenerEPList = [];
        addrList.forEach((host) => {
            listenerEPList.push(Util.EndPoint.toString({ address: host, port: this.m_tcpListenPort, family: Util.EndPoint.FAMILY.IPv4, protocol: Util.EndPoint.PROTOCOL.tcp }));
            listenerEPList.push(Util.EndPoint.toString({ address: host, port: this.m_udpListenPort, family: Util.EndPoint.FAMILY.IPv4, protocol: Util.EndPoint.PROTOCOL.udp }));
        });
        bdtInitParams['listenerEPList'] = listenerEPList;
        let { result, p2p } = await P2P.create(bdtInitParams);
        if (result !== 0) {
            throw Error(`init p2p peer error ${result}. please check the params`);
        }
        // 加入区块链应用DHT网络，并做为默认DHT网络，准备妥当再正式提供服务
        p2p.joinDHT(dhtEntry, { manualActiveLocalPeer: true, dhtAppID: this.m_options.dhtAppID, asDefault: true });
        this.m_logger.info(`bdt add network use id ${this.m_options.dhtAppID}`);
        // 加入SN的DHT网络，用于通信穿透，但不参与SN服务
        p2p.joinDHT(dhtEntry, { manualActiveLocalPeer: true, dhtAppID: DHTAPPID.sn });
        result = await p2p.startupBDTStack(bdtInitParams.options);
        if (result !== 0) {
            throw Error(`init p2p peer error ${result}. please check the params`);
        }
        this.m_dht = p2p.dht;
        this.m_bdtStack = p2p.bdtStack;
        this.m_p2p = p2p;
    }
    _ready() {
        this.m_dht.rootDHT.activeLocalPeer();
    }
    // 将某个connection加入黑名单：addBlackList(conn.remote.peerid, conn.remote.endpoint)
    // ban掉某个IP地址：addBlackList(ipstring)
    // ban掉某个PEERID：addBlackList(undefined, peerid)
    addBlackList(peerid, ip) {
        if (this.m_p2p) {
            this.m_p2p.forbid(ip ? ip : P2P.FORBID.all, peerid ? peerid : P2P.FORBID.all);
        }
    }
    async randomPeers(count, excludes) {
        // 过滤掉自己和种子peer
        const filter = (peer) => {
            if (!peer.peerid) {
                // this.m_logger.debug(`exclude undefined peerid, ${JSON.stringify(peer)}`);
                return false;
            }
            if (this.m_skipList.includes(peer.peerid)) {
                // this.m_logger.debug(`exclude ${peer.peerid} from skipList`);
                return false;
            }
            if (excludes.has(peer.peerid)) {
                // this.m_logger.debug(`exclude ${peer.peerid} from excludesList`);
                return false;
            }
            return true;
        };
        let res = await this.m_dht.getRandomPeers(count, false, { filter });
        // this.m_logger.info(`first find ${res.peerlist.length} peers, ${JSON.stringify(res.peerlist.map((value: any) => value.peerid))}`);
        const ignore0 = !res || !res.peerlist || res.peerlist.length === 0;
        const peers = (res && res.peerlist) ? res.peerlist : [];
        let peerids = peers.map((value) => value.peerid);
        // this.m_logger.info(`find ${peerids.length} peers after filter, count ${count}, ${JSON.stringify(peerids)}`);
        // 如果peer数量比传入的count多， 需要随机截取
        if (peerids.length > count) {
            let temp_peerids = [];
            for (let i = 0; i < count - 1; i++) {
                let idx = Math.floor(Math.random() * peerids.length);
                temp_peerids.push(peerids[idx]);
                peerids.splice(idx, 1);
            }
            peerids = temp_peerids;
        }
        let errCode = peerids.length > 0 ? error_code_1.ErrorCode.RESULT_OK : error_code_1.ErrorCode.RESULT_SKIPPED;
        return { err: errCode, peers: peerids, ignore0 };
    }
    _connectTo(peerid) {
        let vport = this.m_vport;
        let connection = this.m_bdtStack.newConnection();
        connection.bind(null);
        return new Promise((resolve, reject) => {
            connection.connect({
                peerid,
                vport,
            });
            connection.on(P2P.Connection.EVENT.close, () => {
                resolve({ err: error_code_1.ErrorCode.RESULT_EXCEPTION });
            });
            connection.on(P2P.Connection.EVENT.error, (error) => {
                console.log('Connection error', peerid, error);
                resolve({ err: error_code_1.ErrorCode.RESULT_EXCEPTION });
            });
            connection.on(P2P.Connection.EVENT.connect, () => {
                let connNodeType = this._nodeConnectionType();
                let connNode = (new connNodeType(this, { bdt_connection: connection, remote: peerid }));
                resolve({ err: error_code_1.ErrorCode.RESULT_OK, conn: connNode });
            });
        });
    }
    _connectionType() {
        return connection_1.BdtConnection;
    }
    uninit() {
        // TODO:
        return super.uninit();
    }
    listen() {
        return new Promise((resolve, reject) => {
            const acceptor = this.m_bdtStack.newAcceptor({
                vport: this.m_vport,
            });
            acceptor.listen();
            // listen 之后 peer ready(上层chain node 已经准备好，被发现)
            this._ready();
            acceptor.on(P2P.Acceptor.EVENT.close, () => {
                acceptor.close();
            });
            acceptor.on(P2P.Acceptor.EVENT.connection, (bdt_connection) => {
                const remoteObject = bdt_connection.remote;
                const remote = `${remoteObject.peerid}:${remoteObject.vport}`;
                let connNodeType = this._nodeConnectionType();
                let connNode = (new connNodeType(this, { bdt_connection, remote }));
                // 调用_onInbound, 将成功的连接保存
                this._onInbound(connNode);
            });
            acceptor.on('error', () => {
                reject(error_code_1.ErrorCode.RESULT_EXCEPTION);
            });
            resolve(error_code_1.ErrorCode.RESULT_OK);
        });
    }
}
exports.BdtNode = BdtNode;
