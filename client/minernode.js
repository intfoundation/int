const fs = require('fs-extra');
const moment = require('moment');

const {NetHelper} = require('../bdt/base/util');
const {BX_SetLogLevel, BX_EnableFileLog,BLOG_LEVEL_WARN, BLOG_LEVEL_ERROR,BLOG_LEVEL_DEBUG} = require('../base/base');
const MinerNode = require('./Peer/minernode');

const dhtConfig = require('./dhtconfig');
const config = require('../chainlib/config');
const path = require('path');

BX_SetLogLevel(BLOG_LEVEL_WARN);
//BX_EnableFileLog('c:\\blog','miner');

const minerConfig = {
    protocolConfig: {
        port: 12000,
        vport: 12100,
        snDHT: dhtConfig,
        tcp:{
            addrList: NetHelper.getLocalIPs(),//['0.0.0.0'],
            port: 12000,
        },
        udp:{
            addrList: NetHelper.getLocalIPs(),//['0.0.0.0'],
            port: 12000,
        },
    },
    chainConfig: {
        chaindb: path.join(__dirname, './storage/chain.db'),
        storagePath: path.join(__dirname, './storage/block'),
        config: config,
    },
    //accountWif: 'Kx1vvQLVhSpRprKLBY9TU5CygfbCCT4aPZPvCW6AKrtUuqqibweU',
    wagedb: './storage/wage.db',
};


let minerNode = null;

async function start(accountWif, tcpBDTPort,udpBDTPort, postfix) {
    minerConfig.accountWif = accountWif;
    minerConfig.protocolConfig.tcp.port = tcpBDTPort;
    minerConfig.protocolConfig.udp.port = udpBDTPort;
    let logfile = 'log.txt';
    if (postfix) {
        minerConfig.chainConfig.chaindb = path.join(__dirname, `./storage/chain${postfix}.db`);
        minerConfig.chainConfig.storagePath = path.join(__dirname, `./storage/block${postfix}`);
        minerConfig.wagedb = path.join(__dirname, `./storage/wage${postfix}.db`);

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
        //fs.appendFileSync(logfile, str+'\r\n');
    }

    minerNode = new MinerNode(minerConfig);
    await minerNode.create();
    await minerNode.beginMine();
}

if (process.argv.length < 5) {
    console.log('Usage: node minernode.js <minerAccountWIF> <tcpBDTPort> <udpBDTPort> {MinerPostfix}');
}

process.on('unhandledRejection', error => {
    console.error('unhandledRejection', error);
    process.exit(1);
});

start(process.argv[2], parseInt(process.argv[3]), parseInt(process.argv[4]), process.argv[5]);