'use strict';

const XMLHttpRequest = require('xmlhttprequest').XMLHttpRequest;

class RPCClient {
    constructor(serveraddr, port){
        this.m_url = 'http://'+serveraddr+':'+port+'/rpc';
    }

    Call(funName, funcArgs, onComplete) {
        let sendObj = {
            'funName': funName,
            'args': funcArgs
        }
        const xmlhttp = new XMLHttpRequest();
        xmlhttp.onreadystatechange = function() {
            if (xmlhttp.readyState == 4) {

                if (xmlhttp.status == 200) {
                    let strResp = xmlhttp.responseText;
                    onComplete(strResp, 200);
                } else {
                    onComplete(null, xmlhttp.status);
                }
            }
        };

        xmlhttp.ontimeout = function(err) {
            onComplete(null, 504);
        };

        xmlhttp.open("POST", this.m_url, true);
        xmlhttp.setRequestHeader("Content-Type", "application/json");

        xmlhttp.send(JSON.stringify(sendObj));
    }

    async CallAsync(funcName, funcArgs) {
        return new Promise((reslove, reject) => {
            this.Call(funcName, funcArgs, (resp, statusCode) => {
                reslove({resp:resp, ret: statusCode});
            });
        });
    }
}

module.exports = RPCClient;