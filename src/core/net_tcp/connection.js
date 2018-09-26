"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const error_code_1 = require("../error_code");
const net_1 = require("../net");
class TcpConnection extends net_1.IConnection {
    constructor(options) {
        super();
        this.m_nTimeDelta = 0;
        this.m_socket = options.socket;
        this.m_socket.on('drain', () => {
            this.m_pending = false;
            this.emit('drain');
        });
        this.m_socket.on('data', (data) => {
            this.emit('data', [data]);
        });
        this.m_socket.on('error', (err) => {
            this.emit('error', this, error_code_1.ErrorCode.RESULT_EXCEPTION);
        });
        this.m_pending = false;
        this.m_remote = options.remote;
    }
    send(data) {
        if (this.m_pending) {
            return 0;
        }
        else {
            this.m_pending = !this.m_socket.write(data);
            return data.length;
        }
    }
    close() {
        if (this.m_socket) {
            this.m_socket.end();
            delete this.m_socket;
        }
        this.emit('close', this);
        return Promise.resolve(error_code_1.ErrorCode.RESULT_OK);
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
exports.TcpConnection = TcpConnection;
