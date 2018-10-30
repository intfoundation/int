"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const fs = require("fs-extra");
const path = require("path");
const assert = require("assert");
const error_code_1 = require("../error_code");
const serializable_1 = require("../serializable");
const js_log_1 = require("./js_log");
const dump_snapshot_1 = require("./dump_snapshot");
const dump_snapshot_manager_1 = require("./dump_snapshot_manager");
class StorageLogSnapshotManager {
    constructor(options) {
        this.m_snapshots = new Map();
        this.m_recycling = false;
        this.m_logPath = path.join(options.path, 'log');
        if (options.dumpSnapshotManager) {
            this.m_dumpManager = options.dumpSnapshotManager;
        }
        else {
            this.m_dumpManager = new dump_snapshot_manager_1.StorageDumpSnapshotManager(options);
        }
        this.m_headerStorage = options.headerStorage;
        this.m_storageType = options.storageType;
        this.m_logger = options.logger;
        this.m_readonly = !!(options && options.readonly);
    }
    recycle() {
        this.m_logger.info(`begin recycle snanshot`);
        let recycledMap = new Map(this.m_snapshots);
        for (let [blockHash, stub] of recycledMap.entries()) {
            if (!stub.ref) {
                this.m_logger.info(`delete snapshot ${blockHash}`);
                const err = this.m_dumpManager.removeSnapshot(blockHash);
                if (!err) {
                    this.m_snapshots.delete(blockHash);
                }
            }
        }
        this.m_recycling = false;
    }
    async init() {
        if (!this.m_readonly) {
            fs.ensureDirSync(this.m_logPath);
        }
        let err = await this.m_dumpManager.init();
        if (err) {
            return err;
        }
        let snapshots = this.m_dumpManager.listSnapshots();
        for (let ss of snapshots) {
            this.m_snapshots.set(ss.blockHash, { ref: 0 });
        }
        return error_code_1.ErrorCode.RESULT_OK;
    }
    uninit() {
        this.m_dumpManager.uninit();
        this.m_snapshots.clear();
    }
    async createSnapshot(from, blockHash) {
        let csr = await this.m_dumpManager.createSnapshot(from, blockHash);
        if (csr.err) {
            return csr;
        }
        let logger = from.storageLogger;
        if (logger) {
            let writer = new serializable_1.BufferWriter();
            logger.finish();
            let err = logger.encode(writer);
            if (err) {
                this.m_logger.error(`encode redo logger failed `, blockHash);
            }
            fs.writeFileSync(this.getLogPath(blockHash), writer.render());
        }
        this.m_snapshots.set(blockHash, { ref: 0 });
        return csr;
    }
    getSnapshotFilePath(blockHash) {
        return this.m_dumpManager.getSnapshotFilePath(blockHash);
    }
    getLogPath(blockHash) {
        return path.join(this.m_logPath, blockHash + '.redo');
    }
    getRedoLog(blockHash) {
        let redoLogRaw;
        try {
            redoLogRaw = fs.readFileSync(this.getLogPath(blockHash));
        }
        catch (error) {
            this.m_logger.warn(`read log file ${this.getLogPath(blockHash)} failed.`);
        }
        if (!redoLogRaw) {
            this.m_logger.error(`get redo log ${blockHash} failed`);
            return undefined;
        }
        let redoLog = new js_log_1.JStorageLogger();
        let err = redoLog.decode(new serializable_1.BufferReader(redoLogRaw));
        if (err) {
            this.m_logger.error(`decode redo log ${blockHash} from storage failed`);
            return undefined;
        }
        return redoLog;
    }
    // 保存redolog文件
    // 文件内容来源是 从其他节点请求来， 并不是本地节点自己运行的redolog
    writeRedoLog(blockHash, redoLog) {
        this.m_logger.debug(`write redo log ${blockHash}`);
        let filepath = this.getLogPath(blockHash);
        let writer = new serializable_1.BufferWriter();
        let err = redoLog.encode(writer);
        if (err) {
            this.m_logger.error(`encode redo log failed `, redoLog);
            return err;
        }
        fs.writeFileSync(filepath, writer.render());
        return error_code_1.ErrorCode.RESULT_OK;
    }
    async getSnapshot(blockHash) {
        this.m_logger.debug(`getting snapshot ${blockHash}`);
        // 只能在storage manager 的实现中调用，在storage manager中保证不会以相同block hash重入
        let ssr = await this.m_dumpManager.getSnapshot(blockHash);
        if (!ssr.err) {
            assert(this.m_snapshots.get(blockHash));
            this.m_logger.debug(`get snapshot ${blockHash} directly from dump`);
            ++this.m_snapshots.get(blockHash).ref;
            return ssr;
        }
        else if (ssr.err !== error_code_1.ErrorCode.RESULT_NOT_FOUND) {
            this.m_logger.error(`get snapshot ${blockHash} failed for dump manager get snapshot failed for ${ssr.err}`);
            return { err: ssr.err };
        }
        let hr = await this.m_headerStorage.getHeader(blockHash);
        if (hr.err) {
            this.m_logger.error(`get snapshot ${blockHash} failed for load header failed ${hr.err}`);
            return { err: hr.err };
        }
        let blockPath = [];
        blockPath.push(blockHash);
        let header = hr.header;
        let err = error_code_1.ErrorCode.RESULT_NOT_FOUND;
        let nearestSnapshot;
        do {
            let _ssr = await this.m_dumpManager.getSnapshot(header.hash);
            if (!_ssr.err) {
                nearestSnapshot = _ssr.snapshot;
                err = _ssr.err;
                break;
            }
            else if (_ssr.err !== error_code_1.ErrorCode.RESULT_NOT_FOUND) {
                this.m_logger.error(`get snapshot ${blockHash} failed for get dump ${header.hash} failed ${_ssr.err}`);
                err = _ssr.err;
                break;
            }
            let _hr = await this.m_headerStorage.getHeader(header.preBlockHash);
            if (_hr.err) {
                this.m_logger.error(`get snapshot ${blockHash} failed for get header ${header.preBlockHash} failed ${hr.err}`);
                err = error_code_1.ErrorCode.RESULT_INVALID_BLOCK;
                break;
            }
            header = _hr.header;
            blockPath.push(header.hash);
        } while (true);
        if (err) {
            this.m_logger.error(`get snapshot ${blockHash} failed for ${err}`);
            return { err };
        }
        /** 这段代码要保证同步 start */
        let storage = new this.m_storageType({
            filePath: this.m_dumpManager.getSnapshotFilePath(blockHash),
            logger: this.m_logger
        });
        fs.copyFileSync(nearestSnapshot.filePath, storage.filePath);
        /** 这段代码要保证同步 end */
        err = await storage.init();
        if (err) {
            this.m_logger.error(`get snapshot ${blockHash} failed for storage init failed for ${err}`);
            return { err };
        }
        for (let _blockHash of blockPath.reverse()) {
            if (!fs.existsSync(this.getLogPath(_blockHash))) {
                this.m_logger.error(`get snapshot ${blockHash} failed for get redo log for ${_blockHash} failed for not exist`);
                err = error_code_1.ErrorCode.RESULT_NOT_FOUND;
                break;
            }
            let log;
            try {
                log = fs.readFileSync(this.getLogPath(_blockHash));
            }
            catch (error) {
                this.m_logger.error(`read log file ${this.getLogPath(_blockHash)} failed.`);
            }
            err = await storage.redo(log);
            if (err) {
                this.m_logger.error(`get snapshot ${blockHash} failed for redo ${_blockHash} failed for ${err}`);
                break;
            }
        }
        await storage.uninit();
        if (err) {
            await storage.remove();
            this.m_logger.error(`get snapshot ${blockHash} failed for ${err}`);
            return { err };
        }
        this.m_snapshots.set(blockHash, { ref: 1 });
        return { err: error_code_1.ErrorCode.RESULT_OK,
            snapshot: new dump_snapshot_1.StorageDumpSnapshot(blockHash, storage.filePath) };
    }
    releaseSnapshot(blockHash) {
        let stub = this.m_snapshots.get(blockHash);
        if (stub) {
            assert(stub.ref > 0);
            if (stub.ref > 0) {
                --stub.ref;
            }
        }
    }
}
exports.StorageLogSnapshotManager = StorageLogSnapshotManager;
