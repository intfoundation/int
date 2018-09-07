"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const error_code_1 = require("../error_code");
const chain_1 = require("../chain");
class ViewExecutor {
    constructor(options) {
        this.m_handler = options.handler;
        this.m_method = options.method;
        this.m_param = options.param;
        this.m_externContext = options.externContext;
        this.m_header = options.header;
        this.m_storage = options.storage;
        this.m_logger = options.logger;
    }
    get externContext() {
        return this.m_externContext;
    }
    async prepareContext(blockHeader, storage, externContext) {
        let database = (await storage.getReadableDataBase(chain_1.Chain.dbUser)).value;
        let context = Object.create(externContext);
        // context.getNow = (): number => {
        //     return blockHeader.timestamp;
        // };
        Object.defineProperty(context, 'now', {
            writable: false,
            value: blockHeader.timestamp
        });
        // context.getHeight = (): number => {
        //     return blockHeader.number;
        // };
        Object.defineProperty(context, 'height', {
            writable: false,
            value: blockHeader.number
        });
        // context.getStorage = (): IReadWritableKeyValue => {
        //     return kv;
        // }
        Object.defineProperty(context, 'storage', {
            writable: false,
            value: database
        });
        Object.defineProperty(context, 'logger', {
            writable: false,
            value: this.m_logger
        });
        return context;
    }
    async execute() {
        let fcall = this.m_handler.getViewMethod(this.m_method);
        if (!fcall) {
            return { err: error_code_1.ErrorCode.RESULT_NOT_SUPPORT };
        }
        let context = await this.prepareContext(this.m_header, this.m_storage, this.m_externContext);
        try {
            this.m_logger.info(`will execute view method ${this.m_method}, params ${JSON.stringify(this.m_param)}`);
            let v = await fcall(context, this.m_param);
            return { err: error_code_1.ErrorCode.RESULT_OK, value: v };
        }
        catch (error) {
            return { err: error_code_1.ErrorCode.RESULT_EXCEPTION };
        }
    }
}
exports.ViewExecutor = ViewExecutor;
