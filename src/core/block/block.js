"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const util_1 = require("util");
const transaction_1 = require("./transaction");
const serializable_1 = require("../serializable");
const error_code_1 = require("../error_code");
const merkle = require("../lib/merkle");
const encoding_1 = require("../lib/encoding");
const assert = require("assert");
const digest = require('../lib/digest');
class BlockHeader extends serializable_1.SerializableWithHash {
    constructor() {
        super();
        this.m_number = 0;
        this.m_storageHash = encoding_1.Encoding.NULL_HASH;
        this.m_preBlockHash = encoding_1.Encoding.NULL_HASH;
        this.m_receiptHash = encoding_1.Encoding.NULL_HASH;
        this.m_merkleRoot = encoding_1.Encoding.NULL_HASH;
        this.m_timestamp = -1;
    }
    get number() {
        return this.m_number;
    }
    get storageHash() {
        return this.m_storageHash;
    }
    set storageHash(h) {
        this.m_storageHash = h;
    }
    get preBlockHash() {
        return this.m_preBlockHash;
    }
    get timestamp() {
        return this.m_timestamp;
    }
    set timestamp(n) {
        this.m_timestamp = n;
    }
    isPreBlock(header) {
        return (this.m_number + 1 === header.m_number) && (this.m_hash === header.m_preBlockHash);
    }
    setPreBlock(header) {
        if (header) {
            this.m_number = header.m_number + 1;
            this.m_preBlockHash = header.hash;
        }
        else {
            // gensis block
            this.m_number = 0;
            this.m_preBlockHash = encoding_1.Encoding.NULL_HASH;
        }
    }
    get merkleRoot() {
        return this.m_merkleRoot;
    }
    hasTransaction(txHash) {
        // TODO: find hash from txHash
        return false;
    }
    _genMerkleRoot(txs) {
        const leaves = [];
        for (const tx of txs) {
            leaves.push(Buffer.from(tx.hash, 'hex'));
        }
        const [root, malleated] = merkle.createRoot(leaves);
        if (malleated) {
            return encoding_1.Encoding.NULL_HASH;
        }
        return root.toString('hex');
    }
    _genReceiptHash(receipts) {
        if (!receipts.length) {
            return encoding_1.Encoding.NULL_HASH;
        }
        let writer = new serializable_1.BufferWriter();
        for (const receipt of receipts) {
            receipt.encode(writer);
        }
        return digest.hash256(writer.render()).toString('hex');
    }
    /**
     * virtual
     * verify hash here
     */
    async verify(chain) {
        return { err: error_code_1.ErrorCode.RESULT_OK, valid: true };
    }
    verifyContent(content) {
        if (this.m_merkleRoot !== this._genMerkleRoot(content.transactions)) {
            return false;
        }
        if (this.m_receiptHash !== this._genReceiptHash(content.receipts)) {
            return false;
        }
        return true;
    }
    updateContent(content) {
        this.m_merkleRoot = this._genMerkleRoot(content.transactions);
        this.m_receiptHash = this._genReceiptHash(content.receipts);
    }
    _encodeHashContent(writer) {
        try {
            writer.writeU32(this.m_number);
            writer.writeI32(this.m_timestamp);
            writer.writeHash(this.m_merkleRoot);
            writer.writeHash(this.m_storageHash);
            writer.writeHash(this.m_receiptHash);
            writer.writeHash(this.m_preBlockHash);
        }
        catch (e) {
            return error_code_1.ErrorCode.RESULT_INVALID_FORMAT;
        }
        return error_code_1.ErrorCode.RESULT_OK;
    }
    _decodeHashContent(reader) {
        try {
            this.m_number = reader.readU32();
            this.m_timestamp = reader.readI32();
            this.m_merkleRoot = reader.readHash('hex');
            this.m_storageHash = reader.readHash('hex');
            this.m_receiptHash = reader.readHash('hex');
            this.m_preBlockHash = reader.readHash('hex');
        }
        catch (e) {
            return error_code_1.ErrorCode.RESULT_INVALID_FORMAT;
        }
        return error_code_1.ErrorCode.RESULT_OK;
    }
    stringify() {
        let obj = super.stringify();
        obj.number = this.number;
        obj.timestamp = this.timestamp;
        obj.preBlock = this.preBlockHash;
        obj.merkleRoot = this.merkleRoot;
        obj.storageHash = this.m_storageHash;
        obj.m_receiptHash = this.m_receiptHash;
        return obj;
    }
}
exports.BlockHeader = BlockHeader;
class BlockContent {
    constructor(transactionType, receiptType) {
        this.m_transactions = new Array();
        this.m_preBlockEventReceipts = new Array();
        this.m_txReceipts = new Map();
        this.m_postBlockEventReceipts = new Array();
        this.m_receipts = new Array();
        this.m_transactionType = transactionType;
        this.m_receiptType = receiptType;
    }
    get transactions() {
        const t = this.m_transactions;
        return t;
    }
    get receipts() {
        const r = this.m_receipts;
        return r;
    }
    get preBlockEventReceipts() {
        const r = this.m_preBlockEventReceipts;
        return r;
    }
    get transactionReceipts() {
        const r = this.m_txReceipts;
        return r;
    }
    get postBlockEventReceipts() {
        const r = this.m_postBlockEventReceipts;
        return r;
    }
    get eventLogs() {
        let logs = [];
        for (let r of this.m_receipts) {
            logs.push(...r.eventLogs);
        }
        return logs;
    }
    hasTransaction(txHash) {
        for (const tx of this.m_transactions) {
            if (tx.hash === txHash) {
                return true;
            }
        }
        return false;
    }
    getTransaction(arg) {
        if (typeof (arg) === 'string') {
            for (const tx of this.m_transactions) {
                if (tx.hash === arg) {
                    return tx;
                }
            }
        }
        else if (typeof (arg) === 'number') {
            if (arg >= 0 && arg < this.m_transactions.length) {
                return this.m_transactions[arg];
            }
        }
        return null;
    }
    getReceipt(options) {
        if (util_1.isString(options)) {
            return this.m_txReceipts.get(options);
        }
        else {
            if (options.sourceType === transaction_1.ReceiptSourceType.preBlockEvent) {
                return this.m_preBlockEventReceipts[options.eventIndex];
            }
            else if (options.sourceType === transaction_1.ReceiptSourceType.postBlockEvent) {
                return this.m_postBlockEventReceipts[options.eventIndex];
            }
            else {
                assert(false, `invalid receipt source type ${options.sourceType}`);
                return undefined;
            }
        }
    }
    addTransaction(tx) {
        this.m_transactions.push(tx);
    }
    setReceipts(receipts) {
        let txReceipts = new Map();
        let txReceiptsArr = [];
        let preBlockEventReceipts = [];
        let postBlockEventReceipts = [];
        for (let r of receipts) {
            if (r.sourceType === transaction_1.ReceiptSourceType.transaction) {
                txReceipts.set(r.transactionHash, r);
                txReceiptsArr.push(r);
            }
            else if (r.sourceType === transaction_1.ReceiptSourceType.preBlockEvent) {
                preBlockEventReceipts.push(r);
            }
            else if (r.sourceType === transaction_1.ReceiptSourceType.postBlockEvent) {
                postBlockEventReceipts.push(r);
            }
            else {
                assert(false, `invalid receipt source type ${r.sourceType}`);
                return;
            }
        }
        this.m_txReceipts = txReceipts;
        this.m_preBlockEventReceipts = preBlockEventReceipts;
        this.m_postBlockEventReceipts = postBlockEventReceipts;
        let _receipts = [];
        _receipts.push(...preBlockEventReceipts);
        _receipts.push(...txReceiptsArr);
        _receipts.push(...postBlockEventReceipts);
        this.m_receipts = _receipts;
    }
    encode(writer) {
        try {
            writer.writeU16(this.m_transactions.length);
            for (let tx of this.m_transactions) {
                const err = tx.encode(writer);
                if (err) {
                    return err;
                }
            }
            const receiptLength = this.m_txReceipts.size
                + this.m_preBlockEventReceipts.length
                + this.m_postBlockEventReceipts.length;
            if (receiptLength) {
                if (this.m_txReceipts.size !== this.m_transactions.length) {
                    return error_code_1.ErrorCode.RESULT_INVALID_BLOCK;
                }
                writer.writeU16(receiptLength);
                for (let tx of this.m_transactions) {
                    let r = this.m_txReceipts.get(tx.hash);
                    assert(r);
                    const err = r.encode(writer);
                    if (err) {
                        return err;
                    }
                }
                for (let r of this.m_preBlockEventReceipts) {
                    const err = r.encode(writer);
                    if (err) {
                        return err;
                    }
                }
                for (let r of this.m_postBlockEventReceipts) {
                    const err = r.encode(writer);
                    if (err) {
                        return err;
                    }
                }
            }
            else {
                writer.writeU16(0);
            }
        }
        catch (e) {
            return error_code_1.ErrorCode.RESULT_INVALID_FORMAT;
        }
        return error_code_1.ErrorCode.RESULT_OK;
    }
    decode(reader) {
        this.m_transactions = [];
        this.m_txReceipts = new Map();
        let txCount;
        try {
            txCount = reader.readU16();
        }
        catch (e) {
            return error_code_1.ErrorCode.RESULT_INVALID_FORMAT;
        }
        for (let ix = 0; ix < txCount; ++ix) {
            let tx = new this.m_transactionType();
            let err = tx.decode(reader);
            if (err !== error_code_1.ErrorCode.RESULT_OK) {
                return err;
            }
            this.m_transactions.push(tx);
        }
        const rs = reader.readU16();
        let receipts = [];
        if (rs) {
            for (let ix = 0; ix < txCount; ++ix) {
                let receipt = new this.m_receiptType();
                const err = receipt.decode(reader);
                if (err !== error_code_1.ErrorCode.RESULT_OK) {
                    return err;
                }
                receipts.push(receipt);
            }
            for (let ix = 0; ix < rs - txCount; ++ix) {
                let receipt = new transaction_1.Receipt();
                const err = receipt.decode(reader);
                if (err !== error_code_1.ErrorCode.RESULT_OK) {
                    return err;
                }
                receipts.push(receipt);
            }
        }
        this.setReceipts(receipts);
        return error_code_1.ErrorCode.RESULT_OK;
    }
}
exports.BlockContent = BlockContent;
class Block {
    constructor(options) {
        this.m_transactionType = options.transactionType;
        this.m_headerType = options.headerType;
        this.m_header = new this.m_headerType();
        this.m_receiptType = options.receiptType;
        if (options.header) {
            let writer = new serializable_1.BufferWriter();
            let err = options.header.encode(writer);
            assert(!err, `encode header failed with err ${err}`);
            let reader = new serializable_1.BufferReader(writer.render());
            err = this.m_header.decode(reader);
            assert(!err, `clone header failed with err ${err}`);
        }
        this.m_content = new BlockContent(this.m_transactionType, this.m_receiptType);
    }
    clone() {
        let writer = new serializable_1.BufferWriter();
        let err = this.encode(writer);
        assert(!err, `encode block failed ${err}`);
        let reader = new serializable_1.BufferReader(writer.render());
        let newBlock = new Block({
            headerType: this.m_headerType,
            transactionType: this.m_transactionType,
            receiptType: this.m_receiptType,
        });
        err = newBlock.decode(reader);
        assert(!err, `clone block ${this.m_header.hash} failed for ${err}`);
        return newBlock;
    }
    get header() {
        return this.m_header;
    }
    get content() {
        return this.m_content;
    }
    get hash() {
        return this.m_header.hash;
    }
    get number() {
        return this.m_header.number;
    }
    encode(writer) {
        let err = this.m_header.encode(writer);
        if (err) {
            return err;
        }
        return this.m_content.encode(writer);
    }
    decode(reader) {
        let err = this.m_header.decode(reader);
        if (err !== error_code_1.ErrorCode.RESULT_OK) {
            return err;
        }
        return this.m_content.decode(reader);
    }
    verify() {
        // 验证content hash
        return this.m_header.verifyContent(this.m_content);
    }
}
exports.Block = Block;
