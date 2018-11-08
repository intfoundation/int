"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const error_code_1 = require("../error_code");
const base_node_1 = require("./base_node");
class RandomOutNode extends base_node_1.BaseNode {
    constructor(options) {
        super(options);
        this.m_minOutbound = options.minOutbound;
        this.m_checkCycle = options.checkCycle;
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
                excludes.push(ib.getRemote());
            }
            for (const ob of this.node.getOutbounds()) {
                excludes.push(ob.getRemote());
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
                this.logger.error(`cannot find any peers, ignore connect.`);
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
exports.RandomOutNode = RandomOutNode;
