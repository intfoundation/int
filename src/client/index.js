"use strict";
function __export(m) {
    for (var p in m) if (!exports.hasOwnProperty(p)) exports[p] = m[p];
}
Object.defineProperty(exports, "__esModule", { value: true });
__export(require("../core"));
__export(require("./client/client"));
__export(require("./lib/simple_command"));
var unhandled_rejection_1 = require("./lib/unhandled_rejection");
exports.initUnhandledRejection = unhandled_rejection_1.init;
var rejectify_1 = require("./lib/rejectify");
exports.rejectifyValue = rejectify_1.rejectifyValue;
exports.rejectifyErrorCode = rejectify_1.rejectifyErrorCode;
__export(require("./host/chain_host"));
const chain_host_1 = require("./host/chain_host");
const core_1 = require("../core");
const fs = require("fs-extra");
let host = new chain_host_1.ChainHost();
exports.host = host;
host.registerNet('tcp', (commandOptions) => {
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
    let nodeType = core_1.StaticOutNode(core_1.TcpNode);
    return new nodeType(peers, { host: _host, port });
});
host.registerNet('standalone', (commandOptions) => {
    let peerid = commandOptions.get('peerid');
    if (!peerid) {
        peerid = 'defaultNode';
    }
    return new core_1.StandaloneNode(peerid);
});
host.registerNet('bdt', (commandOptions) => {
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
        peerid = `${host}:${port}`;
    }
    let snPeers = commandOptions.get('sn');
    if (!snPeers) {
        console.error('no sn');
        return;
    }
    let snconfig = snPeers.split('@');
    if (snconfig.length !== 4) {
        console.error('invalid sn: <SN_PEERID>@<SN_IP>@<SN_TCP_PORT>@<SN_UDP_PORT>');
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
    };
    let initDHTEntry;
    const initDHTFile = commandOptions.get('dataDir') + '/peers';
    if (fs.pathExistsSync(initDHTFile)) {
        initDHTEntry = fs.readJSONSync(initDHTFile);
    }
    return new core_1.BdtNode({ host: _host, tcpport, udpport, peerid, snPeer, bdtLoggerOptions: bdt_logger, initDHTEntry });
});
const core_2 = require("../core");
const valueChainDebuger = {
    async createIndependSession(loggerOptions, dataDir) {
        const cdr = await core_2.createValueDebuger(core_2.initChainCreator({ loggerOptions }), dataDir);
        if (cdr.err) {
            return { err: cdr.err };
        }
        return { err: core_2.ErrorCode.RESULT_OK, session: cdr.debuger.createIndependSession() };
    },
    async createChainSession(loggerOptions, dataDir, debugerDir) {
        const cdr = await core_2.createValueDebuger(core_2.initChainCreator({ loggerOptions }), dataDir);
        if (cdr.err) {
            return { err: cdr.err };
        }
        return cdr.debuger.createChainSession(debugerDir);
    }
};
exports.valueChainDebuger = valueChainDebuger;
