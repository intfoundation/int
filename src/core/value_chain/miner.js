"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const error_code_1 = require("../error_code");
const chain_1 = require("../chain");
const bignumber_js_1 = require("bignumber.js");
const chain_2 = require("./chain");
const assert = require('assert');
class ValueMiner extends chain_1.Miner {
    constructor(options) {
        super(options);
        this.m_blocklimit = new bignumber_js_1.BigNumber(0);
        // 一个块的最大 limit
        this.m_maxblocklimit = new bignumber_js_1.BigNumber(80000000);
    }
    set coinbase(address) {
        this.m_coinbase = address;
    }
    get coinbase() {
        return this.m_coinbase;
    }
    _chainInstance() {
        return new chain_2.ValueChain(this.m_constructOptions);
    }
    get chain() {
        return this.m_chain;
    }
    parseInstanceOptions(options) {
        let { err, value } = super.parseInstanceOptions(options);
        if (err) {
            return { err };
        }
        value.coinbase = options.origin.get('coinbase');
        if (!options.origin.has('blocklimit')) {
            console.log(`not exist 'blocklimit' option in command`);
            return { err: error_code_1.ErrorCode.RESULT_PARSE_ERROR };
        }
        value.blocklimit = new bignumber_js_1.BigNumber(options.origin.get('blocklimit'));
        if (value.blocklimit.gt(this.m_maxblocklimit)) {
            return { err: error_code_1.ErrorCode.RESULT_BLOCK_LIMIT_TOO_BIG };
        }
        return { err: error_code_1.ErrorCode.RESULT_OK, value };
    }
    async initialize(options) {
        if (options.coinbase) {
            this.m_coinbase = options.coinbase;
        }
        this.m_blocklimit = options.blocklimit;
        return super.initialize(options);
    }
    async _decorateBlock(block) {
        block.header.coinbase = this.m_coinbase;
        return error_code_1.ErrorCode.RESULT_OK;
    }
    pushTx(block) {
        let txs = this.chain.pending.popTransactionWithFee(this.m_blocklimit);
        while (txs.length > 0) {
            block.content.addTransaction(txs.shift());
        }
    }
}
exports.ValueMiner = ValueMiner;
