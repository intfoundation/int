"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const path = require("path");
const fs = require("fs-extra");
const core_1 = require("../../core");
const rpc_1 = require("./rpc");
class ChainHost {
    constructor() {
        this.m_net = new Map();
    }
    async initMiner(commandOptions) {
        let dataDir = this._parseDataDir(commandOptions);
        if (!dataDir) {
            return false;
        }
        let logger = this._parseLogger(dataDir, commandOptions);
        let creator = core_1.initChainCreator({ logger });
        let cr = await creator.createMinerInstance(dataDir);
        if (cr.err) {
            return false;
        }
        let node = this._parseNode(commandOptions);
        if (!node) {
            return false;
        }
        let pr = cr.miner.parseInstanceOptions(node, commandOptions);
        if (pr.err) {
            return false;
        }
        let err = await cr.miner.initialize(pr.value);
        if (err) {
            return false;
        }
        this.m_server = new rpc_1.ChainServer(logger, cr.miner.chain, cr.miner);
        this.m_server.init(commandOptions);
        return true;
    }
    async initPeer(commandOptions) {
        let dataDir = this._parseDataDir(commandOptions);
        if (!dataDir) {
            return false;
        }
        let logger = this._parseLogger(dataDir, commandOptions);
        let creator = core_1.initChainCreator({ logger });
        let cr = await creator.createChainInstance(dataDir);
        if (cr.err) {
            return false;
        }
        let node = this._parseNode(commandOptions);
        if (!node) {
            return false;
        }
        let pr = cr.chain.parseInstanceOptions(node, commandOptions);
        if (pr.err) {
            return false;
        }
        let err = await cr.chain.initialize(pr.value);
        if (err) {
            return false;
        }
        this.m_server = new rpc_1.ChainServer(logger, cr.chain);
        this.m_server.init(commandOptions);
        return true;
    }
    async createGenesis(commandOptions) {
        if (!commandOptions.get('package')) {
            console.error(ChainHost.CREATE_TIP);
            return false;
        }
        let _package = commandOptions.get('package');
        if (!path.isAbsolute(_package)) {
            _package = path.join(process.cwd(), _package);
        }
        if (!commandOptions.get('dataDir')) {
            console.error(ChainHost.CREATE_TIP);
            return false;
        }
        let dataDir = commandOptions.get('dataDir');
        if (!path.isAbsolute(dataDir)) {
            dataDir = path.join(process.cwd(), dataDir);
        }
        if (!fs.existsSync(dataDir)) {
            fs.ensureDirSync(dataDir);
        }
        else {
            if (commandOptions.get('forceClean')) {
                fs.removeSync(dataDir);
            }
            else {
                console.error(`dataDir already exsits`);
                return false;
            }
        }
        let logger = this._parseLogger(dataDir, commandOptions);
        let creator = core_1.initChainCreator({ logger });
        let genesisOptions;
        if (commandOptions.get('genesisConfig')) {
            let _path = commandOptions.get('genesisConfig');
            if (!path.isAbsolute(_path)) {
                _path = path.join(process.cwd(), _path);
            }
            genesisOptions = fs.readJsonSync(_path);
        }
        let cr = await creator.createGenesis(_package, dataDir, genesisOptions, commandOptions.get('externalHandler'));
        if (cr.err) {
            return false;
        }
        return true;
    }
    _parseLogger(dataDir, commandOptions) {
        let loggerOptions = Object.create(null);
        loggerOptions.console = false;
        loggerOptions.level = 'error';
        if (commandOptions.get('loggerConsole')) {
            loggerOptions.console = true;
        }
        if (commandOptions.get('loggerLevel')) {
            loggerOptions.level = commandOptions.get('loggerLevel');
        }
        let loggerPath = path.join(dataDir, 'log');
        fs.ensureDir(loggerPath);
        loggerOptions.file = { root: loggerPath };
        return core_1.initLogger({ loggerOptions });
    }
    _parseNode(commandOptions) {
        if (commandOptions.get('net')) {
            let ni = this.m_net.get(commandOptions.get('net'));
            if (!ni) {
                console.error('invalid net');
                return undefined;
            }
            return ni(commandOptions);
        }
    }
    _parseDataDir(commandOptions) {
        let dataDir = commandOptions.get('dataDir');
        if (!dataDir) {
            return undefined;
        }
        if (!path.isAbsolute(dataDir)) {
            dataDir = path.join(process.cwd(), dataDir);
        }
        if (commandOptions.has('forceClean')) {
            fs.removeSync(dataDir);
        }
        if (fs.pathExistsSync(dataDir)) {
            return dataDir;
        }
        else {
            fs.ensureDirSync(dataDir);
        }
        if (!commandOptions.get('genesis')) {
            console.error('no genesis');
            return undefined;
        }
        let _path = commandOptions.get('genesis');
        if (!path.isAbsolute(_path)) {
            _path = path.join(process.cwd(), _path);
        }
        fs.copySync(_path, dataDir);
        return dataDir;
    }
    registerNet(net, instance) {
        this.m_net.set(net, instance);
    }
}
ChainHost.CREATE_TIP = `command: createGenesis --package [packageDir] --dataDir [dataDir] --[genesisConfig] [genesisConfig] --[externalHandler]`;
exports.ChainHost = ChainHost;
