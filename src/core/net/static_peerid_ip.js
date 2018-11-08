"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const error_code_1 = require("../error_code");
function mapInstance(superClass) {
    return class extends superClass {
        constructor(...args) {
            super(...args.slice(1));
            this.m_peeridToIp = new Map();
            let iph = args[0];
            for (let peerid of Object.keys(iph)) {
                let [host, port] = iph[peerid].split(':');
                this.m_peeridToIp.set(peerid, { host, port: parseInt(port) });
            }
        }
        async _peeridToIpAddress(peerid) {
            let iph = this.m_peeridToIp.get(peerid);
            if (!iph) {
                return { err: error_code_1.ErrorCode.RESULT_NOT_FOUND };
            }
            return { err: error_code_1.ErrorCode.RESULT_OK, ip: iph };
        }
    };
}
exports.mapInstance = mapInstance;
function splitInstance(superClass) {
    return class extends superClass {
        constructor(...args) {
            super(...args);
        }
        async _peeridToIpAddress(peerid) {
            let [host, port] = peerid.split(':');
            return { err: error_code_1.ErrorCode.RESULT_OK, ip: { host, port: parseInt(port) } };
        }
    };
}
exports.splitInstance = splitInstance;
