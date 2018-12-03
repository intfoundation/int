"use strict";
function __export(m) {
    for (var p in m) if (!exports.hasOwnProperty(p)) exports[p] = m[p];
}
Object.defineProperty(exports, "__esModule", { value: true });
var bignumber_js_1 = require("bignumber.js");
exports.BigNumber = bignumber_js_1.BigNumber;
__export(require("./serializable"));
__export(require("./error_code"));
__export(require("./address"));
__export(require("./lib/logger_util"));
__export(require("./lib/decimal_transfer"));
__export(require("./chain"));
__export(require("./value_chain"));
// __export(require("./dpos_chain"));
__export(require("./dbft_chain"));
__export(require("./net"));
var node_1 = require("./net_tcp/node");
exports.TcpNode = node_1.TcpNode;
var node_2 = require("./net_bdt/node");
exports.BdtNode = node_2.BdtNode;
var node_3 = require("./net_standalone/node");
exports.StandaloneNode = node_3.StandaloneNode;
var chain_creator_1 = require("./chain_creator");
exports.ChainCreator = chain_creator_1.ChainCreator;
__export(require("./lib/digest"));
__export(require("./lib/encoding"));
const fs = require("fs-extra");
const network_1 = require("./block/network");
const chain_creator_2 = require("./chain_creator");
const value_chain_1 = require("./value_chain");
// const dpos_chain_1 = require("./dpos_chain");
const dbft_chain_1 = require("./dbft_chain");
const logger_util_1 = require("./lib/logger_util");
const node_4 = require("./net_tcp/node");
const node_5 = require("./net_standalone/node");
const net_1 = require("./net");
const node_6 = require("./net_bdt/node");
const random_outbound_network_1 = require("./block/random_outbound_network");
// const validators_network_1 = require("./dbft_chain/validators_network");
function initChainCreator(options) {
    const logger = logger_util_1.initLogger(options);
    const networkCreator = new network_1.NetworkCreator({ logger });
    networkCreator.registerNode('tcp', (commandOptions) => {
        let network = commandOptions.get('network');
        if (!network) {
            network = 'default';
        }
        let _host = commandOptions.get('host');
        if (!_host) {
            console.error('invalid tcp host');
            return;
        }
        let port = commandOptions.get('port');
        if (!port) {
            console.error('invalid tcp port');
            return;
        }
        let peers = commandOptions.get('peers');
        if (!peers) {
            peers = [];
        }
        else {
            peers = peers.split(';');
        }
        let nodeType = net_1.staticPeeridIp.splitInstance(net_1.StaticOutNode(node_4.TcpNode));
        return new nodeType(peers, { network, peerid: `${_host}:${port}`, host: _host, port });
    });
    networkCreator.registerNode('standalone', (commandOptions) => {
        let network = commandOptions.get('network');
        if (!network) {
            network = 'default';
        }
        let peerid = commandOptions.get('peerid');
        if (!peerid) {
            peerid = 'default';
        }
        return new node_5.StandaloneNode(network, peerid);
    });
    networkCreator.registerNode('bdt', (commandOptions) => {
        let network = commandOptions.get('network');
        if (!network) {
            network = 'default';
        }
        let _host = commandOptions.get('host');
        if (!_host) {
            console.error('invalid bdt host');
            return;
        }
        let port = commandOptions.get('port');
        if (!port) {
            console.error('no bdt port');
            return;
        }
        port = port.split('|');
        let udpport = 0;
        let tcpport = parseInt(port[0]);
        if (port.length === 1) {
            udpport = tcpport + 10;
        }
        else {
            udpport = parseInt(port[1]);
        }
        if (isNaN(tcpport) || isNaN(udpport)) {
            console.error('invalid bdt port');
            return;
        }
        let peerid = commandOptions.get('peerid');
        if (!peerid) {
            peerid = `${_host}:${port}`;
        }
        let snPeers = commandOptions.get('sn');
        if (!snPeers) {
            console.error('no sn');
            return;
        }
        let snconfig = snPeers.split('@');
        if (snconfig.length !== 4) {
            console.error('invalid sn: <SN_PEERID>@<SN_IP>@<SN_TCP_PORT>@<SN_UDP_PORT>');
            return;
        }
        const snPeer = {
            peerid: `${snconfig[0]}`,
            eplist: [
                `4@${snconfig[1]}@${snconfig[2]}@t`,
                `4@${snconfig[1]}@${snconfig[3]}@u`
            ]
        };
        let bdt_logger = {
            level: commandOptions.get('bdt_log_level') || 'info',
            // 设置log目录
            file_dir: commandOptions.get('dataDir') + '/log',
            file_name: commandOptions.get('bdt_log_name') || 'bdt',
        };
        let dhtAppID = 0;
        if (commandOptions.has('networkid')) {
            dhtAppID = parseInt(commandOptions.get('networkid'));
            if (isNaN(dhtAppID)) {
                dhtAppID = 0;
            }
        }
        let initDHTEntry;
        const initDHTFile = commandOptions.get('dataDir') + '/peers';
        if (fs.pathExistsSync(initDHTFile)) {
            initDHTEntry = fs.readJSONSync(initDHTFile);
        }
        return new node_6.BdtNode({ network, host: _host, tcpport, udpport, peerid, snPeer, dhtAppID, bdtLoggerOptions: bdt_logger, initDHTEntry });
    });
    networkCreator.registerNetwork('random', random_outbound_network_1.RandomOutNetwork);
    // networkCreator.registerNetwork('validators', validators_network_1.ValidatorsNetwork);

    let _creator = new chain_creator_2.ChainCreator({ logger, networkCreator });
    // _creator.registerChainType('dpos', {
    //     newHandler(creator, typeOptions) {
    //         return new value_chain_1.ValueHandler();
    //     },
    //     newChain(creator, dataDir, config) {
    //         return new dpos_chain_1.DposChain({ networkCreator, logger: creator.logger, handler: config.handler, dataDir, globalOptions: config.globalOptions });
    //     },
    //     newMiner(creator, dataDir, config) {
    //         return new dpos_chain_1.DposMiner({ networkCreator, logger: creator.logger, handler: config.handler, dataDir, globalOptions: config.globalOptions });
    //     }
    // });
    _creator.registerChainType('dbft', {
        newHandler(creator, typeOptions) {
            return new value_chain_1.ValueHandler();
        },
        newChain(creator, dataDir, config) {
            return new dbft_chain_1.DbftChain({ networkCreator, logger: creator.logger, handler: config.handler, dataDir, globalOptions: config.globalOptions });
        },
        newMiner(creator, dataDir, config) {
            return new dbft_chain_1.DbftMiner({ networkCreator, logger: creator.logger, handler: config.handler, dataDir, globalOptions: config.globalOptions });
        }
    });
    return _creator;
}
exports.initChainCreator = initChainCreator;
__export(require("./chain_debuger"));
