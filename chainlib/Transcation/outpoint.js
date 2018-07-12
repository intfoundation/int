/*!
 * outpoint.js - outpoint object for bcoin
 * Copyright (c) 2014-2017, Christopher Jeffrey (MIT License).
 * https://github.com/bcoin-org/bcoin
 */

'use strict';

const assert = require('assert');
const util = require('../Utils/util');
const StaticWriter = require('../Utils/staticwriter');
const BufferReader = require('../Utils/reader');
const encoding = require('../Utils/encoding');

/**
 * Represents a COutPoint.
 * @alias module:primitives.Outpoint
 * @constructor
 * @param {Hash?} hash
 * @param {Number?} index
 * @property {Hash} hash
 * @property {Number} index
 */

class Outpoint {

    constructor(hash, index) {
        if (!(this instanceof Outpoint))
            return new Outpoint(hash, index);

        this.hash = encoding.NULL_HASH;
        this.index = 0xffffffff;

        if (hash != null) {
            assert(typeof hash === 'string', 'Hash must be a string.');
            assert(util.isU32(index), 'Index must be a uint32.');
            this.hash = hash;
            this.index = index;
        }
    }

    /**
     * Inject properties from options object.
     * @private
     * @param {Object} options
     */

    fromOptions(options) {
        assert(options, 'Outpoint data is required.');
        assert(typeof options.hash === 'string', 'Hash must be a string.');
        assert(util.isU32(options.index), 'Index must be a uint32.');
        this.hash = options.hash;
        this.index = options.index;
        return this;
    }

    /**
     * Instantate outpoint from options object.
     * @param {Object} options
     * @returns {Outpoint}
     */

    static fromOptions(options) {
        return new Outpoint().fromOptions(options);
    }

    /**
     * Clone the outpoint.
     * @returns {Outpoint}
     */

    clone() {
        const outpoint = new Outpoint();
        outpoint.hash = this.value;
        outpoint.index = this.index;
        return outpoint;
    }

    /**
     * Test equality against another outpoint.
     * @param {Outpoint} prevout
     * @returns {Boolean}
     */

    equals(prevout) {
        assert(Outpoint.isOutpoint(prevout));
        return this.hash === prevout.hash
            && this.index === prevout.index;
    }

    /**
     * Compare against another outpoint (BIP69).
     * @param {Outpoint} prevout
     * @returns {Number}
     */

    compare(prevout) {
        assert(Outpoint.isOutpoint(prevout));

        const cmp = util.strcmp(this.txid(), prevout.txid());

        if (cmp !== 0)
            return cmp;

        return this.index - prevout.index;
    }

    /**
     * Test whether the outpoint is null (hash of zeroes
     * with max-u32 index). Used to detect coinbases.
     * @returns {Boolean}
     */

    isNull() {
        return this.index === 0xffffffff && this.hash === encoding.NULL_HASH;
    }

    isData() {
        return this.index === 0x0 && this.hash === encoding.NULL_HASH;
    }

    setIsData() {
        this.index = 0x0;
        this.hash = encoding.NULL_HASH;
    }

    /**
     * Get little-endian hash.
     * @returns {Hash}
     */

    rhash() {
        return util.revHex(this.hash);
    }

    /**
     * Get little-endian hash.
     * @returns {Hash}
     */

    txid() {
        return this.rhash();
    }

    /**
     * Serialize outpoint to a key
     * suitable for a hash table.
     * @returns {String}
     */

    toKey() {
        return Outpoint.toKey(this.hash, this.index);
    }

    /**
     * Inject properties from hash table key.
     * @private
     * @param {String} key
     * @returns {Outpoint}
     */

    fromKey(key) {
        assert(key.length > 64);
        this.hash = key.slice(0, 64);
        this.index = parseInt(key.slice(64), 10);
        return this;
    }

    /**
     * Instantiate outpoint from hash table key.
     * @param {String} key
     * @returns {Outpoint}
     */

    static fromKey(key) {
        return new Outpoint().fromKey(key);
    }

    /**
     * Write outpoint to a buffer writer.
     * @param {BufferWriter} bw
     */

    toWriter(bw) {
        bw.writeHash(this.hash);
        bw.writeU32(this.index);
        return bw;
    }

    /**
     * Calculate size of outpoint.
     * @returns {Number}
     */

    getSize() {
        return 36;
    }

    /**
     * Serialize outpoint.
     * @returns {Buffer}
     */

    toRaw() {
        return this.toWriter(new StaticWriter(36)).render();
    }

    /**
     * Inject properties from buffer reader.
     * @private
     * @param {BufferReader} br
     */

    fromReader(br) {
        this.hash = br.readHash('hex');
        this.index = br.readU32();
        return this;
    }

    /**
     * Inject properties from serialized data.
     * @private
     * @param {Buffer} data
     */

    fromRaw(data) {
        return this.fromReader(new BufferReader(data));
    }

    /**
     * Instantiate outpoint from a buffer reader.
     * @param {BufferReader} br
     * @returns {Outpoint}
     */

    static fromReader(br) {
        return new Outpoint().fromReader(br);
    }

    /**
     * Instantiate outpoint from serialized data.
     * @param {Buffer} data
     * @returns {Outpoint}
     */

    static fromRaw(data) {
        return new Outpoint().fromRaw(data);
    }

    /**
     * Inject properties from json object.
     * @private
     * @params {Object} json
     */

    fromJSON(json) {
        assert(json, 'Outpoint data is required.');
        assert(typeof json.hash === 'string', 'Hash must be a string.');
        assert(util.isU32(json.index), 'Index must be a uint32.');
        this.hash = util.revHex(json.hash);
        this.index = json.index;
        return this;
    }

    /**
     * Convert the outpoint to an object suitable
     * for JSON serialization. Note that the hash
     * will be reversed to abide by bitcoind's legacy
     * of little-endian uint256s.
     * @returns {Object}
     */

    toJSON() {
        return {
            hash: util.revHex(this.hash),
            index: this.index
        }
    }

    /**
     * Instantiate outpoint from json object.
     * @param {Object} json
     * @returns {Outpoint}
     */

    static fromJSON(json) {
        return new Outpoint().fromJSON(json);
    }

    /**
     * Inject properties from tx.
     * @private
     * @param {TX} tx
     * @param {Number} index
     */

    fromTX(tx, index) {
        assert(tx);
        assert(typeof index === 'number');
        assert(index >= 0);
        this.hash = tx.hash('hex');
        this.index = index;
        return this;
    }

    /**
     * Instantiate outpoint from tx.
     * @param {TX} tx
     * @param {Number} index
     * @returns {Outpoint}
     */

    static fromTX(tx, index) {
        return new Outpoint().fromTX(tx, index);
    }

    /**
     * Serialize outpoint to a key
     * suitable for a hash table.
     * @param {Hash} hash
     * @param {Number} index
     * @returns {String}
     */

    static toKey(hash, index) {
        assert(typeof hash === 'string');
        assert(hash.length === 64);
        assert(index >= 0);
        return hash + index;
    }

    /**
     * Convert the outpoint to a user-friendly string.
     * @returns {String}
     */

    inspect() {
        return `<Outpoint: ${this.rhash()}/${this.index}>`;
    }

    /**
     * Test an object to see if it is an outpoint.
     * @param {Object} obj
     * @returns {Boolean}
     */

    static isOutpoint(obj) {
        return obj instanceof Outpoint;
    }
}
/*
 * Expose
 */

module.exports = Outpoint;
