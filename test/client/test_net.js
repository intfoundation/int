const {BX_SetLogLevel, BLOG_LEVEL_WARN, BLOG_LEVEL_ERROR} = require('../../base/base');
const SuperNode = require('../../client/Peer/super_node');
const MinerNode = require('../../client/Peer/miner_node');
const BrowserNode = require('../../client/Peer/browser_node');
const P2P = require('../../p2p/p2p');
const SuperNodeClient = require('../../client/Peer/superNodeClient');

const config = require('../../chainlib/config');

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
startSN(snDHTServerConfig);

/*
"1QAaPGJVfCzGfgQMLWTbVLCUb6CFtvKzJL":"Kx1vvQLVhSpRprKLBY9TU5CygfbCCT4aPZPvCW6AKrtUuqqibweU",
"13uSx16NuhD8cPF73Rg7XaBqBeGPMBrp2R":"L4URZ5PKiL3DpmGkpHjD2232KiyQsDY9g9zLvfdmiPLSveWAvTF1",
"13FyK9sE2G1c2obHqBGgtJCpk4kM93Wib4":"Kyr8rugRjNxv3f1ourhs5JxFNSDSqp3aJQGnEeFeHF9sPJANynFu",
*/

const miner1Address = '1QAaPGJVfCzGfgQMLWTbVLCUb6CFtvKzJL';

const miner2Address = '13uSx16NuhD8cPF73Rg7XaBqBeGPMBrp2R';

const miner3Address = '13FyK9sE2G1c2obHqBGgtJCpk4kM93Wib4';

const SuperNodeRPCPort = 11000;

const superNodeConfig = {
    protocolConfig: {
        peerid: config.SuperNodePeer,
        port: 10000, 
        vport: 10000, 
        snDHT: snDHTDefault,
        addrList: ['127.0.0.1'],
    },
    chainConfig: {
        chaindb:'./storage2/chain_super.db', 
        storagePath: './storage2/block_super',
        config: config,
    },
    peerid: config.SuperNodePeer,
    vport: 10000, 
    chaindb:'./storage/chain_super.db', 
    storagePath: './storage/block_super',
    accountWif: 'KxzxXbHPf2oiMURvMk94NyKn8ncSXPvGERDNaXvf8vLqweXabJJt',
    rpcPort: SuperNodeRPCPort,
    wageUrl: META_NODE_WAGE_URL,
    devmode: true
};

const minerConfig1 = {
    protocolConfig: {
        port: 10001, 
        vport: 10000, 
        snDHT: snDHTDefault,
        addrList: ['127.0.0.1'],
    },
    chainConfig: {
        chaindb:'./storage2/chain1.db', 
        storagePath: './storage2/block1',
        config: config,
    },
    accountWif: 'Kx1vvQLVhSpRprKLBY9TU5CygfbCCT4aPZPvCW6AKrtUuqqibweU',
    wagedb: './storage/wage1.db',
    vport: 10000,
    snDHT: snDHTDefault,
    udp: {
        addrList: ['127.0.0.1'],
        port: 10001,
    },
    metaUrl: META_NODE_LOGIN_URL,
    wageUrl: META_NODE_WAGE_URL,
};

const minerConfig2 = {
    protocolConfig: {
        port: 10002, 
        vport: 10000, 
        snDHT: snDHTDefault,
        addrList: ['127.0.0.1'],
    },
    chainConfig: {
        chaindb:'./storage2/chain2.db', 
        storagePath: './storage2/block2',
        config: config,
    },
    accountWif: 'L4URZ5PKiL3DpmGkpHjD2232KiyQsDY9g9zLvfdmiPLSveWAvTF1',
    wagedb: './storage/wage2.db',
    vport: 10000,
    snDHT: snDHTDefault,
    udp: {
        addrList: ['127.0.0.1'],
        port: 10002,
    },
    metaUrl: META_NODE_LOGIN_URL,
    wageUrl: META_NODE_WAGE_URL,
};

const browserConfig = {
    protocolConfig: {
        peerid: 'browser_test',
        port: 10003, 
        vport: 10000, 
        snDHT: snDHTDefault,
        addrList: ['127.0.0.1'],
    },
    chainConfig: {
        chaindb:'./storage2/chain_browser.db', 
        storagePath: './storage2/chain_browser',
        config: config,
    },
};

let superNode = new SuperNode(superNodeConfig);
let minerNode1 = new MinerNode(minerConfig1);
let minerNode2 = new MinerNode(minerConfig2);
let browserNode = new BrowserNode(browserConfig);

async function prepare() {
    await superNode.create();
    await new Promise((resolve)=>{
        setTimeout(resolve, 1000);
    });   

    //for test: miner1 send 20000 to miner 2
    minerNode1.on('onBlock', (height) => {
        if (height === 1) {
            minerNode1.spend(minerConfig1.accountWif, [{address:miner2Address, amount: 20000}]);
        }
    });

    browserNode.on('onStateChange', (oldState, newState) => {
        console.log(`browser node ${oldState} => ${newState}`);
        if (newState === BrowserNode.STATE.updated) {
            console.log('browser node updated.');
            console.log(`browser see height ${browserNode.getNowHeight()}`);
        }
    });

    let ret = await minerNode1.create();
    if (ret !== MinerNode.ERROR.success) {
        console.log(`minernode1 init error, ret ${ret}. exit.`);
        process.exit(0);
    }
    ret = await minerNode2.create();
    if (ret !== MinerNode.ERROR.success) {
        console.log(`minernode2 init error, ret ${ret}. exit.`);
        process.exit(0);
    }
    
    //await browserNode.create();
    //await minerNode1.beginMine();
    //await minerNode2.beginMine();
    
}

async function main() {
    await prepare();
    await new Promise((resolve)=>{
        setTimeout(resolve, 1000);
    });
    if (superNode.noCoinbase()){
        await superNode.createCoinBase([{address:miner1Address, amount:50000}]);
        console.log('supernode createCoinbase completed');
    }

    //let client = new SuperNodeClient('127.0.0.1', SuperNodeRPCPort);
    //let height = await client.getNowBlockHeight();
    //await client.createCoinbase([{address:miner1Address, amount:50000}]);
    // await minerNode1.send(minerConfig1.accountWif, [{address:miner2Address, amount: 20000}]);
}

main();








