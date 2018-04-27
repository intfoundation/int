/**
 * 测试目标：完成Meta链的上层基本功能
 * 1. 启动两个MetaNode，验证第二个MetaNode可以正常加入链
 * 2. 测试Meta链出上层块
 * 
 * 需要一个DHTServer
 */

const {BX_SetLogLevel, BLOG_LEVEL_WARN, BLOG_LEVEL_ERROR} = require('../../base/base');
const config = require('../../chainlib/config');
//const MetaNode = require('../../meta_node/meta_node');
//const MinerNode = require('../../client/Peer/miner_node');
const MetaNode = require('../../meta_node/metanode');
const MinerNode = require('../../client/Peer/minernode');
const BrowserNode = require('../../client/Peer/browser_node');
const P2P = require('../../p2p/p2p');

BX_SetLogLevel(BLOG_LEVEL_ERROR);
//启动DHTServer用，eplist可以填空数组，内部用不到
const snDHTServerConfig = {
    peerid: 'DHTSN1',
    tcp: {
        // addrList: ['127.0.0.1'],
        // initPort: 20000,
        // maxPortOffset: 0,
    },
    udp: {
        addrList: ['127.0.0.1'],
        initPort: 20000,
        maxPortOffset: 0,
    }
};
//初始化BDT的dht表用，只需要peerid和eplist,eplist里的地址必须可连接
const snDHTDefault = [
    { peerid: 'DHTSN1', eplist: ['4@127.0.0.1@20000@u'] },
];

const META_NODE_LOGIN_URL = 'http://127.0.0.1:23333/login';
const META_NODE_WAGE_URL = 'http://127.0.0.1:23333/wage';


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


let metaNodeConfig1 = {
    protocolConfig: {
        port: 10000, 
        vport: 10000, 
        snDHT: snDHTDefault,
        addrList: ['127.0.0.1'],
    },
    nodeConfig: {
        chaindb:'./storage2/node/chain_1.db', 
        storagePath: './storage2/node/block_1',
        config: config,
    },
    metaConfig: {
        chaindb:'./storage2/meta/chain_1.db', 
        storagePath: './storage2/meta/block_1',
        config: config,
        metaDB:'./storage2/meta1.db',
    },
    accountWif: 'L5RhP7KP5yXaswf6iLKZCJrateUpp1qHvKMADPrae72MJWgXa9jm',
    sig: 'e433f1ebcd4be632127974871d2d207c93a821d9a21a68a6eba7083d4597bd741aaea6776a4fda957d1edbb6412d9d009ac5512d6521b2aa4dad216fa557ed1b',
    number: 1, 
    rpcPort: 11000,
    metaDB:'./storage2/meta1.db',
};

let metaNodeConfig2 = {
    protocolConfig: {
        port: 10001, 
        vport: 10000, 
        snDHT: snDHTDefault,
        addrList: ['127.0.0.1'],
    },
    nodeConfig: {
        chaindb:'./storage2/node/chain_2.db', 
        storagePath: './storage2/node/block_2',
        config: config,
    },
    metaConfig: {
        chaindb:'./storage2/meta/chain_2.db', 
        storagePath: './storage2/meta/block_2',
        config: config,
        metaDB:'./storage2/meta2.db',
    },
    accountWif: 'L3TrBuLMmq61oRwfdgnLo4bXb7fe7UBnRBBS2KHi9fCozPke9NUj',
    sig: 'f24f5ed34153276d5552574a21ec13480693396415b67c8517f18430a6ed728a55a0d80541a0fb0079cb6286d60b208734b308af043f5231aa372755a0db7442',
    number: 2,
    rpcPort: 11001,
    metaDB:'./storage2/meta2.db',
};

let metaNodeConfig3 = {
    protocolConfig: {
        port: 10002, 
        vport: 10000, 
        snDHT: snDHTDefault,
        addrList: ['127.0.0.1'],
    },
    nodeConfig: {
        chaindb:'./storage2/node/chain_3.db', 
        storagePath: './storage2/node/block_3',
        config: config,
    },
    metaConfig: {
        chaindb:'./storage2/meta/chain_3.db', 
        storagePath: './storage2/meta/block_3',
        config: config,
        metaDB:'./storage2/meta3.db',
    },
    accountWif: 'KxmJVXG11kFR1dMNg9JQTVKDHtMimHBrh8F5WyhqHiE97wRR3HD7',
    sig: 'e328303446175ee0181cd862127ee2d730e14809a30f9dd33d87c03c28a6ca5f1a9d0ae53114da5a89d8801a26d15b3f9439f0bd35581a5e5d1ce112e366ef1a',
    number: 3,
    rpcPort: 11002,
    metaDB:'./storage2/meta3.db',
};

const minerConfig1 = {
    protocolConfig: {
        port: 11001, 
        vport: 10000, 
        snDHT: snDHTDefault,
        addrList: ['127.0.0.1'],
    },
    chainConfig: {
        chaindb:'./storage2/miner/chain1.db', 
        storagePath: './storage2/miner/block1',
        config: config,
    },
    accountWif: 'Kx1vvQLVhSpRprKLBY9TU5CygfbCCT4aPZPvCW6AKrtUuqqibweU',
    wagedb: './storage2/miner/wage1.db',
    metaUrl: META_NODE_LOGIN_URL,
    wageUrl: META_NODE_WAGE_URL,
};

const minerConfig2 = {
    protocolConfig: {
        port: 11002, 
        vport: 10000, 
        snDHT: snDHTDefault,
        addrList: ['127.0.0.1'],
    },
    chainConfig: {
        chaindb:'./storage2/miner/chain2.db', 
        storagePath: './storage2/miner/block2',
        config: config,
    },
    accountWif: 'L4URZ5PKiL3DpmGkpHjD2232KiyQsDY9g9zLvfdmiPLSveWAvTF1',
    wagedb: './storage2/miner/wage2.db',
    metaUrl: META_NODE_LOGIN_URL,
    wageUrl: META_NODE_WAGE_URL,
};

const browserConfig = {
    protocolConfig: {
        peerid: 'browser_test',
        port: 11003, 
        vport: 10000, 
        snDHT: snDHTDefault,
        addrList: ['127.0.0.1'],
    },
    chainConfig: {
        chaindb:'./storage2/browser/chain_browser.db', 
        storagePath: './storage2/browser/',
        config: config,
    },
};

let metaNode1 = new MetaNode(metaNodeConfig1);
let metaNode2 = new MetaNode(metaNodeConfig2);
let metaNode3 = new MetaNode(metaNodeConfig3); 

let minerNode1 = new MinerNode(minerConfig1);
let minerNode2 = new MinerNode(minerConfig2);

let browserNode = new BrowserNode(browserConfig);

async function main() {
    await startSN(snDHTServerConfig);
    await metaNode1.create();

    await new Promise((resolve)=>{
        setTimeout(resolve, 1000);
    });

    //await browserNode.create();

    //await minerNode1.create();
    //await minerNode2.create();

    //let miner1Address = minerNode1.m_address.toString();
    //metaNode1.createCoinBase([{address:miner1Address, amount:50000}]);

    // setTimeout(() => {
    //     let miner1Address = minerNode1.m_address.toString();
    //     let miner2Address = minerNode2.m_address.toString();
    //     //minerNode1.spend(minerConfig1.accountWif, [{address:miner2Address, amount: 200}]);
    //     //let hashlist = ['adfasdfsdf231221212','sdfasdfasdwerqwe23412341234'];
    //     //minerNode1.onUpdateHeader(this.m_blockChain,2)
    //     minerNode1.beginMine();
    // }, 10*1000);

    
    // metaNode2.on('onStateChange', (oldState, newState) => {
    //     console.log(`metaNode2 state ${oldState} => ${newState}`);
    //     if (newState === MetaNode.STATE.work) {
    //         //test make metaBlock
    //     }
    // });

    //metaNode1.initGroup('1',5);

     await metaNode2.create();

    /*
    setTimeout(() => {
        metaNode3.create();
    },5000);
    */
}

process.on('unhandledRejection', error => {
    console.error('unhandledRejection', error);
    process.exit(1)
});

main();