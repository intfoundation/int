"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const error_code_1 = require("../error_code");
const network_1 = require("./network");
const util_1 = require("util");
const DEFAULT_MIN_OUTBOUND = 8;
class RandomOutNetwork extends network_1.Network {
    constructor(options) {
        super(options);
    }
    setInstanceOptions(options) {
        super.setInstanceOptions(options);
        this.m_minOutbound = options.minOutbound;
        this.m_checkCycle = options.checkCycle ? options.checkCycle : 1000;
    }
    parseInstanceOptions(options) {
        let por = super.parseInstanceOptions(options);
        if (por.err) {
            return { err: por.err };
        }
        let value = Object.create(por.value);
        if (!util_1.isNullOrUndefined(options.parsed.minOutbound)) {
            value.minOutbound = options.parsed.minOutbound;
        }
        else if (options.origin.has('minOutbound')) {
            value.minOutbound = parseInt(options.origin.get('minOutbound'));
        }
        else {
            value.minOutbound = DEFAULT_MIN_OUTBOUND;
        }
        if (!util_1.isNullOrUndefined(options.parsed.checkCycle)) {
            value.checkCycle = options.parsed.checkCycle;
        }
        else if (options.origin.has('checkCycle')) {
            value.checkCycle = parseInt(options.origin.get('checkCycle'));
        }
        return { err: error_code_1.ErrorCode.RESULT_OK, value };
    }
    uninit() {
        if (this.m_checkOutboundTimer) {
            clearInterval(this.m_checkOutboundTimer);
            delete this.m_checkOutboundTimer;
        }
        return super.uninit();
    }
    async initialOutbounds() {
        this.logger.debug(`initialOutbounds`);
        if (this.m_minOutbound === 0) {
            return error_code_1.ErrorCode.RESULT_SKIPPED;
        }
        let err = await this._newOutbounds(this.m_minOutbound);
        if (err) {
            return err;
        }
        this.m_checkOutboundTimer = setInterval(() => {
            let next = this.m_minOutbound - (this.m_connecting.size + this.m_node.getConnnectionCount());
            if (next > 0) {
                this.logger.debug(`node need more ${next} connection, call  _newOutbounds`);
                this._newOutbounds(next);
            }
        }, this.m_checkCycle);
        return error_code_1.ErrorCode.RESULT_OK;
    }
    async _newOutbounds(count, callback) {
        let peerids = this.m_nodeStorage.get('all');
        let willConn = new Set();
        for (let pid of peerids) {
            if (this._onWillConnectTo(pid)) {
                willConn.add(pid);
            }
        }
        this.logger.debug(`will connect to peers from node storage: `, willConn);
        if (willConn.size < count) {
            let excludes = [];
            for (const pid of this.m_connecting) {
                excludes.push(pid);
            }
            for (const pid of willConn) {
                excludes.push(pid);
            }
            for (const ib of this.node.getInbounds()) {
                excludes.push(ib.remote);
            }
            for (const ob of this.node.getOutbounds()) {
                excludes.push(ob.remote);
            }
            let result = await this.m_node.randomPeers(count, excludes);
            if (result.peers.length === 0) {
                result.peers = this.m_nodeStorage.staticNodes.filter((value) => !excludes.includes(value));
                result.err = result.peers.length > 0 ? error_code_1.ErrorCode.RESULT_OK : error_code_1.ErrorCode.RESULT_SKIPPED;
            }
            if (result.err === error_code_1.ErrorCode.RESULT_OK) {
                this.logger.debug(`will connect to peers from random peers: `, result.peers);
                for (let pid of result.peers) {
                    willConn.add(pid);
                }
            }
            else if (result.err === error_code_1.ErrorCode.RESULT_SKIPPED) {
                this.logger.debug(`cannot find any peers, ignore connect.`);
                return error_code_1.ErrorCode.RESULT_SKIPPED;
            }
            else {
                this.logger.error(`random peers failed for : `, result.err);
                return result.err;
            }
        }
        return await this._connectTo(willConn, callback);
    }
}
exports.RandomOutNetwork = RandomOutNetwork;
