"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const fs = require("fs-extra");
const util_1 = require("util");
const error_code_1 = require("../error_code");
const storage_1 = require("./storage");
const log_snapshot_manager_1 = require("./log_snapshot_manager");
class StorageManager {
    constructor(options) {
        this.m_views = new Map();
        this.m_path = options.path;
        this.m_storageType = options.storageType;
        this.m_logger = options.logger;
        if (options.snapshotManager) {
            this.m_snapshotManager = options.snapshotManager;
        }
        else {
            this.m_snapshotManager = new log_snapshot_manager_1.StorageLogSnapshotManager(options);
        }
        this.m_readonly = !!options.readonly;
        this.m_tmpManager = options.tmpManager;
    }
    async init() {
        let err = await this.m_snapshotManager.init();
        if (err) {
            return err;
        }
        return error_code_1.ErrorCode.RESULT_OK;
    }
    get path() {
        return this.m_path;
    }
    uninit() {
        this.m_snapshotManager.uninit();
    }
    async createSnapshot(from, blockHash, remove) {
        if (this.m_readonly) {
            return { err: error_code_1.ErrorCode.RESULT_NOT_SUPPORT };
        }
        let csr = await this.m_snapshotManager.createSnapshot(from, blockHash);
        if (csr.err) {
            return csr;
        }
        // assert((await csr.snapshot!.messageDigest()).value !== (await from.messageDigest()).value);
        if (remove) {
            await from.remove();
        }
        return csr;
    }
    async getSnapshot(blockHash) {
        return await this.m_snapshotManager.getSnapshot(blockHash);
    }
    releaseSnapshot(blockHash) {
        return this.m_snapshotManager.releaseSnapshot(blockHash);
    }
    async createStorage(name, from) {
        if (this.m_readonly) {
            return { err: error_code_1.ErrorCode.RESULT_NOT_SUPPORT };
        }
        let storage = new this.m_storageType({
            filePath: this.m_tmpManager.getPath(`${name}.storage`),
            logger: this.m_logger
        });
        await storage.remove();
        let err;
        if (!from) {
            this.m_logger.info(`create storage ${name}`);
            err = await storage.init();
        }
        else if (util_1.isString(from)) {
            this.m_logger.info(`create storage ${name} from snapshot ${from}`);
            let ssr = await this._getSnapshotStorage(from);
            if (ssr.err) {
                this.m_logger.error(`get snapshot failed for ${from}`);
                err = ssr.err;
            }
            else {
                fs.copyFileSync(ssr.storage.filePath, storage.filePath);
                this.releaseSnapshotView(from);
                err = await storage.init();
            }
        }
        else if (from instanceof storage_1.Storage) {
            this.m_logger.info(`create storage ${name} from snapshot ${storage.filePath}`);
            fs.copyFileSync(from.filePath, storage.filePath);
            err = await storage.init();
        }
        else {
            this.m_logger.error(`create storage ${name} with invalid from ${from}`);
            return { err: error_code_1.ErrorCode.RESULT_INVALID_PARAM };
        }
        if (err) {
            this.m_logger.error(`create storage ${name} failed for ${err}`);
            return { err };
        }
        return { err: error_code_1.ErrorCode.RESULT_OK, storage };
    }
    async _getSnapshotStorage(blockHash) {
        let stub = this.m_views.get(blockHash);
        if (stub) {
            ++stub.ref;
            if (stub.storage.isInit) {
                return { err: error_code_1.ErrorCode.RESULT_OK, storage: stub.storage };
            }
            else {
                return new Promise((resolve) => {
                    stub.storage.once('init', (err) => {
                        if (err) {
                            resolve({ err });
                        }
                        else {
                            resolve({ err, storage: stub.storage });
                        }
                    });
                });
            }
        }
        stub = {
            storage: new this.m_storageType({
                filePath: this.m_snapshotManager.getSnapshotFilePath(blockHash),
                logger: this.m_logger
            }),
            ref: 1
        };
        this.m_views.set(blockHash, stub);
        let sr = await this.m_snapshotManager.getSnapshot(blockHash);
        if (sr.err) {
            this.m_logger.error(`get snapshot failed for ${sr.err}`);
            this.m_views.delete(blockHash);
            return { err: sr.err };
        }
        let ret = new Promise((resolve) => {
            stub.storage.once('init', (err) => {
                if (err) {
                    this.m_snapshotManager.releaseSnapshot(blockHash);
                    this.m_views.delete(blockHash);
                    resolve({ err });
                }
                else {
                    resolve({ err, storage: stub.storage });
                }
            });
        });
        stub.storage.init(true);
        return ret;
    }
    async getSnapshotView(blockHash) {
        return await this._getSnapshotStorage(blockHash);
    }
    // 根据block hash 获取redo log内容
    // 提供给chain_node层引用
    getRedoLog(blockHash) {
        return this.m_snapshotManager.getRedoLog(blockHash);
    }
    hasRedoLog(blockHash) {
        return this.m_snapshotManager.hasRedoLog(blockHash);
    }
    // 对象形式的redo log（通过网络请求, 然后解析buffer获得) 写入至本地文件
    // 提供给chain层引用
    writeRedoLog(blockHash, log) {
        if (this.m_readonly) {
            return error_code_1.ErrorCode.RESULT_NOT_SUPPORT;
        }
        return this.m_snapshotManager.writeRedoLog(blockHash, log);
    }
    async releaseSnapshotView(blockHash) {
        let stub = this.m_views.get(blockHash);
        if (stub) {
            --stub.ref;
            if (!stub.ref) {
                this.m_views.delete(blockHash);
                // 这里await也不能保证互斥， 可能在uninit过程中再次创建，只能靠readonly保证在一个path上创建多个storage 实例
                await stub.storage.uninit();
                this.m_snapshotManager.releaseSnapshot(blockHash);
            }
        }
    }
    recycleSnapShot() {
        return this.m_snapshotManager.recycle();
    }
}
exports.StorageManager = StorageManager;
