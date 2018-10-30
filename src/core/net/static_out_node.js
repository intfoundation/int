"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const error_code_1 = require("../error_code");
function instance(superClass) {
    return class extends superClass {
        constructor(...args) {
            super(...args.slice(1));
            this.m_staticPeers = (args[0]).slice(0);
        }
        async randomPeers(count, excludes) {
            const doubleCount = 2 * count;
            if (this.m_staticPeers.length) {
                const ex = new Set(excludes);
                let inc = [];
                for (const peerid of this.m_staticPeers) {
                    if (!ex.has(peerid)) {
                        inc.push(peerid);
                    }
                }
                if (inc.length <= doubleCount) {
                    return { err: error_code_1.ErrorCode.RESULT_OK, peers: inc };
                }
                else {
                    const start = Math.floor(inc.length * Math.random());
                    let peers = [];
                    peers.push(...inc.slice(start));
                    if (peers.length <= doubleCount) {
                        peers.push(...inc.slice(doubleCount - peers.length));
                    }
                    return { err: error_code_1.ErrorCode.RESULT_OK, peers };
                }
            }
            else {
                return { err: error_code_1.ErrorCode.RESULT_SKIPPED, peers: [] };
            }
        }
    };
}
exports.instance = instance;
