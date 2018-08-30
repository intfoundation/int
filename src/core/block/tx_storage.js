"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const error_code_1 = require("../error_code");
let assert = require('assert');
const initSql = 'CREATE TABLE IF NOT EXISTS "txview"("txhash" CHAR(64) PRIMARY KEY NOT NULL UNIQUE, "address" CHAR(64) NOT NULL, "blockheight" INTEGER NOT NULL, "blockhash" CHAR(64) NOT NULL);';
class TxStorage {
    constructor(options) {
        this.m_db = options.db;
        this.m_logger = options.logger;
        this.m_blockStorage = options.blockstorage;
    }
    async init() {
        try {
            await this.m_db.run(initSql);
        }
        catch (e) {
            this.m_logger.error(e);
            return error_code_1.ErrorCode.RESULT_EXCEPTION;
        }
        return error_code_1.ErrorCode.RESULT_OK;
    }
    uninit() {
        // do nothing
    }
    async add(blockhash) {
        if (!this.m_blockStorage.has(blockhash)) {
            assert(false, `can't find block ${blockhash} when update tx storage`);
            return error_code_1.ErrorCode.RESULT_NOT_FOUND;
        }
        let block = this.m_blockStorage.get(blockhash);
        if (!block) {
            this.m_logger.error(`can't load ${blockhash} when update tx storage`);
            return error_code_1.ErrorCode.RESULT_INVALID_BLOCK;
        }
        try {
            for (let tx of block.content.transactions) {
                await this.m_db.run(`insert into txview (txhash, address, blockheight, blockhash) values ("${tx.hash}","${tx.address}", ${block.number}, "${block.hash}")`);
            }
        }
        catch (e) {
            this.m_logger.error(`add exception,error=${e},blockhash=${blockhash}`);
            return error_code_1.ErrorCode.RESULT_EXCEPTION;
        }
        return error_code_1.ErrorCode.RESULT_OK;
    }
    async remove(nBlockHeight) {
        try {
            await this.m_db.run(`delete from txview where blockheight > ${nBlockHeight}`);
        }
        catch (e) {
            this.m_logger.error(`remove exception,error=${e},height=${nBlockHeight}`);
            return error_code_1.ErrorCode.RESULT_EXCEPTION;
        }
        return error_code_1.ErrorCode.RESULT_OK;
    }
    async get(txHash) {
        try {
            let result = await this.m_db.get(`select blockhash from txview where txhash="${txHash}"`);
            if (!result || result.blockhash === undefined) {
                return { err: error_code_1.ErrorCode.RESULT_NOT_FOUND };
            }
            return { err: error_code_1.ErrorCode.RESULT_OK, blockhash: result.blockhash };
        }
        catch (e) {
            this.m_logger.error(`get exception,error=${e},txHash=${txHash}`);
            return { err: error_code_1.ErrorCode.RESULT_EXCEPTION };
        }
    }
    async getCountByAddress(address) {
        try {
            let result = await this.m_db.get(`select count(*) as value from txview where address="${address}"`);
            if (!result || result.value === undefined) {
                return { err: error_code_1.ErrorCode.RESULT_FAILED };
            }
            return { err: error_code_1.ErrorCode.RESULT_OK, count: result.value };
        }
        catch (e) {
            this.m_logger.error(`getCountByAddress exception,error=${e},address=${address}`);
            return { err: error_code_1.ErrorCode.RESULT_EXCEPTION };
        }
    }
}
exports.TxStorage = TxStorage;
