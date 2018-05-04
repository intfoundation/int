/*!
 * coin.js - coin object for bcoin
 * Copyright (c) 2014-2015, Fedor Indutny (MIT License)
 * Copyright (c) 2014-2017, Christopher Jeffrey (MIT License).
 * https://github.com/bcoin-org/bcoin
 */

'use strict';

const assert = require('assert');
const util = require('../Utils/util');
const Amount = require('../Coins/amount');
const Output = require('../Transcation/output');
const Script = require('../script/script');
const Network = require('../Protocol/network');
const BufferReader = require('../Utils/reader');
const StaticWriter = require('../Utils/staticwriter');
const encoding = require('../Utils/encoding');

/**
 * Represents an unspent output.
 * @alias module:primitives.Coin
 * @constructor
 * @extends Output
 * @param {NakedCoin|Coin} options
 * @property {Number} version - Transaction version.
 * @property {Number} height - Transaction height (-1 if unconfirmed).
 * @property {Amount} value - Output value in satoshis.
 * @property {Script} script - Output script.
 * @property {Boolean} coinbase - Whether the containing
 * transaction is a coinbase.
 * @property {Hash} hash - Transaction hash.
 * @property {Number} index - Output index.
 */
class Coin extends Output {
    constructor(options) {
        super();
        if (!(this instanceof Coin))
            return new Coin(options);

        this.version = 1;
        this.height = -1;
        this.value = 0;
        this.script = new Script();
        this.coinbase = false;
        this.hash = encoding.NULL_HASH;
        this.index = 0;

        if (options)
            this.fromOptions(options);
    }

    /**
     * Inject options into coin.
     * @private
     * @param {Object} options
     */

    fromOptions(options) {
        assert(options, 'Coin data is required.');

        if (options.version != null) {
            assert(util.isU32(options.version), 'Version must be a uint32.');
            this.version = options.version;
        }

        if (options.height != null) {
            if (options.height !== -1) {
                assert(util.isU32(options.height), 'Height must be a uint32.');
                this.height = options.height;
            } else {
                this.height = -1;
            }
        }

        if (options.value != null) {
            assert(util.isU64(options.value), 'Value must be a uint64.');
            this.value = options.value;
        }

        if (options.script)
            this.script.fromOptions(options.script);

        if (options.coinbase != null) {
            assert(typeof options.coinbase === 'boolean',
                'Coinbase must be a boolean.');
            this.coinbase = options.coinbase;
        }

        if (options.hash != null) {
            assert(typeof options.hash === 'string', 'Hash must be a string.');
            this.hash = options.hash;
        }

        if (options.index != null) {
            assert(util.isU32(options.index), 'Index must be a uint32.');
            this.index = options.index;
        }

        return this;
    }

    /**
     * Instantiate Coin from options object.
     * @private
     * @param {Object} options
     */

    static fromOptions(options) {
        return new Coin().fromOptions(options);
    }

    /**
     * Clone the coin.
     * @private
     * @returns {Coin}
     */

    clone() {
        assert(false, 'Coins are not cloneable.');
    }

    /**
     * Calculate number of confirmations since coin was created.
     * @param {Number?} height - Current chain height. Network
     * height is used if not passed in.
     * @return {Number}
     */

    getDepth(height) {
        assert(typeof height === 'number', 'Must pass a height.');

        if (this.height === -1)
            return 0;

        if (height === -1)
            return 0;

        if (height < this.height)
            return 0;

        return height - this.height + 1;
    }

    /**
     * Serialize coin to a key
     * suitable for a hash table.
     * @returns {String}
     */

    toKey() {
        return this.hash + this.index;
    }

    /**
     * Inject properties from hash table key.
     * @private
     * @param {String} key
     * @returns {Coin}
     */

    fromKey(key) {
        assert(key.length > 64);
        this.hash = key.slice(0, 64);
        this.index = parseInt(key.slice(64), 10);
        return this;
    }

    /**
     * Instantiate coin from hash table key.
     * @param {String} key
     * @returns {Coin}
     */

    static fromKey(key) {
        return new Coin().fromKey(key);
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
     * Convert the coin to a more user-friendly object.
     * @returns {Object}
     */

    inspect() {
        return {
            type: this.getType(),
            version: this.version,
            height: this.height,
            value: Amount.btc(this.value),
            script: this.script,
            coinbase: this.coinbase,
            hash: this.hash ? util.revHex(this.hash) : null,
            index: this.index,
            address: this.getAddress()
        }
    }

    /**
     * Convert the coin to an object suitable
     * for JSON serialization.
     * @returns {Object}
     */

    toJSON() {
        return this.getJSON();
    }

    /**
     * Convert the coin to an object suitable
     * for JSON serialization. Note that the hash
     * will be reversed to abide by bitcoind's legacy
     * of little-endian uint256s.
     * @param {Network} network
     * @param {Boolean} minimal
     * @returns {Object}
     */

    getJSON(network, minimal) {
        let addr = this.getAddress();

        network = Network.get(network);

        if (addr)
            addr = addr.toString(network);

        return {
            version: this.version,
            height: this.height,
            value: this.value,
            script: this.script.toJSON(),
            address: addr,
            coinbase: this.coinbase,
            hash: !minimal ? this.rhash() : undefined,
            index: !minimal ? this.index : undefined
        }
    }

    /**
     * Inject JSON properties into coin.
     * @private
     * @param {Object} json
     */

    fromJSON(json) {
        assert(json, 'Coin data required.');
        assert(util.isU32(json.version), 'Version must be a uint32.');
        assert(json.height === -1 || util.isU32(json.height),
            'Height must be a uint32.');
        assert(util.isU64(json.value), 'Value must be a uint64.');
        assert(typeof json.coinbase === 'boolean', 'Coinbase must be a boolean.');

        this.version = json.version;
        this.height = json.height;
        this.value = json.value;
        this.script.fromJSON(json.script);
        this.coinbase = json.coinbase;

        if (json.hash != null) {
            assert(typeof json.hash === 'string', 'Hash must be a string.');
            assert(json.hash.length === 64, 'Hash must be a string.');
            assert(util.isU32(json.index), 'Index must be a uint32.');
            this.hash = util.revHex(json.hash);
            this.index = json.index;
        }

        return this;
    }

    /**
     * Instantiate an Coin from a jsonified coin object.
     * @param {Object} json - The jsonified coin object.
     * @returns {Coin}
     */

    static fromJSON(json) {
        return new Coin().fromJSON(json);
    }

    /**
     * Calculate size of coin.
     * @returns {Number}
     */

    getSize() {
        return 17 + this.script.getVarSize();
    }

    /**
     * Write the coin to a buffer writer.
     * @param {BufferWriter} bw
     */

    toWriter(bw) {
        let height = this.height;

        if (height === -1)
            height = 0x7fffffff;

        bw.writeU32(this.version);
        bw.writeU32(height);
        bw.writeI64(this.value);
        bw.writeVarBytes(this.script.toRaw());
        bw.writeU8(this.coinbase ? 1 : 0);

        return bw;
    }

    /**
     * Serialize the coin.
     * @returns {Buffer|String}
     */

    toRaw() {
        const size = this.getSize();
        return this.toWriter(new StaticWriter(size)).render();
    }

    /**
     * Inject properties from serialized buffer writer.
     * @private
     * @param {BufferReader} br
     */

    fromReader(br) {
        this.version = br.readU32();
        this.height = br.readU32();
        this.value = br.readI64();
        this.script.fromRaw(br.readVarBytes());
        this.coinbase = br.readU8() === 1;

        if (this.height === 0x7fffffff)
            this.height = -1;

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
     * Instantiate a coin from a buffer reader.
     * @param {BufferReader} br
     * @returns {Coin}
     */

    static fromReader(br) {
        return new Coin().fromReader(br);
    }

    /**
     * Instantiate a coin from a serialized Buffer.
     * @param {Buffer} data
     * @param {String?} enc - Encoding, can be `'hex'` or null.
     * @returns {Coin}
     */

    static fromRaw(data, enc) {
        if (typeof data === 'string')
            data = Buffer.from(data, enc);
        return new Coin().fromRaw(data);
    }

    /**
     * Inject properties from TX.
     * @param {TX} tx
     * @param {Number} index
     */

    fromTX(tx, index, height) {
        assert(typeof index === 'number');
        assert(typeof height === 'number');
        assert(index >= 0 && index < tx.outputs.length);
        this.version = tx.version;
        this.height = height;
        this.value = tx.outputs[index].value;
        this.script = tx.outputs[index].script;
        this.coinbase = tx.isCoinbase();
        this.hash = tx.hash('hex');
        this.index = index;
        return this;
    }

    /**
     * Instantiate a coin from a TX
     * @param {TX} tx
     * @param {Number} index - Output index.
     * @returns {Coin}
     */

    static fromTX(tx, index, height) {
        return new Coin().fromTX(tx, index, height);
    }

    /**
     * Test an object to see if it is a Coin.
     * @param {Object} obj
     * @returns {Boolean}
     */

    static isCoin(obj) {
        return obj instanceof Coin;
    }
}
/*
 * Expose
 */

module.exports = Coin;
