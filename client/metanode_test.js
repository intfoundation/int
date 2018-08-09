const fs = require('fs-extra');
const moment = require('moment');

const {BX_SetLogLevel, BLOG_LEVEL_WARN, BLOG_LEVEL_ERROR} = require('../base/base');

const dhtConfig = require('./dhtconfig_test');

const P2P = require('../bdt/p2p/p2p');
const config = require('../chainlib/config');

const MetaNode = require('../meta_node/metanode');

BX_SetLogLevel(BLOG_LEVEL_ERROR);
//启动DHTServer用，eplist可以填空数组，内部用不到
const snDHTServerConfig = {
    peerid: 'DHTSN1',
    tcp: {
        addrList: ['0.0.0.0'],
        initPort: 12113,
        maxPortOffset: 0,
    },
    udp: {
        addrList: ['0.0.0.0'],
        initPort: 12112,
        maxPortOffset: 0,
    }
};

async function startSN(snDHTServerConfig) {
    let {result, p2p} = await P2P.create(snDHTServerConfig);
    if (result !== 0) {
        console.warn(`start sn(P2P.create) failed: result = ${result}`);
    } else {
        p2p.joinDHT([], true);
        result = p2p.startupSNService(true);
        if (result !== 0) {
            console.warn(`start sn(p2p.startupSNService) failed: result = ${result}`);
        }
    }
}


let metaNodeConfig = {
    protocolConfig: {
        port: 12000, 
        vport: 12101, 
        snDHT: dhtConfig,
        tcp:{
            addrList: ['0.0.0.0'],
            port: 12000,
        },
        udp:{
            addrList: ['0.0.0.0'],
            port: 12000,
        },
    },
    nodeConfig: {
        chaindb:'./storage/node/chain.db', 
        storagePath: './storage/node/block',
        config: config,
    },
    metaConfig: {
        chaindb:'./storage/meta_node/chain.db',
        storagePath: './storage/meta_node/block',
        config: config,
        metaDB:'./storage/meta_node/meta_node.db',
    },
    //accountWif: '',
    //sig: '',
    number: 1, 
    rpcPort: 12001,
    devmode:1,
};

async function start(accountWif,sig,number, tcpBDTPort,udpBDTPort,rpcPort, postfix,bRunSNServer=0) {
    if (bRunSNServer === 1) {
        await startSN(snDHTServerConfig);
    }
    metaNodeConfig.accountWif = accountWif;
    metaNodeConfig.sig = sig,
    metaNodeConfig.number = number;
    metaNodeConfig.protocolConfig.tcp.port = tcpBDTPort;
    metaNodeConfig.protocolConfig.udp.port = udpBDTPort;
    metaNodeConfig.rpcPort = rpcPort;
    let logfile = 'log.txt';
    if (postfix) {
        metaNodeConfig.nodeConfig.chaindb = `./storage/node/chain${postfix}.db`;
        metaNodeConfig.nodeConfig.storagePath = `./storage/node/block${postfix}`;

        metaNodeConfig.metaConfig.chaindb = `./storage/meta/chain${postfix}.db`;
        metaNodeConfig.metaConfig.storagePath = `./storage/meta/block${postfix}`;
        metaNodeConfig.metaConfig.metaDB = `./storage/meta/meta${postfix}`;
        logfile = `log${postfix}.txt`;
    }
    if (fs.existsSync(logfile)) {
        fs.unlinkSync(logfile);
    }
    console.oldLog = console.log;
    console.log = function (str) {
        let time1 = moment(new Date).format("YYYY-MM-DD HH:mm:ss.SSS")
        str = time1.toString() + ' ' + str;
        console.oldLog(str);
        //fs.appendFileSync('./log.txt', str+'\r\n');
    }
   
    let metaNode = new MetaNode(metaNodeConfig);
    await metaNode.create();
}

process.on('unhandledRejection', error => {
    console.error('unhandledRejection', error);
    process.exit(1);
});

if (process.argv.length < 9) {
    console.log('Usage: node minernode.js <metaAccountWIF> <metaSig> <number> <tcpBDTPort> <udpBDTPort> <rpcPort> {MinerPostfix} <runSNServer>');
    process.exit(1);
}

start(process.argv[2],process.argv[3], parseInt(process.argv[4]), parseInt(process.argv[5]),parseInt(process.argv[6]),parseInt(process.argv[7]), process.argv[8],parseInt(process.argv[9]));