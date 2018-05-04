const {BX_SetLogLevel, BLOG_LEVEL_WARN, BLOG_LEVEL_ERROR} = require('../base/base');
const MinerNode = require('./Peer/minernode');

const dhtConfig = require('./dhtconfig');
const config = require('../chainlib/config');

BX_SetLogLevel(BLOG_LEVEL_ERROR);

const minerConfig = {
    protocolConfig: {
        port: 12000, 
        vport: 12100, 
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
    chainConfig: {
        chaindb:'./storage/chain.db', 
        storagePath: './storage/block',
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
    if (postfix) {
        minerConfig.chainConfig.chaindb = `./storage/chain${postfix}.db`;
        minerConfig.chainConfig.storagePath = `./storage/block${postfix}`;
        minerConfig.wagedb = `./storage/wage${postfix}.db`;
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