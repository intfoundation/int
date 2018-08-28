"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const block_1 = require("./block");
const writer_1 = require("../lib/writer");
const reader_1 = require("../lib/reader");
const error_code_1 = require("../error_code");
const assert = require("assert");
const LRUCache_1 = require("../lib/LRUCache");
const Lock_1 = require("../lib/Lock");
const tx_storage_1 = require("./tx_storage");
const initHeaderSql = 'CREATE TABLE IF NOT EXISTS "headers"("hash" CHAR(64) PRIMARY KEY NOT NULL UNIQUE, "pre" CHAR(64) NOT NULL, "verified" TINYINT NOT NULL, "raw" BLOB NOT NULL);';
const initBestSql = 'CREATE TABLE IF NOT EXISTS "best"("height" INTEGER PRIMARY KEY NOT NULL UNIQUE, "hash" CHAR(64) NOT NULL,  "timestamp" INTEGER NOT NULL);';
const getByHashSql = 'SELECT raw, verified FROM headers WHERE hash = $hash';
const getByTimestampSql = 'SELECT h.raw, h.verified FROM headers AS h LEFT JOIN best AS b ON b.hash = h.hash WHERE b.timestamp = $timestamp';
const getHeightOnBestSql = 'SELECT b.height, h.raw, h.verified FROM headers AS h LEFT JOIN best AS b ON b.hash = h.hash WHERE b.hash = $hash';
const getByHeightSql = 'SELECT h.raw, h.verified FROM headers AS h LEFT JOIN best AS b ON b.hash = h.hash WHERE b.height = $height';
const insertHeaderSql = 'INSERT INTO headers (hash, pre, raw, verified) VALUES($hash, $pre, $raw, $verified)';
const getBestHeightSql = 'SELECT max(height) AS height FROM best';
const rollbackBestSql = 'DELETE best WHERE height > $height';
const extendBestSql = 'INSERT INTO best (hash, height, timestamp) VALUES($hash, $height, $timestamp)';
const getTipSql = 'SELECT h.raw, h.verified FROM headers AS h LEFT JOIN best AS b ON b.hash = h.hash ORDER BY b.height DESC';
const updateVerifiedSql = 'UPDATE headers SET verified=$verified WHERE hash=$hash';
const getByPreBlockSql = 'SELECT raw, verified FROM headers WHERE pre = $pre';
var VERIFY_STATE;
(function (VERIFY_STATE) {
    VERIFY_STATE[VERIFY_STATE["notVerified"] = 0] = "notVerified";
    VERIFY_STATE[VERIFY_STATE["verified"] = 1] = "verified";
    VERIFY_STATE[VERIFY_STATE["invalid"] = 2] = "invalid";
})(VERIFY_STATE = exports.VERIFY_STATE || (exports.VERIFY_STATE = {}));
class BlockHeaderEntry {
    constructor(blockheader, verified) {
        this.blockheader = blockheader;
        this.verified = verified;
    }
}
class HeaderStorage {
    constructor(options) {
        this.m_transactionLock = new Lock_1.Lock();
        this.m_db = options.db;
        this.m_blockHeaderType = options.blockHeaderType;
        this.m_logger = options.logger;
        this.m_cacheHeight = new LRUCache_1.LRUCache(100);
        this.m_cacheHash = new LRUCache_1.LRUCache(100);
        this.m_txView = new tx_storage_1.TxStorage({ logger: options.logger, db: options.db, blockstorage: options.blockStorage });
    }
    get txView() {
        return this.m_txView;
    }
    async init() {
        try {
            let stmt = await this.m_db.run(initHeaderSql);
            stmt = await this.m_db.run(initBestSql);
        }
        catch (e) {
            this.m_logger.error(e);
            return error_code_1.ErrorCode.RESULT_EXCEPTION;
        }
        return await this.m_txView.init();
    }
    uninit() {
        this.m_txView.uninit();
    }
    async getHeader(arg1, arg2) {
        let header;
        if (arg2 === undefined || arg2 === undefined) {
            if (arg1 instanceof block_1.BlockHeader) {
                assert(false);
                return { err: error_code_1.ErrorCode.RESULT_INVALID_PARAM };
            }
            return await this._loadHeader(arg1);
        }
        else {
            let fromHeader;
            if (arg1 instanceof block_1.BlockHeader) {
                fromHeader = arg1;
            }
            else {
                let hr = await this._loadHeader(arg1);
                if (hr.err) {
                    return hr;
                }
                fromHeader = hr.header;
            }
            let headers = [];
            headers.push(fromHeader);
            if (arg2 > 0) {
                assert(false);
                return { err: error_code_1.ErrorCode.RESULT_INVALID_PARAM };
            }
            else {
                if (fromHeader.number + arg2 < 0) {
                    arg2 = -fromHeader.number;
                }
                for (let ix = 0; ix < -arg2; ++ix) {
                    let hr = await this._loadHeader(fromHeader.preBlockHash);
                    if (hr.err) {
                        return hr;
                    }
                    fromHeader = hr.header;
                    headers.push(fromHeader);
                }
                headers = headers.reverse();
                return { err: error_code_1.ErrorCode.RESULT_OK, header: headers[0], headers };
            }
        }
    }
    async _loadHeader(arg) {
        let rawHeader;
        let verified;
        if (typeof arg === 'number') {
            let headerEntry = this.m_cacheHeight.get(arg);
            if (headerEntry) {
                return { err: error_code_1.ErrorCode.RESULT_OK, header: headerEntry.blockheader, verified: headerEntry.verified };
            }
            try {
                let result = await this.m_db.get(getByHeightSql, { $height: arg });
                if (!result) {
                    return { err: error_code_1.ErrorCode.RESULT_NOT_FOUND };
                }
                rawHeader = result.raw;
                verified = result.verified;
            }
            catch (e) {
                this.m_logger.error(`load Header height ${arg} failed, ${e}`);
                return { err: error_code_1.ErrorCode.RESULT_EXCEPTION };
            }
        }
        else if (typeof arg === 'string') {
            if (arg === 'latest') {
                try {
                    let result = await this.m_db.get(getTipSql);
                    if (!result) {
                        return { err: error_code_1.ErrorCode.RESULT_NOT_FOUND };
                    }
                    rawHeader = result.raw;
                    verified = result.verified;
                }
                catch (e) {
                    this.m_logger.error(`load latest Header failed, ${e}`);
                    return { err: error_code_1.ErrorCode.RESULT_EXCEPTION };
                }
            }
            else {
                let headerEntry = this.m_cacheHash.get(arg);
                if (headerEntry) {
                    this.m_logger.debug(`get header storage directly from cache hash: ${headerEntry.blockheader.hash} number: ${headerEntry.blockheader.number} verified: ${headerEntry.verified}`);
                    return { err: error_code_1.ErrorCode.RESULT_OK, header: headerEntry.blockheader, verified: headerEntry.verified };
                }
                try {
                    let result = await this.m_db.get(getByHashSql, { $hash: arg });
                    if (!result) {
                        return { err: error_code_1.ErrorCode.RESULT_NOT_FOUND };
                    }
                    rawHeader = result.raw;
                    verified = result.verified;
                }
                catch (e) {
                    this.m_logger.error(`load Header hash ${arg} failed, ${e}`);
                    return { err: error_code_1.ErrorCode.RESULT_EXCEPTION };
                }
            }
        }
        else {
            return { err: error_code_1.ErrorCode.RESULT_INVALID_PARAM };
        }
        let header = new this.m_blockHeaderType();
        let err = header.decode(new reader_1.BufferReader(rawHeader, false));
        if (err !== error_code_1.ErrorCode.RESULT_OK) {
            this.m_logger.error(`decode header ${arg} from header storage failed`);
            return { err };
        }
        if (arg !== 'latest' && header.number !== arg && header.hash !== arg) {
            return { err: error_code_1.ErrorCode.RESULT_EXCEPTION };
        }
        let entry = new BlockHeaderEntry(header, verified);
        this.m_logger.debug(`update header storage cache hash: ${header.hash} number: ${header.number} verified: ${verified}`);
        this.m_cacheHash.set(header.hash, entry);
        if (typeof arg === 'number') {
            this.m_cacheHeight.set(header.number, entry);
        }
        return { err: error_code_1.ErrorCode.RESULT_OK, header, verified };
    }
    async getHeightOnBest(hash) {
        let result = await this.m_db.get(getHeightOnBestSql, { $hash: hash });
        if (!result || result.height === undefined) {
            return { err: error_code_1.ErrorCode.RESULT_NOT_FOUND };
        }
        let header = new this.m_blockHeaderType();
        let err = header.decode(new reader_1.BufferReader(result.raw, false));
        if (err !== error_code_1.ErrorCode.RESULT_OK) {
            this.m_logger.error(`decode header ${hash} from header storage failed`);
            return { err };
        }
        return { err: error_code_1.ErrorCode.RESULT_OK, height: result.height, header };
    }
    async _saveHeader(header) {
        let writer = new writer_1.BufferWriter();
        let err = header.encode(writer);
        if (err) {
            this.m_logger.error(`encode header failed `, err);
            return err;
        }
        try {
            let headerRaw = writer.render();
            await this.m_db.run(insertHeaderSql, { $hash: header.hash, $raw: headerRaw, $pre: header.preBlockHash, $verified: VERIFY_STATE.notVerified });
        }
        catch (e) {
            this.m_logger.error(`save Header ${header.hash}(${header.number}) failed, ${e}`);
            return error_code_1.ErrorCode.RESULT_EXCEPTION;
        }
        return error_code_1.ErrorCode.RESULT_OK;
    }
    async saveHeader(header) {
        return await this._saveHeader(header);
    }
    async createGenesis(genesis) {
        assert(genesis.number === 0);
        if (genesis.number !== 0) {
            return error_code_1.ErrorCode.RESULT_INVALID_PARAM;
        }
        let writer = new writer_1.BufferWriter();
        let err = genesis.encode(writer);
        if (err) {
            this.m_logger.error(`genesis block encode failed`);
            return err;
        }
        let hash = genesis.hash;
        let headerRaw = writer.render();
        try {
            await this._begin();
        }
        catch (e) {
            this.m_logger.error(`createGenesis begin ${genesis.hash}(${genesis.number}) failed, ${e}`);
            return error_code_1.ErrorCode.RESULT_EXCEPTION;
        }
        try {
            await this.m_db.run(insertHeaderSql, { $hash: genesis.hash, $pre: genesis.preBlockHash, $raw: headerRaw, $verified: VERIFY_STATE.verified });
            await this.m_db.run(extendBestSql, { $hash: genesis.hash, $height: genesis.number, $timestamp: genesis.timestamp });
            await this._commit();
        }
        catch (e) {
            this.m_logger.error(`createGenesis ${genesis.hash}(${genesis.number}) failed, ${e}`);
            await this._rollback();
            return error_code_1.ErrorCode.RESULT_EXCEPTION;
        }
        return error_code_1.ErrorCode.RESULT_OK;
    }
    async getNextHeader(hash) {
        let query;
        try {
            query = await this.m_db.all(getByPreBlockSql, { $pre: hash });
        }
        catch (e) {
            this.m_logger.error(`getNextHeader ${hash} failed, ${e}`);
            return { err: error_code_1.ErrorCode.RESULT_EXCEPTION };
        }
        if (!query || !query.length) {
            return { err: error_code_1.ErrorCode.RESULT_NOT_FOUND };
        }
        let results = [];
        for (let result of query) {
            let header = new this.m_blockHeaderType();
            let err = header.decode(new reader_1.BufferReader(result.raw, false));
            if (err !== error_code_1.ErrorCode.RESULT_OK) {
                this.m_logger.error(`decode header ${result.hash} from header storage failed`);
                return { err };
            }
            results.push({ header, verified: result.verified });
        }
        return { err: error_code_1.ErrorCode.RESULT_OK, results };
    }
    async updateVerified(header, verified) {
        try {
            this.m_logger.debug(`remove header storage cache hash: ${header.hash} number: ${header.number}`);
            this.m_cacheHash.remove(header.hash);
            this.m_cacheHeight.remove(header.number);
            await this.m_db.run(updateVerifiedSql, { $hash: header.hash, $verified: verified });
        }
        catch (e) {
            this.m_logger.error(`updateVerified ${header.hash}(${header.number}) failed, ${e}`);
            return error_code_1.ErrorCode.RESULT_EXCEPTION;
        }
        return error_code_1.ErrorCode.RESULT_OK;
    }
    async changeBest(header) {
        let sqls = [];
        let txViewOp = [];
        sqls.push(`INSERT INTO best (hash, height, timestamp) VALUES("${header.hash}", "${header.number}", "${header.timestamp}")`);
        txViewOp.push({ op: 'add', value: header.hash });
        let forkFrom = header;
        while (true) {
            let result = await this.getHeightOnBest(forkFrom.preBlockHash);
            if (result.err === error_code_1.ErrorCode.RESULT_OK) {
                assert(result.header);
                forkFrom = result.header;
                sqls.push(`DELETE FROM best WHERE height > ${forkFrom.number}`);
                txViewOp.push({ op: 'remove', value: forkFrom.number });
                break;
            }
            else if (result.err === error_code_1.ErrorCode.RESULT_NOT_FOUND) {
                let _result = await this._loadHeader(forkFrom.preBlockHash);
                assert(_result.header);
                forkFrom = _result.header;
                sqls.push(`INSERT INTO best (hash, height, timestamp) VALUES("${forkFrom.hash}", "${forkFrom.number}", "${forkFrom.timestamp}")`);
                txViewOp.push({ op: 'add', value: forkFrom.hash });
                continue;
            }
            else {
                return result.err;
            }
        }
        sqls.push(`UPDATE headers SET verified="${VERIFY_STATE.verified}" WHERE hash="${header.hash}"`);
        sqls = sqls.reverse();
        txViewOp = txViewOp.reverse();
        await this._begin();
        try {
            for (let e of txViewOp) {
                let err;
                if (e.op === 'add') {
                    err = await this.m_txView.add(e.value);
                }
                else if (e.op === 'remove') {
                    err = await this.m_txView.remove(e.value);
                }
                else {
                    err = error_code_1.ErrorCode.RESULT_FAILED;
                }
                if (err !== error_code_1.ErrorCode.RESULT_OK) {
                    throw new Error(`run txview error,code=${err}`);
                }
            }
            for (let sql of sqls) {
                await this.m_db.run(sql);
            }
            await this._commit();
        }
        catch (e) {
            this.m_logger.error(`changeBest ${header.hash}(${header.number}) failed, ${e}`);
            this._rollback();
            return error_code_1.ErrorCode.RESULT_EXCEPTION;
        }
        this.m_logger.debug(`remove header storage cache hash: ${header.hash} number: ${header.number}`);
        this.m_cacheHash.remove(header.hash);
        this.m_cacheHeight.clear();
        return error_code_1.ErrorCode.RESULT_OK;
    }
    async _begin() {
        await this.m_transactionLock.enter();
        await this.m_db.run('BEGIN;');
    }
    async _commit() {
        await this.m_db.run('COMMIT;');
        this.m_transactionLock.leave();
    }
    async _rollback() {
        await this.m_db.run('ROLLBACK;');
        this.m_transactionLock.leave();
    }
}
exports.HeaderStorage = HeaderStorage;
