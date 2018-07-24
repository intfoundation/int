'use strict';
const LRU = require('../Utils/lru');
const Block = require('./block');
const fs = require('fs');
const path = require('path');
const {BaseLib} = require('../../base/base');

class BlockStorage {
    constructor(cacheSize, storagePath) {
        this.cache = new LRU(cacheSize);
        this.storagePath = storagePath;
        this.m_height = -1;
    }

    init() {
        BaseLib.mkdirsSync(path.join(this.storagePath, 'Block'));
    }
    _getRealPath(hash) {
        return path.join(this.storagePath, 'Block', hash);
    }

    has(blockHash) {
        if (fs.existsSync(this._getRealPath(blockHash))) {
            //write genesis block to storage
            return true;
        } else {
            return false;
        }
    }

    get(blockHash) {
        if (this.cache.has(blockHash)) {
            return this.cache.get(blockHash);
        } else {
            try {
                let blockRaw = fs.readFileSync(this._getRealPath(blockHash));
                let block = Block.fromRaw(blockRaw);
                this.cache.set(blockHash, block);
                return block;
            } catch (error) {
                console.log(`[block_storage get] error=${error}`);
                return null;
            }
        }
    }

    _add(hash, block, blockRaw) {
        this.cache.set(hash, block);
        fs.writeFileSync(this._getRealPath(hash), blockRaw);
        this.m_height = block.toHeaders().height;
    }

    add(block) {
        let hash = block.hash('hex');
        if (this.has(hash)) {
            return;
        }
        return this._add(hash, block, block.toRaw());
    }

    addRaw(blockRaw) {
        let block = Block.fromRaw(blockRaw);
        return this._add(block.hash('hex'), block, blockRaw);
    }

    getSize(blockHash) {
        if (!this.has(blockHash)) {
            return -1;
        }
        let stat = fs.statSync(this._getRealPath(blockHash));
        return stat.size;
    }

    getHeight() {
        return this.m_height;
    }
}

module.exports = BlockStorage;