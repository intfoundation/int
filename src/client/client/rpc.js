"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("../../core");
const rpc_client_1 = require("../lib/rpc_client");
const bignumber_js_1 = require("bignumber.js");
const serializable_1 = require("../../core/serializable");
class HostClient {
    constructor(options) {
        this.m_baseLimit = new bignumber_js_1.BigNumber(500);
        this.m_getLimit = new bignumber_js_1.BigNumber(20);
        this.m_setLimit = new bignumber_js_1.BigNumber(100);
        this.m_createLimit = new bignumber_js_1.BigNumber(50000);
        this.m_inputLimit = new bignumber_js_1.BigNumber(5);
        this.m_coefficient = new bignumber_js_1.BigNumber(40);
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
    async getTransactionByAddress(params) {
        let cr = await this.m_client.callAsync('getTransactionByAddress', params);
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
    async getPendingTransactions(params) {
        let cr = await this.m_client.callAsync('getPendingTransactions', params);
        if (cr.ret !== 200) {
            return { err: core_1.ErrorCode.RESULT_FAILED };
        }
        return JSON.parse(cr.resp);
    }
    async newAccount(params) {
        let cr = await this.m_client.callAsync('newAccount', params);
        if (cr.ret !== 200) {
            this.m_logger.error(`create account failed ret `, cr.ret);
            return { err: core_1.ErrorCode.RESULT_FAILED };
        }
        return JSON.parse(cr.resp);
    }
    async getAccounts(params) {
        let cr = await this.m_client.callAsync('getAccounts', params);
        if (cr.ret !== 200) {
            this.m_logger.error(`read file failed`, cr.ret);
            return { err: core_1.ErrorCode.RESULT_FAILED };
        }
        return JSON.parse(cr.resp);
    }
    async sendTransaction(params) {
        let cr = await this.m_client.callAsync('sendTransaction', params);
        if (cr.ret !== 200) {
            this.m_logger.error(`send tx failed ret `, cr.ret);
            return { err: core_1.ErrorCode.RESULT_FAILED, hash: "" };
        }
        return JSON.parse(cr.resp);
    }
    async sendSignedTransaction(params) {
        // let writer = new BufferWriter();
        // let err = params.tx.encode(writer);
        // if (err) {
        //     this.m_logger.error(`send invalid transaction`, params.tx);
        //     return {err};
        // }
        let cr = await this.m_client.callAsync('sendSignedTransaction', { tx: params.tx });
        if (cr.ret !== 200) {
            this.m_logger.error(`send tx failed ret `, cr.ret);
            return { err: core_1.ErrorCode.RESULT_FAILED };
        }
        return JSON.parse(cr.resp);
    }
    async view(params) {
        let cr = await this.m_client.callAsync('view', params);
        if (cr.ret !== 200) {
            return { err: core_1.ErrorCode.RESULT_FAILED };
        }
        return core_1.fromStringifiable(JSON.parse(cr.resp));
    }
    async getPeers() {
        let cr = await this.m_client.callAsync('getPeers', {});
        return JSON.parse(cr.resp);
    }
    getTransactionLimit(method, input) {
        let txTotalLimit = this.calcTxLimit(method, input);
        return { limit: txTotalLimit };
    }
    // 计算执行tx的 limit
    calcTxLimit(method, input) {
        let txTotalLimit = new bignumber_js_1.BigNumber(0);
        switch (method) {
            case 'transferTo':
                txTotalLimit = this.calcLimit(input, 2, 2, false);
                break;
            case 'createToken':
                txTotalLimit = this.calcLimit(input, 6, 0, true);
                break;
            case 'transferTokenTo':
                txTotalLimit = this.calcLimit(input, 2, 4, false);
                break;
            case 'transferFrom':
                txTotalLimit = this.calcLimit(input, 3, 6, false);
                break;
            case 'approve':
                txTotalLimit = this.calcLimit(input, 2, 2, false);
                break;
            case 'freezeAccount':
                txTotalLimit = this.calcLimit(input, 1, 1, false);
                break;
            case 'burn':
                txTotalLimit = this.calcLimit(input, 2, 2, false);
                break;
            case 'mintToken':
                txTotalLimit = this.calcLimit(input, 2, 3, false);
                break;
            case 'transferOwnership':
                txTotalLimit = this.calcLimit(input, 1, 1, false);
                break;
            case 'vote':
                txTotalLimit = this.calcLimit(input, 2, 5, false);
                break;
            case 'mortgage':
                txTotalLimit = this.calcLimit(input, 2, 2, false);
                break;
            case 'unmortgage':
                txTotalLimit = this.calcLimit(input, 3, 2, false);
                break;
            case 'register':
                txTotalLimit = this.calcLimit(input, 1, 1, false);
                break;
            case 'publish':
                txTotalLimit = this.calcLimit(input, 3, 1, false);
                break;
            case 'bid':
                txTotalLimit = this.calcLimit(input, 1, 1, false);
                break;
            default:
                txTotalLimit = this.calcLimit(input, 0, 0, false);
                break;
        }
        return txTotalLimit;
    }
    objectToBuffer(input) {
        let inputString;
        if (input) {
            inputString = JSON.stringify(serializable_1.toStringifiable(input, true));
        }
        else {
            inputString = JSON.stringify({});
        }
        return Buffer.from(inputString);
    }
    calcLimit(input, setN, getN, create) {
        let txTotalLimit = new bignumber_js_1.BigNumber(0);
        let txInputBytes = new bignumber_js_1.BigNumber(this.objectToBuffer(input).length);
        txTotalLimit = txTotalLimit.plus(this.m_baseLimit).plus(this.m_setLimit.times(new bignumber_js_1.BigNumber(setN))).plus(this.m_getLimit.times(new bignumber_js_1.BigNumber(getN))).plus(txInputBytes.times(this.m_inputLimit));
        if (create) {
            txTotalLimit = txTotalLimit.plus(this.m_createLimit);
        }
        txTotalLimit = txTotalLimit.times(this.m_coefficient);
        return txTotalLimit;
    }
}
exports.HostClient = HostClient;
