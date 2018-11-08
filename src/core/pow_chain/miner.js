"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const path = require("path");
const assert = require("assert");
const error_code_1 = require("../error_code");
const workpool_1 = require("../lib/workpool");
const writer_1 = require("../lib/writer");
const value_chain_1 = require("../value_chain");
const block_1 = require("./block");
const consensus = require("./consensus");
const chain_1 = require("./chain");
class PowMiner extends value_chain_1.ValueMiner {
    constructor(options) {
        super(options);
        const filename = path.resolve(__dirname, 'pow_worker.js');
        this.workpool = new workpool_1.Workpool(filename, 1);
    }
    _chainInstance() {
        return new chain_1.PowChain(this.m_constructOptions);
    }
    get chain() {
        return this.m_chain;
    }
    _newHeader() {
        let tip = this.m_chain.tipBlockHeader;
        let blockHeader = new block_1.PowBlockHeader();
        blockHeader.setPreBlock(tip);
        blockHeader.timestamp = Date.now() / 1000;
        return blockHeader;
    }
    async initialize(options) {
        if (options.coinbase) {
            this.m_coinbase = options.coinbase;
        }
        let err = await super.initialize(options);
        if (err) {
            return err;
        }
        this._createBlock(this._newHeader());
        return error_code_1.ErrorCode.RESULT_OK;
    }
    async _mineBlock(block) {
        // 这里计算bits
        this.m_logger.info(`${this.peerid} begin mine Block (${block.number})`);
        let tr = await consensus.getTarget(block.header, this.m_chain);
        if (tr.err) {
            return tr.err;
        }
        assert(tr.target !== undefined);
        if (tr.target === 0) {
            console.error(`cannot get target bits for block ${block.number}`);
            return error_code_1.ErrorCode.RESULT_INVALID_BLOCK;
        }
        block.header.bits = tr.target;
        // 使用一个workerpool来计算正确的nonce
        let ret = await this._calcuteBlockHashWorkpool(block.header, { start: 0, end: consensus.INT32_MAX }, { start: 0, end: consensus.INT32_MAX });
        if (ret === error_code_1.ErrorCode.RESULT_OK) {
            block.header.updateHash();
            this.m_logger.info(`${this.peerid} mined Block (${block.number}) target ${block.header.bits} : ${block.header.hash}`);
        }
        return ret;
    }
    /**
     * virtual
     * @param chain
     * @param tipBlock
     */
    async _onTipBlock(chain, tipBlock) {
        this.m_logger.info(`${this.peerid} onTipBlock ${tipBlock.number} : ${tipBlock.hash}`);
        if (this.m_state === value_chain_1.MinerState.mining) {
            this.m_logger.info(`${this.peerid} cancel mining`);
            this.workpool.stop();
        }
        this._createBlock(this._newHeader());
    }
    async _calcuteBlockHashWorkpool(blockHeader, nonceRange, nonce1Range) {
        return new Promise((reslove, reject) => {
            let writer = new writer_1.BufferWriter();
            let err = blockHeader.encode(writer);
            if (err) {
                this.m_logger.error(`header encode failed `, blockHeader);
                reslove(err);
                return;
            }
            let buffer = writer.render();
            this.workpool.push({ data: buffer, nonce: nonceRange, nonce1: nonce1Range }, (code, signal, ret) => {
                if (code === 0) {
                    let result = JSON.parse(ret);
                    blockHeader.nonce = result['nonce'];
                    blockHeader.nonce1 = result['nonce1'];
                    assert(blockHeader.verifyPOW());
                    reslove(error_code_1.ErrorCode.RESULT_OK);
                }
                else if (signal === 'SIGTERM') {
                    reslove(error_code_1.ErrorCode.RESULT_CANCELED);
                }
                else {
                    this.m_logger.error(`worker error! code: ${code}, ret: ${ret}`);
                    reslove(error_code_1.ErrorCode.RESULT_FAILED);
                }
            });
        });
    }
}
exports.PowMiner = PowMiner;
