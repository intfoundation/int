const RPCClient = require('../RPC/RPCClient');

class SuperNodeClient{
    constructor(host, port) {
        this._client = new RPCClient(host, port);
    }

    async createCoinbase(targets) {
        return new Promise((reslove, reject) => {
            this._client.Call("createCoinbase", targets, (respStr, statusCode) => {
                reslove(respStr === 'success!');
            });
        });
    }

    async getNowBlockHeight() {
        return new Promise((reslove, reject) => {
            this._client.Call("getNowBlockHeight", "", (respStr, statusCode) => {
                reslove(parseInt(respStr));
            });
        });
    }
}

module.exports = SuperNodeClient;