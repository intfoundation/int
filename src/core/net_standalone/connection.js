"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const error_code_1 = require("../error_code");
const net_1 = require("../net");
class StandaloneConnection extends net_1.IConnection {
    send(data) {
        return 0;
    }
    close() {
        return Promise.resolve(error_code_1.ErrorCode.RESULT_OK);
    }
    getRemote() {
        return '';
    }
}
exports.StandaloneConnection = StandaloneConnection;
