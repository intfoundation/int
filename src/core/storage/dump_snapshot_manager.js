"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const path = require("path");
const fs = require("fs-extra");
const error_code_1 = require("../error_code");
const dump_snapshot_1 = require("./dump_snapshot");
class StorageDumpSnapshotManager {
    constructor(options) {
        this.m_path = path.join(options.path, 'dump');
        this.m_logger = options.logger;
        this.m_readonly = !!(options && options.readonly);
    }
    recycle() {
    }
    async init() {
        if (!this.m_readonly) {
            fs.ensureDirSync(this.m_path);
        }
        return error_code_1.ErrorCode.RESULT_OK;
    }
    uninit() {
        // do nothing
    }
    listSnapshots() {
        let blocks = fs.readdirSync(this.m_path);
        return blocks.map((blockHash) => {
            return new dump_snapshot_1.StorageDumpSnapshot(blockHash, this.getSnapshotFilePath(blockHash));
        });
    }
    getSnapshotFilePath(blockHash) {
        return path.join(this.m_path, blockHash);
    }
    async createSnapshot(from, blockHash) {
        this.m_logger.info(`creating snapshot ${blockHash}`);
        const snapshot = new dump_snapshot_1.StorageDumpSnapshot(blockHash, this.getSnapshotFilePath(blockHash));
        fs.copyFileSync(from.filePath, snapshot.filePath);
        return { err: error_code_1.ErrorCode.RESULT_OK, snapshot };
    }
    async getSnapshot(blockHash) {
        const snapshot = new dump_snapshot_1.StorageDumpSnapshot(blockHash, this.getSnapshotFilePath(blockHash));
        if (snapshot.exists()) {
            return { err: error_code_1.ErrorCode.RESULT_OK, snapshot };
        }
        else {
            return { err: error_code_1.ErrorCode.RESULT_NOT_FOUND };
        }
    }
    releaseSnapshot(blockHash) {
    }
    removeSnapshot(blockHash) {
        const snapshot = new dump_snapshot_1.StorageDumpSnapshot(blockHash, this.getSnapshotFilePath(blockHash));
        try {
            fs.removeSync(snapshot.filePath);
        }
        catch (e) {
            this.m_logger.error(`removeSnapshot ${blockHash} `, e);
            return error_code_1.ErrorCode.RESULT_EXCEPTION;
        }
        return error_code_1.ErrorCode.RESULT_OK;
    }
}
exports.StorageDumpSnapshotManager = StorageDumpSnapshotManager;
