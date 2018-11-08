"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const block_1 = require("./block");
const serializable_1 = require("../serializable");
const fs = require("fs-extra");
const path = require("path");
const client_1 = require("../../client");
class BlockStorage {
    constructor(options) {
        this.m_path = path.join(options.path, 'Block');
        this.m_blockHeaderType = options.blockHeaderType;
        this.m_transactionType = options.transactionType;
        this.m_receiptType = options.receiptType;
        this.m_logger = options.logger;
        this.m_readonly = !!options.readonly;
    }
    init() {
        if (!this.m_readonly) {
            fs.mkdirsSync(this.m_path);
        }
        return client_1.ErrorCode.RESULT_OK;
    }
    uninit() {
        // do nothing
    }
    has(blockHash) {
        return fs.existsSync(this._pathOfBlock(blockHash));
    }
    _pathOfBlock(hash) {
        return path.join(this.m_path, hash);
    }
    get(blockHash) {
        let blockRaw;
        try {
            blockRaw = fs.readFileSync(this._pathOfBlock(blockHash));
        }
        catch (error) {
            this.m_logger.warn(`readBlockFile ${this._pathOfBlock(blockHash)} failed.`);
        }
        if (blockRaw) {
            let block = new block_1.Block({ headerType: this.m_blockHeaderType, transactionType: this.m_transactionType, receiptType: this.m_receiptType });
            let err = block.decode(new serializable_1.BufferReader(blockRaw));
            if (err) {
                this.m_logger.error(`load block ${blockHash} from storage failed!`);
                return undefined;
            }
            return block;
        }
        else {
            return undefined;
        }
    }
    _add(hash, blockRaw) {
        fs.writeFileSync(this._pathOfBlock(hash), blockRaw);
    }
    add(block) {
        if (this.m_readonly) {
            return client_1.ErrorCode.RESULT_NOT_SUPPORT;
        }
        let hash = block.hash;
        if (this.has(hash)) {
            return client_1.ErrorCode.RESULT_ALREADY_EXIST;
        }
        let writer = new serializable_1.BufferWriter();
        let err = block.encode(writer);
        if (err) {
            this.m_logger.error(`invalid block `, block);
            return err;
        }
        this._add(hash, writer.render());
        return client_1.ErrorCode.RESULT_OK;
    }
    getSize(blockHash) {
        if (!this.has(blockHash)) {
            return -1;
        }
        let stat = fs.statSync(this._pathOfBlock(blockHash));
        return stat.size;
    }
}
exports.BlockStorage = BlockStorage;
