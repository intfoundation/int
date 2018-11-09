"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const path = require("path");
const fs = require("fs-extra");
const error_code_1 = require("../error_code");
class TmpManager {
    constructor(options) {
        this.m_tmpDir = path.join(options.root, './tmp');
        this.m_logger = options.logger;
    }
    init(options) {
        try {
            if (options.clean) {
                fs.removeSync(this.m_tmpDir);
            }
            fs.ensureDirSync(this.m_tmpDir);
        }
        catch (e) {
            this.m_logger.error(`init tmp dir ${this.m_tmpDir} failed `, e);
            return error_code_1.ErrorCode.RESULT_EXCEPTION;
        }
        return error_code_1.ErrorCode.RESULT_OK;
    }
    get tmpDir() {
        return this.m_tmpDir;
    }
    getPath(name) {
        return path.join(this.m_tmpDir, name);
    }
}
exports.TmpManager = TmpManager;
