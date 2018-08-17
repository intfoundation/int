"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("../../core");
const rpc_client_1 = require("../lib/rpc_client");
class HostClient {
    constructor(options) {
        this.m_logger = options.logger;
        this.m_client = new rpc_client_1.RPCClient(options.host, options.port, this.m_logger);
    }
    async getBlock(params) {
        let cr = await this.m_client.callAsync('getBlock', params);
        if (cr.ret !== 200) {
            return { err: core_1.ErrorCode.RESULT_FAILED };
        }
        return JSON.parse(cr.resp);
    }
    async getTransactionReceipt(params) {
        let cr = await this.m_client.callAsync('getTransactionReceipt', params);
        if (cr.ret !== 200) {
            return { err: core_1.ErrorCode.RESULT_FAILED };
        }
        return JSON.parse(cr.resp);
    }
    async getNonce(params) {
        let cr = await this.m_client.callAsync('getNonce', params);
        if (cr.ret !== 200) {
            return { err: core_1.ErrorCode.RESULT_FAILED };
        }
        return JSON.parse(cr.resp);
    }
    async sendTransaction(params) {
        let writer = new core_1.BufferWriter();
        let err = params.tx.encode(writer);
        if (err) {
            this.m_logger.error(`send invalid transactoin`, params.tx);
            return { err };
        }
        let cr = await this.m_client.callAsync('sendTransaction', { tx: writer.render() });
        if (cr.ret !== 200) {
            this.m_logger.error(`send tx failed ret `, cr.ret);
            return { err: core_1.ErrorCode.RESULT_FAILED };
        }
        return { err: JSON.parse(cr.resp) };
    }
    async view(params) {
        let cr = await this.m_client.callAsync('view', params);
        if (cr.ret !== 200) {
            return { err: core_1.ErrorCode.RESULT_FAILED };
        }
        return core_1.fromStringifiable(JSON.parse(cr.resp));
    }
}
exports.HostClient = HostClient;
