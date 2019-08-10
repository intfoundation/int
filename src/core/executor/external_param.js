"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require('assert');
const error_code_1 = require("../error_code");
const fs = require("fs-extra");
const storage_1 = require("../storage_sqlite/storage");
class InprocessStorageParam {
    constructor(options) {
        this.m_logger = options.logger;
    }
    get type() {
        return InprocessStorageParam.type;
    }
    async init(options) {
        this.m_logger.debug(`begin create external storage param ${options.blockHash}`);
        const vr = await options.storageManager.getSnapshotView(options.blockHash);
        if (vr.err) {
            this.m_logger.error(`create extern storage param ${options.blockHash} failed for ${error_code_1.stringifyErrorCode(vr.err)}`);
            return vr.err;
        }
        this.m_storage = vr.storage;
        this.m_storageManager = options.storageManager;
        this.m_blockHash = options.blockHash;
        return error_code_1.ErrorCode.RESULT_OK;
    }
    get value() {
        return this.m_storage;
    }
    finalize() {
        if (!this.m_blockHash) {
            return;
        }
        this.m_logger.debug(`extern storage param ${this.m_blockHash} finalized`);
        this.m_storageManager.releaseSnapshotView(this.m_blockHash);
        if (this.m_encodedPath && fs.existsSync(this.m_encodedPath)) {
            this.m_logger.debug(`extern storage param ${this.m_blockHash} has encoded, remove encode path ${this.m_encodedPath}`);
            fs.unlinkSync(this.m_encodedPath);
        }
    }
    async interprocessEncode() {
        assert(this.m_storageManager, `try to interprocess encode null storage`);
        if (this.m_encodedPath) {
            assert(false, `encode twice, last encode path is ${this.m_encodedPath}`);
            return { err: error_code_1.ErrorCode.RESULT_ALREADY_EXIST };
        }
        const name = `${Date.now()}${this.m_blockHash}`;
        this.m_logger.debug(`interprocess encode storage param ${this.m_blockHash} to path ${name}`);
        const csr = await this.m_storageManager.createStorage(name, this.m_blockHash);
        if (csr.err) {
            this.m_logger.error(`interprocess encode storage param ${this.m_blockHash} failed for ${error_code_1.stringifyErrorCode(csr.err)}`);
            return { err: csr.err };
        }
        this.m_encodedPath = csr.storage.filePath;
        await csr.storage.uninit();
        return {
            err: error_code_1.ErrorCode.RESULT_OK,
            result: {
                path: this.m_encodedPath
            }
        };
    }
}
InprocessStorageParam.type = 'storage';
class InterprocessStorageParam {
    constructor(options) {
        this.m_logger = options.logger;
    }
    get type() {
        return InprocessStorageParam.type;
    }
    async init(options) {
        let storage = new storage_1.SqliteStorage({
            filePath: options.encoded.path,
            logger: this.m_logger
        });
        const err = await storage.init(true);
        if (err) {
            return err;
        }
        this.m_storage = storage;
        return error_code_1.ErrorCode.RESULT_OK;
    }
    get value() {
        return this.m_storage;
    }
    finalize() {
        if (!this.m_storage) {
            return;
        }
        this.m_logger.debug(`interprocess extern storage param ${this.m_storage.filePath} finalize`);
        this.m_storage.uninit();
    }
    async interprocessEncode() {
        assert(false, `should not encode storage param in worker routine`);
        return { err: error_code_1.ErrorCode.RESULT_NO_IMP };
    }
}
class BlockExecutorExternParamCreator {
    constructor(options) {
        this.m_logger = options.logger;
    }
    async createStorage(options) {
        const p = new InprocessStorageParam({
            logger: this.m_logger
        });
        const err = await p.init(options);
        if (err) {
            return { err };
        }
        return { err: error_code_1.ErrorCode.RESULT_OK, param: p };
    }
    async interprocessEncode(params) {
        let err = error_code_1.ErrorCode.RESULT_OK;
        let ops = [];
        for (const p of params) {
            if (p.type === InprocessStorageParam.type) {
            }
            else {
                err = error_code_1.ErrorCode.RESULT_INVALID_PARAM;
                break;
            }
            ops.push(p.interprocessEncode());
        }
        if (err) {
            return { err };
        }
        let results = await Promise.all(ops);
        let encoded = [];
        for (let ix = 0; ix < results.length; ++ix) {
            const r = results[ix];
            const p = params[ix];
            if (r.err) {
                return { err: r.err };
            }
            encoded.push({
                type: p.type,
                encoded: r.result
            });
        }
        return { err: error_code_1.ErrorCode.RESULT_OK, encoded };
    }
    async interprocessDecode(encoded) {
        let params = [];
        let err = error_code_1.ErrorCode.RESULT_OK;
        let ops = [];
        for (const e of encoded) {
            if (e.type === InprocessStorageParam.type) {
                ops.push(this._decodeStorage(e.encoded));
            }
            else {
                err = error_code_1.ErrorCode.RESULT_INVALID_PARAM;
            }
        }
        if (err) {
            return { err };
        }
        const results = await Promise.all(ops);
        for (const r of results) {
            if (r.err) {
                return { err: r.err };
            }
            params.push(r.param);
        }
        return { err: error_code_1.ErrorCode.RESULT_OK, params };
    }
    async _decodeStorage(encoded) {
        const p = new InterprocessStorageParam({
            logger: this.m_logger
        });
        const err = await p.init({ encoded });
        if (err) {
            return { err };
        }
        return { err: error_code_1.ErrorCode.RESULT_OK, param: p };
    }
}
exports.BlockExecutorExternParamCreator = BlockExecutorExternParamCreator;
