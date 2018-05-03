'use strict';

const HTTP = require('http')
const EventEmitter = require('events').EventEmitter;

class RPCServer extends EventEmitter {
    constructor(listenaddr, port) {
        super();
        this.m_addr = listenaddr;
        this.m_port = port;
        this.m_server = null;
    }

    Start() {
        if (this.m_server) {
            return;
        }
        this.m_server = HTTP.createServer();
        this.m_server.on('request', (req, resp) => {
            if (req.url !== '/rpc' || req.method !== 'POST') {
                resp.writeHead(404);
                resp.end();
            } else {
                let jsonData = '';
                req.on('data', (chunk) => {
                    jsonData += chunk;
                });
                req.on('end', () => {
                    let reqObj = JSON.parse(jsonData);
                    if (!this.emit(reqObj.funName, reqObj.args, resp)) {
                        resp.writeHead(404);
                        resp.end();
                    }
                    
                });
            }
        });

        this.m_server.listen(this.m_port, this.m_addr);
    }

    Stop() {
        if (this.m_server) {
            this.m_server.close();
        }
    }
}

module.exports = RPCServer;