"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const error_code_1 = require("../error_code");
const chain_1 = require("../chain");
class ValidatorsNode extends chain_1.BaseNode {
    constructor(options) {
        super(options);
        this.m_validators = [];
        this.m_minConnectionRate = options.minConnectionRate;
    }
    setValidators(validators) {
        this.m_validators = [];
        this.m_validators.push(...validators);
    }
    getValidators() {
        const v = this.m_validators;
        return v;
    }
    _getMinOutbound() {
        return Math.ceil(this.m_validators.length * this.m_minConnectionRate);
    }
    async initialOutbounds() {
        this._checkConnections();
        this.m_checkOutboundTimer = setInterval(() => {
            this._checkConnections();
        }, 1000);
        let bSelf = false;
        for (let v of this.m_validators) {
            if (v === this.node.peerid) {
                bSelf = true;
                break;
            }
        }
        if (this.m_validators.length === 0 || (bSelf && this.m_validators.length === 1)) {
            return error_code_1.ErrorCode.RESULT_SKIPPED;
        }
        return error_code_1.ErrorCode.RESULT_OK;
    }
    uninit() {
        if (this.m_checkOutboundTimer) {
            clearInterval(this.m_checkOutboundTimer);
            delete this.m_checkOutboundTimer;
        }
        return super.uninit();
    }
    _checkConnections() {
        let connectionCount = 0;
        for (let v of this.m_validators) {
            if (this.node.getConnection(v) || this.m_connecting.has(v)) {
                ++connectionCount;
            }
        }
        let willConn = new Set();
        if (connectionCount < this._getMinOutbound()) {
            for (let v of this.m_validators) {
                if (this._onWillConnectTo(v)) {
                    willConn.add(v);
                }
            }
            this._connectTo(willConn);
        }
    }
    broadcastToValidators(writer) {
        let validators = new Set(this.m_validators);
        return this.m_node.broadcast(writer, { count: validators.size, filter: (conn) => {
                return validators.has(conn.getRemote());
            } });
    }
}
exports.ValidatorsNode = ValidatorsNode;
