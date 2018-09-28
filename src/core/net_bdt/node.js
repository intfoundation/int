"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const error_code_1 = require("../error_code");
const net_1 = require("../net");
const connection_1 = require("./connection");
const { P2P, Util } = require('bdt-p2p');
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
            file_name: 'bdt',
        });
        // 初始化 bdt
        await this.createBDTStack();
    }
    async createBDTStack() {
        // let randomPort = DHTUtil.RandomGenerator.integer(65525, 2048);
        // bdt 里0.0.0.0 只能找到公网ip, 这样会导致单机多进程或单机单进程的节点找不到对方
        // 为了方便测试， 补充加入本机的内网192 IP
        let ips = Util.NetHelper.getLocalIPV4().filter((ip) => ip.match(/^192.168.\d+.\d+/));
        let addrList = [this.m_host, ...ips];
        let bdtInitParams = {};
        bdtInitParams['peerid'] = this.m_peerid;
        bdtInitParams['dhtEntry'] = [this.m_options.snPeer];
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
        let { result, p2p, bdtStack } = await P2P.create4BDTStack(bdtInitParams);
        // 检查是否创建成功
        if (result !== 0) {
            throw Error(`init p2p peer error ${result}. please check the params`);
        }
        this.m_snPeerid = this.m_options.snPeer.peerid;
        this.m_dht = p2p.m_dht;
        this.m_bdtStack = bdtStack;
        // 启动p2p的时候 先把当前peer的ready设置为0， 避免在listen前被其他节点发现并连接
        this.m_dht.updateLocalPeerAdditionalInfo('ready', 0);
    }
    _ready() {
        this.m_dht.updateLocalPeerAdditionalInfo('ready', 1);
    }
    async randomPeers(count, excludes) {
        let res = await this.m_dht.getRandomPeers(count, false);
        this.m_logger.info(`first find ${res.peerlist.length} peers, ${JSON.stringify(res.peerlist.map((value) => value.peerid))}`);
        const ignore0 = !res || !res.peerlist || res.peerlist.length === 0;
        // 过滤掉自己和种子peer
        let peers = res.peerlist.filter((val) => {
            if (!val.peerid) {
                this.m_logger.debug(`exclude undefined peerid, ${JSON.stringify(val)}`);
                return false;
            }
            if (this.m_skipList.includes(val.peerid)) {
                this.m_logger.debug(`exclude ${val.peerid} from skipList`);
                return false;
            }
            if (excludes.includes(val.peerid)) {
                this.m_logger.debug(`exclude ${val.peerid} from excludesList`);
                return false;
            }
            let ready = val.getAdditionalInfo('ready');
            if (ready !== 1) {
                this.m_logger.debug(`exclude ${val.peerid} not ready`);
                return false;
            }
            return true;
        });
        if (peers.length === 0) {
            peers = this.m_dht.getAllOnlinePeers();
            this.m_logger.info(`get none from randomPeers, get ${peers.length} from AllOnlinePeers`);
            peers = peers.filter((val) => {
                if (!val.peerid) {
                    this.m_logger.debug(`exclude undefined peerid, ${JSON.stringify(val)}`);
                    return false;
                }
                if (this.m_skipList.includes(val.peerid)) {
                    this.m_logger.debug(`exclude ${val.peerid} from skipList`);
                    return false;
                }
                if (excludes.includes(val.peerid)) {
                    this.m_logger.debug(`exclude ${val.peerid} from excludesList`);
                    return false;
                }
                let ready = val.getAdditionalInfo('ready');
                if (ready !== 1) {
                    this.m_logger.debug(`exclude ${val.peerid} not ready`);
                    return false;
                }
                return true;
            });
        }
        let peerids = peers.map((value) => value.peerid);
        this.m_logger.info(`find ${peerids.length} peers after filter, count ${count}, ${JSON.stringify(peerids)}`);
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
