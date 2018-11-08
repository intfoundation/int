"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const fs = require("fs-extra");
const error_code_1 = require("../error_code");
const digest = require('../lib/digest');
class StorageDumpSnapshot {
    constructor(blockHash, filePath) {
        this.m_blockHash = blockHash;
        this.m_filePath = filePath;
    }
    get blockHash() {
        return this.m_blockHash;
    }
    get filePath() {
        return this.m_filePath;
    }
    exists() {
        return fs.existsSync(this.m_filePath);
    }
    async messageDigest() {
        let buf = await fs.readFile(this.m_filePath);
        let hash = digest.hash256(buf).toString('hex');
        return { err: error_code_1.ErrorCode.RESULT_OK, value: hash };
    }
    remove() {
        if (fs.existsSync(this.filePath)) {
            fs.removeSync(this.filePath);
            return error_code_1.ErrorCode.RESULT_OK;
        }
        return error_code_1.ErrorCode.RESULT_NOT_FOUND;
    }
}
exports.StorageDumpSnapshot = StorageDumpSnapshot;
