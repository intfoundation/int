"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
let XMLHttpRequest = require('xmlhttprequest').XMLHttpRequest;
class RPCClient {
    constructor(serveraddr, port, logger) {
        this.logger = logger;
        this.m_url = 'http://' + serveraddr + ':' + port + '/rpc';
    }
    call(funName, funcArgs, onComplete) {
        let sendObj = {
            funName,
            args: funcArgs
        };
        this.logger.info(`RPCClient send request ${sendObj.funName}, params ${JSON.stringify(sendObj.args)}`);
        const xmlhttp = new XMLHttpRequest();
        xmlhttp.onreadystatechange = () => {
            if (xmlhttp.readyState === 4) {
                if (xmlhttp.status === 200) {
                    let strResp = xmlhttp.responseText;
                    onComplete(strResp, xmlhttp.status);
                }
                else {
                    onComplete(null, xmlhttp.status);
                }
            }
        };
        xmlhttp.ontimeout = (err) => {
            onComplete(null, 504);
        };
        xmlhttp.open('POST', this.m_url, true);
        xmlhttp.setRequestHeader('Content-Type', 'application/json');
        xmlhttp.send(JSON.stringify(sendObj));
    }
    async callAsync(funcName, funcArgs) {
        return new Promise((reslove, reject) => {
            this.call(funcName, funcArgs, (resp, statusCode) => {
                reslove({ resp, ret: statusCode });
            });
        });
    }
}
exports.RPCClient = RPCClient;
