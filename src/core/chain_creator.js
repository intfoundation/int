"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const error_code_1 = require("./error_code");
const logger_util_1 = require("./lib/logger_util");
const path = require("path");
const fs = require("fs-extra");
const process = require("process");
class ChainCreator {
    constructor(options) {
        this.m_instances = new Map();
        this.m_logger = logger_util_1.initLogger(options);
    }
    registerChainType(consesus, instance) {
        this.m_instances.set(consesus, instance);
    }
    get logger() {
        return this.m_logger;
    }
    _getTypeInstance(typeOptions) {
        let ins = this.m_instances.get(typeOptions.consensus);
        if (!ins) {
            this.m_logger.error(`chain creator has no register consensus named ${typeOptions.consensus}`);
            return undefined;
        }
        return ins;
    }
    async createGenesis(packagePath, dataDir, genesisOptions, externalHandler = false) {
        if (!path.isAbsolute(dataDir)) {
            dataDir = path.join(process.cwd(), dataDir);
        }
        if (!path.isAbsolute(packagePath)) {
            packagePath = path.join(process.cwd(), packagePath);
        }
        fs.ensureDirSync(dataDir);
        if (externalHandler) {
            let configPath = path.join(packagePath, 'config.json');
            try {
                let _config = fs.readJSONSync(configPath);
                _config['handler'] = path.join(packagePath, _config['handler']);
                fs.writeJSONSync(path.join(dataDir, 'config.json'), _config, { spaces: 4, flag: 'w' });
            }
            catch (e) {
                this.m_logger.error(`load ${configPath} failed for`, e);
            }
        }
        else {
            fs.copySync(packagePath, dataDir);
        }
        let cmir = await this.createMinerInstance(dataDir);
        if (cmir.err) {
            return { err: cmir.err };
        }
        let lcr = this._loadConfig(dataDir);
        if (lcr.err) {
            return { err: lcr.err };
        }
        let err = await cmir.miner.create(genesisOptions);
        if (err) {
            return { err };
        }
        return { err: error_code_1.ErrorCode.RESULT_OK, miner: cmir.miner };
    }
    _loadConfig(dataDir) {
        let configPath = path.join(dataDir, 'config.json');
        let constConfig;
        try {
            constConfig = fs.readJsonSync(configPath);
        }
        catch (e) {
            this.m_logger.error(`can't get config from package ${dataDir} for ${e.message}`);
            return { err: error_code_1.ErrorCode.RESULT_EXCEPTION };
        }
        if (!constConfig['handler']) {
            this.m_logger.error(`can't get handler from package ${dataDir}/config.json`);
            return { err: error_code_1.ErrorCode.RESULT_EXCEPTION };
        }
        let handlerPath = constConfig['handler'];
        if (!path.isAbsolute(handlerPath)) {
            handlerPath = path.join(dataDir, handlerPath);
        }
        let typeOptions = constConfig['type'];
        if (!typeOptions || !typeOptions.consensus || !typeOptions.features) {
            this.m_logger.error(`invalid type from package ${dataDir}`);
            return { err: error_code_1.ErrorCode.RESULT_EXCEPTION };
        }
        let handler = this._loadHandler(handlerPath, typeOptions);
        if (!handler) {
            return { err: error_code_1.ErrorCode.RESULT_EXCEPTION };
        }
        let globalOptions = constConfig['global'];
        if (!globalOptions) {
            globalOptions = {};
        }
        return {
            err: error_code_1.ErrorCode.RESULT_OK,
            config: {
                handler,
                typeOptions,
                globalOptions
            }
        };
    }
    _loadHandler(handlerPath, typeOptions) {
        let instance = this._getTypeInstance(typeOptions);
        if (!instance) {
            return undefined;
        }
        let handler = instance.newHandler(this, typeOptions);
        try {
            // 兼容VSCode调试器和命令行环境，win32下handlerPath的盘符需要和process.cwd返回的盘符大小写一致
            // VScode环境下，cwd返回小写盘符，命令行环境下，cwd返回小写盘符
            let cwdPath = process.cwd().split(':', 2);
            if (cwdPath.length === 2) {
                const isLower = cwdPath[0] >= 'a' && cwdPath[0] <= 'z';
                let pathsplitter = handlerPath.split(':', 2);
                if (pathsplitter.length === 2) {
                    pathsplitter[0] = isLower ? pathsplitter[0].toLowerCase() : pathsplitter[0].toUpperCase();
                }
                handlerPath = pathsplitter.join(':');
            }
            let handlerMod = require(handlerPath);
            handlerMod.registerHandler(handler);
        }
        catch (e) {
            console.error(`handler error: ${e.message}`);
            return undefined;
        }
        return handler;
    }
    async createMinerInstance(dataDir) {
        if (!path.isAbsolute(dataDir)) {
            dataDir = path.join(process.cwd(), dataDir);
        }
        let lcr = this._loadConfig(dataDir);
        if (lcr.err) {
            return { err: lcr.err };
        }
        let instance = this._getTypeInstance(lcr.config.typeOptions);
        if (!instance) {
            return { err: error_code_1.ErrorCode.RESULT_INVALID_TYPE };
        }
        let miner = instance.newMiner(this, dataDir, lcr.config);
        let err = await miner.initComponents();
        if (err) {
            return { err };
        }
        return { err: error_code_1.ErrorCode.RESULT_OK, miner, globalOptions: lcr.config.globalOptions };
    }
    async createChainInstance(dataDir, options) {
        if (!path.isAbsolute(dataDir)) {
            dataDir = path.join(process.cwd(), dataDir);
        }
        let lcr = this._loadConfig(dataDir);
        if (lcr.err) {
            return { err: lcr.err };
        }
        let instance = this._getTypeInstance(lcr.config.typeOptions);
        if (!instance) {
            return { err: error_code_1.ErrorCode.RESULT_INVALID_TYPE };
        }
        let chain = instance.newChain(this, dataDir, lcr.config);
        if (options.initComponents) {
            let err = await chain.initComponents({ readonly: options.readonly });
            if (err) {
                return { err };
            }
        }
        return { err: error_code_1.ErrorCode.RESULT_OK, chain };
    }
}
exports.ChainCreator = ChainCreator;
