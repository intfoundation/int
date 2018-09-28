"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const error_code_1 = require("../error_code");
const net_1 = require("../net");
const { P2P } = require('bdt-p2p');
class BdtConnection extends net_1.IConnection {
    constructor(options) {
        super();
        this.m_nTimeDelta = 0;
        this.m_bdt_connection = options.bdt_connection;
        this.m_bdt_connection.on(P2P.Connection.EVENT.drain, () => {
            this.emit('drain');
        });
        this.m_bdt_connection.on(P2P.Connection.EVENT.data, (data) => {
            this.emit('data', data);
        });
        this.m_bdt_connection.on(P2P.Connection.EVENT.error, () => {
            this.emit('error', this, error_code_1.ErrorCode.RESULT_EXCEPTION);
        });
        this.m_bdt_connection.on(P2P.Connection.EVENT.end, () => {
            // 对端主动关闭了连接，这里先当break一样处理
            // this.emit('error', this, ErrorCode.RESULT_EXCEPTION);
        });
        this.m_bdt_connection.on(P2P.Connection.EVENT.close, () => {
            this.emit('close', this);
        });
        this.m_remote = options.remote;
    }
    send(data) {
        return this.m_bdt_connection.send(data);
    }
    close() {
        if (this.m_bdt_connection) {
            this.m_bdt_connection.close();
            delete this.m_bdt_connection;
        }
        return Promise.resolve(error_code_1.ErrorCode.RESULT_OK);
    }
    destroy() {
        if (this.m_bdt_connection) {
            this.m_bdt_connection.close(true);
            delete this.m_bdt_connection;
        }
        return Promise.resolve();
    }
    getRemote() {
        return this.m_remote;
    }
    setRemote(s) {
        this.m_remote = s;
    }
    getTimeDelta() {
        return this.m_nTimeDelta;
    }
    setTimeDelta(n) {
        this.m_nTimeDelta = n;
    }
}
exports.BdtConnection = BdtConnection;
