"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const error_code_1 = require("../error_code");
const net_1 = require("net");
const net_2 = require("../net");
const connection_1 = require("./connection");
const assert = require('assert');
class TcpNode extends net_2.INode {
    constructor(options) {
        super({ peerid: `${options.host}:${options.port}`, logger: options.logger, loggerOptions: options.loggerOptions });
        this.m_options = Object.create(null);
        Object.assign(this.m_options, options);
        this.m_server = new net_1.Server();
    }
    _connectTo(peerid) {
        let [host, port] = peerid.split(':');
        let tcp = new net_1.Socket();
        return new Promise((resolve, reject) => {
            tcp.once('error', (e) => {
                tcp.removeAllListeners('connect');
                resolve({ err: error_code_1.ErrorCode.RESULT_EXCEPTION });
            });
            tcp.connect({ host, port: parseInt(port, 10) });
            tcp.once('connect', () => {
                let connNodeType = this._nodeConnectionType();
                let connNode = (new connNodeType(this, { socket: tcp, remote: peerid }));
                tcp.removeAllListeners('error');
                tcp.on('error', (e) => {
                    this.emit('error', connNode, error_code_1.ErrorCode.RESULT_EXCEPTION);
                });
                resolve({ err: error_code_1.ErrorCode.RESULT_OK, conn: connNode });
            });
        });
    }
    _connectionType() {
        return connection_1.TcpConnection;
    }
    listen() {
        return new Promise((resolve, reject) => {
            this.m_server.listen(this.m_options.port, this.m_options.host);
            this.m_server.once('listening', () => {
                this.m_server.removeAllListeners('error');
                this.m_server.on('connection', (tcp) => {
                    let connNodeType = this._nodeConnectionType();
                    let connNode = (new connNodeType(this, { socket: tcp, remote: `${tcp.remoteAddress}:${tcp.remotePort}` }));
                    tcp.on('error', (e) => {
                        this.emit('error', connNode, error_code_1.ErrorCode.RESULT_EXCEPTION);
                    });
                    this._onInbound(connNode);
                });
                resolve(error_code_1.ErrorCode.RESULT_OK);
            });
            this.m_server.once('error', (e) => {
                this.m_server.removeAllListeners('listening');
                reject(error_code_1.ErrorCode.RESULT_EXCEPTION);
            });
        });
    }
}
exports.TcpNode = TcpNode;
