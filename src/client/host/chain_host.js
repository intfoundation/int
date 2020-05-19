"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const path = require("path");
const fs = require("fs-extra");
const addressClass = require("../../core/address");
const core_1 = require("../../core");
const server_1 = require("../event/server");
const rpc_1 = require("./rpc");
const process = require("process");
let moment = require('moment/moment');
class ChainHost {
    constructor() {
    }
    async _initEventServer(options) {
        if (!options.commandOptions.has('eventsServer')) {
            return { err: core_1.ErrorCode.RESULT_OK };
        }
        let server = new server_1.ChainEventServer({ chain: options.chain });
        const err = await server.init({});
        if (err) {
            return { err };
        }
        return { err: core_1.ErrorCode.RESULT_OK, server };
    }
    async initMiner(commandOptions) {
        let dataDir = this._parseDataDir(commandOptions);
        if (!dataDir) {
            console.error('chain_host initMiner fail _parseDataDir');
            return { ret: false };
        }
        let logger = this._parseLogger(dataDir, commandOptions);
        let creator = core_1.initChainCreator({ logger });
        let cr = await creator.createMinerInstance(dataDir);
        if (cr.err) {
            console.error('chain_host initMiner fail createMinerInstance');
            return { ret: false };
        }
        let routineManagerType = this._parseExecutorRoutine(cr.miner.chain, commandOptions);
        if (!routineManagerType) {
            console.error('chain_host initMiner fail _parseExecutorRoutine');
            return { ret: false };
        }
        let pr = cr.miner.parseInstanceOptions({ parsed: { routineManagerType }, origin: commandOptions });
        if (pr.err) {
            console.error('chain_host initMiner fail parseInstanceOptions');
            return { ret: false };
        }

        this.m_server = new rpc_1.ChainServer(logger, cr.miner.chain, cr.miner);
        this.m_server.init(commandOptions);
        let blockNumber = 0;
        setInterval(async () => {
            // @ts-ignore
            let resultHeader = await cr.miner.chain.getHeader("latest");
            if (!resultHeader.err) {
                // @ts-ignore
                let newBlockNumber = resultHeader.header.number;

                if (isNaN(newBlockNumber)) {
                    return;
                }
                logger.info(`update miner blockHeight, newBlockNumber:${newBlockNumber} and blockNumber：${blockNumber}`);
                fs.appendFile('./miner-log.txt', `\n ${moment().format("YYYY-MM-DD HH:mm:ss")},update miner blockHeight, newBlockNumber:${newBlockNumber} and blockNumber：${blockNumber}`);
                if (newBlockNumber != blockNumber) {
                    blockNumber = newBlockNumber;
                }
                else {
                    process.exit(0);
                }
            }
        }, 1000 * 60 * 5);

        let err = await cr.miner.initialize(pr.value);
        if (err) {
            console.error('chain_host initMiner fail initialize');
            return { ret: false };
        }
        const iesr = await this._initEventServer({ chain: cr.miner.chain, commandOptions });
        if (iesr.err) {
            console.error('init events server fail parseInstanceOptions');
            return { ret: false };
        }
        return { ret: true, miner: cr.miner };
    }
    async initPeer(commandOptions) {
        let dataDir = this._parseDataDir(commandOptions);
        if (!dataDir) {
            return { ret: false };
        }
        //处理peerId相关逻辑
        let optionsFile = path.join(dataDir, '../', '.options.json');
        let writeFlag = false;
        let json = {};
        let propertyName = "peerid";
        if (commandOptions.has("test")) {
            propertyName = "testPeerid";
        }
        try {
            if (fs.existsSync(optionsFile)) {
                json = fs.readJsonSync(optionsFile);
                if (json["peerid"]) {
                    commandOptions.set("peerid", json[propertyName]);
                }
                else {
                    writeFlag = true;
                }
            }
            else {
                writeFlag = true;
            }
        }
        catch (error) {
            console.error(`read or write nodeinfo error, rebuild file`);
            writeFlag = true;
        }
        if (writeFlag) {
            let privateKey = addressClass.createKeyPair()[1];
            let address = addressClass.addressFromSecretKey(privateKey.toString('hex'));
            json[propertyName] = address;
            fs.writeJsonSync(optionsFile, json);
        }
        commandOptions.set("peerid", json[propertyName]);
        let logger = this._parseLogger(dataDir, commandOptions);
        let creator = core_1.initChainCreator({ logger });
        let cr = await creator.createChainInstance(dataDir, { initComponents: true });
        if (cr.err) {
            return { ret: false };
        }
        let routineManagerType = this._parseExecutorRoutine(cr.chain, commandOptions);
        if (!routineManagerType) {
            console.error('chain_host initMiner fail _parseExecutorRoutine');
            return { ret: false };
        }
        let pr = cr.chain.parseInstanceOptions({ parsed: { routineManagerType }, origin: commandOptions });
        if (pr.err) {
            return { ret: false };
        }
        //启动RPC Server
        this.m_server = new rpc_1.ChainServer(logger, cr.chain);
        this.m_server.init(commandOptions);

        let blockNumber = 0;
        setInterval(async () => {
            // @ts-ignore
            let resultHeader = await cr.chain.getHeader("latest");
            if (!resultHeader.err) {
                // @ts-ignore
                let newBlockNumber = resultHeader.header.number;

                if (isNaN(newBlockNumber)) {
                    return;
                }
                logger.info(`update peer blockHeight, newBlockNumber:${newBlockNumber} and blockNumber：${blockNumber}`);
                fs.appendFile('./peer-log.txt', `\n ${moment().format("YYYY-MM-DD HH:mm:ss")},update peer blockHeight, newBlockNumber:${newBlockNumber} and blockNumber：${blockNumber}`);
                if (newBlockNumber != blockNumber) {
                    blockNumber = newBlockNumber;
                }
                else {
                    process.exit(0);
                }
            }
        }, 1000 * 60 * 5);

        let err = await cr.chain.initialize(pr.value, true);
        if (err) {
            return { ret: false };
        }
        const iesr = await this._initEventServer({ chain: cr.chain, commandOptions });
        if (iesr.err) {
            console.error('init events server fail parseInstanceOptions');
            return { ret: false };
        }
        return { ret: true, chain: cr.chain };
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
            fs.removeSync(dataDir);
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
    _parseExecutorRoutine(chain, commandOptions) {
        if (commandOptions.has('executor')) {
            if (commandOptions.get('executor') === 'inprocess') {
                return core_1.InprocessRoutineManager;
            }
            else if (commandOptions.get('executor') === 'interprocess') {
                return core_1.InterprocessRoutineManager;
            }
        }
        return core_1.InprocessRoutineManager;
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
        if (core_1.Chain.dataDirValid(dataDir)) {
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
}
ChainHost.CREATE_TIP = `command: create --package [packageDir] --dataDir [dataDir] --[genesisConfig] [genesisConfig] --[externalHandler]`;
exports.ChainHost = ChainHost;
