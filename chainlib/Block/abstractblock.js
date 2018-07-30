/*!
 * abstractblock.js - abstract block object for bcoin
 * Copyright (c) 2014-2015, Fedor Indutny (MIT License)
 * Copyright (c) 2014-2017, Christopher Jeffrey (MIT License).
 * https://github.com/bcoin-org/bcoin
 */
'use strict';

const assert = require('assert');
const util = require('../Utils/util');
const digest = require('../Crypto/digest');
const BufferReader = require('../Utils/reader');
const StaticWriter = require('../Utils/staticwriter');
const InvItem = require('../Transcation/invitem');
const encoding = require('../Utils/encoding');

const KeyRing = require('../Account/keyring');
const config = require('../config');

/**
 * The class which all block-like objects inherit from.
 * @alias module:primitives.AbstractBlock
 * @constructor
 * @abstract
 * @property {Number} version - Block version. Note
 * that Bcoin reads versions as unsigned despite
 * them being signed on the protocol level. This
 * number will never be negative.
 * @property {Hash} prevBlock - Previous block hash.
 * @property {Hash} merkleRoot - Merkle root hash.
 * @property {Hash} sign - sign by Creator.
 * @property {Number} time - Timestamp.
 * @property {Number} height - Block height.
 */
class AbstractBlock {
    constructor() {
        if (!(this instanceof AbstractBlock))
            return new AbstractBlock();

        this.version = 1;
        this.prevBlock = encoding.NULL_HASH;
        this.merkleRoot = encoding.NULL_HASH;
        //64 bytes sign from merkleRoot by systemAccount
        this.sign = encoding.ZERO_SIG64;
        this.time = 0;
        this.height = 0;
        //U8 number represents who create
        this.creator = 0;

        this.mutable = false;

        this._hash = null;
        this._hhash = null;
    }

    /**
     * Inject properties from options object.
     * @private
     * @param {NakedBlock} options
     */

    parseOptions(options) {
        assert(options, 'Block data is required.');
        assert(util.isU32(options.version));
        assert(typeof options.prevBlock === 'string');
        assert(typeof options.merkleRoot === 'string');
        assert(util.isU32(options.time));
        assert(util.isU32(options.height));


        this.version = options.version;
        this.prevBlock = options.prevBlock;
        this.merkleRoot = options.merkleRoot;
        this.time = options.time;
        this.height = options.height;
        this.sign = options.sign;
        this.creator = options.creator;

        if (options.mutable != null)
            this.mutable = Boolean(options.mutable);

        return this;
    }

    /**
     * Inject properties from json object.
     * @private
     * @param {Object} json
     */

    parseJSON(json) {
        assert(json, 'Block data is required.');
        assert(util.isU32(json.version));
        assert(typeof json.prevBlock === 'string');
        assert(typeof json.merkleRoot === 'string');
        assert(util.isU32(json.time));
        assert(util.isU32(json.height));

        this.version = json.version;
        this.prevBlock = util.revHex(json.prevBlock);
        this.merkleRoot = util.revHex(json.merkleRoot);
        this.time = json.time;
        this.height = json.height;

        return this;
    }

    /**
     * Test whether the block is a memblock.
     * @returns {Boolean}
     */

    isMemory() {
        return false;
    }

    /**
     * Clear any cached values (abstract).
     */

    _refresh() {
        this._hash = null;
        this._hhash = null;
    }

    /**
     * Clear any cached values.
     */

    refresh() {
        return this._refresh();
    }

    /**
     * Hash the block headers.
     * @param {String?} enc - Can be `'hex'` or `null`.
     * @returns {Hash|Buffer} hash
     */

    hash(enc) {
        let h = this._hash;

        if (!h) {
            h = digest.hash256(this.toHead());
            if (!this.mutable)
                this._hash = h;
        }

        if (enc === 'hex') {
            let hex = this._hhash;
            if (!hex) {
                hex = h.toString('hex');
                if (!this.mutable)
                    this._hhash = hex;
            }
            h = hex;
        }

        return h;
    }

    /**
     * Serialize the block headers.
     * @returns {Buffer}
     */

    toHead() {
        return this.writeHead(new StaticWriter(AbstractBlock.HeaderSize)).render();
    }

    /**
     * Inject properties from serialized data.
     * @private
     * @param {Buffer} data
     */

    fromHead(data) {
        return this.readHead(new BufferReader(data));
    }

    /**
     * Serialize the block headers.
     * @param {BufferWriter} bw
     */

    writeHead(bw) {
        bw.writeU32(this.version);
        bw.writeHash(this.prevBlock);
        bw.writeHash(this.merkleRoot);
        bw.writeBytes(this.sign);
        bw.writeU8(this.creator);
        bw.writeU32(this.time);
        bw.writeU32(this.height);
        return bw;
    }

    /**
     * Parse the block headers.
     * @param {BufferReader} br
     */

    readHead(br) {
        this.version = br.readU32();
        this.prevBlock = br.readHash('hex');
        this.merkleRoot = br.readHash('hex');
        this.sign = br.readBytes(64);
        this.creator = br.readU8();
        this.time = br.readU32();
        this.height = br.readU32();
        return this;
    }
    /** 
     * @param {KeyRing} keyring
     * @param {Number} creator
     */
    signCreator(keyring, creator) {
        this.sign = keyring.signToBuffer(Buffer.from(this.merkleRoot, 'hex'));
        this.creator = creator;
    }
    /**
     * 
     * @param {Map} metas 
     */
    verifyCreator(metas) {
        let creatorKey = null;
        if (this.height === 0) {
            creatorKey = KeyRing.fromPublic(Buffer.from(config.systemPubKey, 'hex'));
        } else {
            //creatorKey = KeyRing.fromPublic(metas.get(this.creator));
            creatorKey = KeyRing.fromPublic(Buffer.from(config.systemPubKey, 'hex'));
        }
        return creatorKey.verifyFromBuffer(Buffer.from(this.merkleRoot, 'hex'), this.sign);
    }

    /**
     * Verify the block.
     * @returns {Boolean}
     */

    verify(metas) {
        //if (!this.verifyCreator(metas))
        //    return false;

        if (!this.verifyBody())
            return false;

        return true;
    }

    /**
     * Verify the block.
     * @returns {Boolean}
     */

    verifyBody() {
        throw new Error('Abstract method.');
    }

    /**
     * Get little-endian block hash.
     * @returns {Hash}
     */

    rhash() {
        return util.revHex(this.hash('hex'));
    }

    /**
     * Convert the block to an inv item.
     * @returns {InvItem}
     */

    toInv() {
        return new InvItem(InvItem.types.BLOCK, this.hash('hex'));
    }
}

AbstractBlock.HeaderSize = 76 + 64 + 1;
/*
 * Expose
 */

module.exports = AbstractBlock;
