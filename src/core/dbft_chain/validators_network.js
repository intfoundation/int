"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const util_1 = require("util");
const error_code_1 = require("../error_code");
const chain_1 = require("../chain");
class ValidatorsNetwork extends chain_1.Network {
    constructor(options) {
        super(options);
        this.m_validators = [];
    }
    setInstanceOptions(options) {
        super.setInstanceOptions(options);
        this.m_minConnectionRate = options.minConnectionRate;
        this.setValidators([options.initialValidator]);
    }
    parseInstanceOptions(options) {
        let por = super.parseInstanceOptions(options);
        if (por.err) {
            return { err: por.err };
        }
        let value = Object.create(por.value);
        if (!util_1.isNullOrUndefined(options.parsed.minConnectionRate)) {
            value.minConnectionRate = options.parsed.minConnectionRate;
        }
        else if (options.origin.has('minConnectionRate')) {
            value.minConnectionRate = parseInt(options.origin.get('minConnectionRate'));
        }
        else {
            return { err: error_code_1.ErrorCode.RESULT_INVALID_PARAM };
        }
        if (!util_1.isNullOrUndefined(options.parsed.initialValidator)) {
            value.initialValidator = options.parsed.initialValidator;
        }
        else if (options.origin.has('initialValidator')) {
            value.initialValidator = options.origin.get('initialValidator');
        }
        else {
            return { err: error_code_1.ErrorCode.RESULT_INVALID_PARAM };
        }
        return { err: error_code_1.ErrorCode.RESULT_OK, value };
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
                return validators.has(conn.remote);
            } });
    }
}
exports.ValidatorsNetwork = ValidatorsNetwork;
