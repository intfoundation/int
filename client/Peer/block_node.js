//BlockNode是区块链存储数据的基础Node，可以用过P2P网络发送和接收区块链协议的包，有存储区块链信息的能力

"use strict";
const bdt = require('../../bdt/bdt');
const P2P = require('../../p2p/p2p');
const DPackage = require('./package');
const EventEmitter = require('events');

//verify version in DServer
class BlockNode extends EventEmitter {
    /*
    params: {
        peerid: 
        eplist:
        udp: {
            addrList:
            port:
        },
        tcp: {
            addrList:
            port:
        },
        dht: [
            {
                peerid:
                eplist:
        }],
        storagePath: 
    }
    */
    constructor(params) {
        super();
        // try get addrlist if addrList is NULL
        if ((!params.udp || !params.udp.addrList || !params.udp.addrList.length) &&
            (!params.tcp || !params.tcp.addrList || !params.tcp.addrList.length)) {
            params.udp = {
                addrList: ['0.0.0.0'], //Util.getLocalIPs();
            };
        }
        this.peerid = params.peerid;
        this.m_udp = params.udp;
        this.m_tcp = params.tcp;
        this.m_dhtEntry = params.snDHT;

        this.m_p2p = null;
        this.m_bdt = null;
        this.m_acceptor = null;
        this.m_vport = params.vport;

        this.m_conns = new Map();

        this.version = 0;
    }

    _supportVersion(version) {
        return this.version === version;
    }

    async _createBDT() {
        function initServerParams(params) {
            let server = {};
            if (params && params.addrList && params.addrList.length > 0) {
                server.addrList = [...params.addrList];
            } else {
                return;
            }

            server.initPort = params.port || 0;
            server.maxPortOffset = params.maxPortOffset || 0;
            if (!server.initPort) {
                server.maxPortOffset = 0;
            }
            return server;
        }

        let udpServer = initServerParams(this.m_udp);
        let tcpServer = initServerParams(this.m_tcp);
        let {result, p2p} = await P2P.create({
                peerid: this.peerid,
                udp: udpServer,
                tcp: tcpServer,
                dhtEntry: this.m_dhtEntry,
            });
        
        if (result !== bdt.Error.success) {
            return Promise.resolve(BlockNode.ERROR.networkError);
        }

        this.m_p2p = p2p;
        result = await this.m_p2p.startupBDTStack();
        if (result !== bdt.Error.success) {
            return Promise.resolve(BlockNode.ERROR.networkError);
        }

        this.m_bdt = this.m_p2p.bdtStack;

        this.m_acceptor = this.m_bdt.newAcceptor({ vport: this.m_vport });
        this.m_acceptor.listen();
        this.m_acceptor.on(bdt.Acceptor.EVENT.connection, (conn) => {
            conn.on(bdt.Connection.EVENT.error, () => {
                //do nothing.
            });
            let dreader = DPackage.createStreamReader(conn);
            dreader.once(DPackage.Reader.EVENT.pkg, (pkg) => {
                if (pkg.header.cmdType === DPackage.CMD_TYPE.version) {
                    let accept = this._supportVersion(pkg.header.version);
                    let dwriter = DPackage.createStreamWriter({ cmdType: DPackage.CMD_TYPE.versionAck }, { accept: accept }).bind(conn);
                    dwriter.once('error', () => {
                        conn.close();
                    });
                    dwriter.once(DPackage.Writer.EVENT.finish, () => {
                        if (accept) {
                            this._onBound(conn, dreader);
                        } else {
                            dreader.close();
                            conn.close();
                        }
                    });
                } else {
                    dreader.close();
                    conn.close();
                }
            });
            dreader.once(DPackage.Reader.EVENT.error, () => {
                dreader.close();
                conn.close();
            });
        });
        return Promise.resolve(BlockNode.ERROR.success);
    }

    async _createStack() {
        await this._createBDT();
    }

    _setConn(conn, reader) {
        this.m_conns.set(conn.remote.peerid, [conn, reader]);
    }

    _haveConn(peerid) {
        return this.m_conns.has(peerid) && this.m_conns.get(peerid).m_state === bdt.Connection.STATE.establish;
    }

    _getConn(peerid) {
        if (!this.m_conns.has(peerid)) {
            return null;
        }

        let [conn, reader] = this.m_conns.get(peerid);
        return conn;
    }
    _removeConn(peerid) {
        this.m_conns.delete(peerid);
    }

    async establishConnToPeers(peerids){
        let ops = [];

        for (const peerid of peerids) {
            ops.push(this.getConnToPeer(peerid));
        }
        
        return Promise.all(ops);
    }

    async getConnToPeer(peerid) {
        let conn = this._getConn(peerid);
        if (conn && conn.m_state !== bdt.Connection.STATE.establish) {
            conn = null;
        }

        if (!conn) {
            return new Promise(async (reslove, reject) => {
                let ret = null;
                let errors = await this._connectTo([{ peerid: peerid }], (conn) => {
                    ret = conn;
                });
                reslove([errors[0], ret, peerid]);
            });
        } else {
            return [0, conn, peerid];
        }
    }

    _onBound(conn, reader) {
        this._setConn(conn, reader);
        reader.on(DPackage.Reader.EVENT.pkg, (pkg) => {
            this._onPkg(conn, pkg);
        });
        conn.on(bdt.Connection.EVENT.error, () => {
            this._removeConn(conn.remote.peerid);
            this.emit("OnConnBreakof");
            reader.close();
        });
        conn.on(bdt.Connection.EVENT.close, () => {
            this._removeConn(conn.remote.peerid);
            reader.close();
        });
    }
    
    async _connectTo(peers, firstOp) {
        let op = [];
        for (let peer of peers) {
            op.push(
                new Promise((resolve) => {
                    let conn = this.m_bdt.newConnection();
                    conn.bind();
                    conn.connect({
                        peerid: peer.peerid,
                        vport: this.m_vport
                    });
                    conn.once(bdt.Connection.EVENT.error, (err) => {
                        conn.close();
                        resolve(BlockNode.ERROR.connectionError+err);
                    });
                    conn.once(bdt.Connection.EVENT.connect, () => {
                        let dwriter = DPackage.createStreamWriter({ cmdType: DPackage.CMD_TYPE.version }).bind(conn);
                        dwriter.once(DPackage.Writer.EVENT.error, () => {
                            conn.close();
                        });
                        let dreader = DPackage.createStreamReader(conn);
                        dreader.once(DPackage.Reader.EVENT.pkg, (pkg) => {
                            if (pkg.header.cmdType === DPackage.CMD_TYPE.versionAck) {
                                if (pkg.body.accept) {
                                    this._onBound(conn, dreader);
                                    if (firstOp) {
                                        firstOp(conn);
                                    }
                                    resolve(BlockNode.ERROR.success);
                                } else {
                                    conn.close();
                                    conn.release();
                                    resolve(BlockNode.ERROR.versionMismatch);
                                }
                            } else {
                                conn.close();
                                conn.release();
                                resolve(BlockNode.ERROR.invalidState);
                            }
                        });
                        dreader.once(DPackage.Reader.EVENT.error, () => {
                            conn.close();
                            conn.release();
                            resolve(BlockNode.ERROR.networkError);
                        });
                    });
                })
            );
        }
        return await Promise.all(op);
    }

    _broadcast(writer, count = 1, filter, sendcb) {
        let writeCount = 0;
        let writeOnConn = (conn) => {
            if (filter && !filter(conn)) {
                return true;
            }
            let dwriter = writer.clone().bind(conn);
            if (sendcb) {
                sendcb(conn);
            }
            writeCount += 1;
            if (count > 0 && writeCount >= count) {
                return false;
            }
            return true;
        };
        let willContinue = true;
        for (let [peerid,[conn, reader]] of this.m_conns) {
            if (conn.m_state === bdt.Connection.STATE.establish) {
                willContinue = writeOnConn(conn);
                if (!willContinue) {
                    break;
                }
            }
        }
        
        return writeCount;
    }


    _onPkg(conn, pkg) {
        throw new Error('_onPkg function MUST implemented by Node!');
    }

    close() {
        this.m_acceptor.close();
        this.m_acceptor = null;
        this.m_p2p.close();
        this.m_bdt = null;
        this.m_p2p = null;
    }
}

BlockNode.ERROR = {
    success: 0,
    invalidState: 1,
    networkError: 2,
    versionMismatch: 3,
    connectionError: 10000,
};

module.exports = BlockNode;