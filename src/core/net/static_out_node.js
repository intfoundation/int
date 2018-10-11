"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const error_code_1 = require("../error_code");
function instance(superClass) {
    return class extends superClass {
        constructor(...args) {
            super(args[0]);
            this.m_staticPeers = (args[1]).slice(0);
        }
        async randomPeers(count) {
            if (this.m_staticPeers.length) {
                return { err: error_code_1.ErrorCode.RESULT_OK, peers: this.m_staticPeers };
            }
            else {
                return { err: error_code_1.ErrorCode.RESULT_SKIPPED, peers: [] };
            }
        }
    };
}
exports.instance = instance;
