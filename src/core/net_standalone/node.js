"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const node_1 = require("../net/node");
const error_code_1 = require("../error_code");
const connection_1 = require("./connection");
class StandaloneNode extends node_1.INode {
    constructor(peerid) {
        super({ peerid });
    }
    async _connectTo(peerid) {
        let connType = this._nodeConnectionType();
        let conn = new connType(this);
        return { err: error_code_1.ErrorCode.RESULT_OK, conn };
    }
    _connectionType() {
        return connection_1.StandaloneConnection;
    }
    async listen() {
        return error_code_1.ErrorCode.RESULT_OK;
    }
    async randomPeers(count, excludes) {
        return { err: error_code_1.ErrorCode.RESULT_SKIPPED, peers: [] };
    }
}
exports.StandaloneNode = StandaloneNode;
