const {BX_SetLogLevel, BLOG_LEVEL_WARN, BLOG_LEVEL_ERROR} = require('../base/base');
const SuperNode = require('./Peer/super_node');

const dhtConfig = require('./dhtconfig');

const P2P = require('../p2p/p2p');

const SNServerConfig = { peerid: 'DHTSN', 
    tcp: {
        addrList: ['0.0.0.0'],
        initPort: 6000,
        maxPortOffset: 0,
    },
    udp: {
        addrList: ['0.0.0.0'],
        initPort: 5099,
        maxPortOffset: 0,
    }
};

BX_SetLogLevel(BLOG_LEVEL_WARN);

const SuperNodeRPCPort = 11111;

const SuperNodePeer = 'supernode';

const superNodeConfig = {
    peerid: SuperNodePeer,
    port: 5000, 
    vport: 10000, 
    chaindb:'./storage/chain_super.db', 
    storagePath: './storage/block_super',
    accountWif: 'KxzxXbHPf2oiMURvMk94NyKn8ncSXPvGERDNaXvf8vLqweXabJJt',
    snDHT: dhtConfig,
    rpcPort: SuperNodeRPCPort,
    devmode: true,
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

async function start() {
    await startSN(SNServerConfig);

    let superNode = new SuperNode(superNodeConfig);
    superNode.create();
}

start();
