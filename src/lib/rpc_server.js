"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const events_1 = require("events");
const http = require("http");
class RPCServer extends events_1.EventEmitter {
    constructor(listenaddr, port) {
        super();
        this.m_addr = listenaddr;
        this.m_port = port;
    }
    on(event, listener) {
        return super.on(event, listener);
    }
    start() {
        if (this.m_server) {
            return;
        }
        this.m_server = http.createServer();
        this.m_server.on('request', (req, resp) => {
            if (req.url !== '/rpc' || req.method !== 'POST') {
                resp.writeHead(404);
                resp.end();
            }
            else {
                let jsonData = '';
                req.on('data', (chunk) => {
                    jsonData += chunk;
                });
                req.on('end', () => {
                    let reqObj = JSON.parse(jsonData);
                    console.info(`RPCServer emit request ${reqObj.funName}, params ${JSON.stringify(reqObj.args)}`);
                    if (!this.emit(reqObj.funName, reqObj.args, resp)) {
                        resp.writeHead(404);
                        resp.end();
                    }
                });
            }
        });
        this.m_server.listen(this.m_port, this.m_addr);
    }
    stop() {
        if (this.m_server) {
            this.m_server.close();
            delete this.m_server;
        }
    }
}
exports.RPCServer = RPCServer;
