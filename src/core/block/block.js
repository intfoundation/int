"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
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
        return obj;
    }
}
exports.BlockHeader = BlockHeader;
class BlockContent {
    constructor(transactionType) {
        this.m_transactions = new Array();
        this.m_receipts = new Map();
        this.m_transactionType = transactionType;
    }
    get transactions() {
        const t = this.m_transactions;
        return t;
    }
    get receipts() {
        return this.m_receipts.values();
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
    getReceipt(txHash) {
        return this.m_receipts.get(txHash);
    }
    addTransaction(tx) {
        this.m_transactions.push(tx);
    }
    addReceipt(receipt) {
        this.m_receipts.set(receipt.transactionHash, receipt);
    }
    setReceipts(receipts) {
        this.m_receipts.clear();
        for (let r of receipts) {
            this.m_receipts.set(r.transactionHash, r);
        }
    }
    encode(writer) {
        try {
            writer.writeU16(this.m_transactions.length);
            for (let tx of this.m_transactions) {
                let err = tx.encode(writer);
                if (err) {
                    return err;
                }
                let r = this.m_receipts.get(tx.hash);
                assert(r);
                err = r.encode(writer);
                if (err) {
                    return err;
                }
            }
        }
        catch (e) {
            return error_code_1.ErrorCode.RESULT_INVALID_FORMAT;
        }
        return error_code_1.ErrorCode.RESULT_OK;
    }
    decode(reader) {
        this.m_transactions = [];
        this.m_receipts = new Map();
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
            let receipt = new transaction_1.Receipt();
            err = receipt.decode(reader);
            if (err !== error_code_1.ErrorCode.RESULT_OK) {
                return err;
            }
            this.m_receipts.set(tx.hash, receipt);
        }
        return error_code_1.ErrorCode.RESULT_OK;
    }
}
exports.BlockContent = BlockContent;
class Block {
    constructor(options) {
        this.m_transactionType = options.transactionType;
        this.m_headerType = options.headerType;
        this.m_header = new this.m_headerType();
        if (options.header) {
            let writer = new serializable_1.BufferWriter();
            let err = options.header.encode(writer);
            assert(!err, `encode header failed with err ${err}`);
            let reader = new serializable_1.BufferReader(writer.render());
            err = this.m_header.decode(reader);
            assert(!err, `clone header failed with err ${err}`);
        }
        this.m_content = new BlockContent(this.m_transactionType);
    }
    clone() {
        let writer = new serializable_1.BufferWriter();
        let err = this.encode(writer);
        assert(!err, `encode block failed ${err}`);
        let reader = new serializable_1.BufferReader(writer.render());
        let newBlock = new Block({
            headerType: this.headerType,
            transactionType: this.transactionType
        });
        err = newBlock.decode(reader);
        assert(!err, `clone block ${this.m_header.hash} failed for ${err}`);
        return newBlock;
    }
    get transactionType() {
        return this.m_transactionType;
    }
    get headerType() {
        return this.m_headerType;
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
