const {BX_SetLogLevel, BLOG_LEVEL_WARN, BLOG_LEVEL_ERROR} = require('../bdt/base/base');
const P2P = require('../bdt/p2p/p2p');

BX_SetLogLevel(BLOG_LEVEL_ERROR);

const snDHTServerConfig = {
    peerid: 'DHTSN',
    tcp: {
        addrList: ['0.0.0.0'],
        initPort: 12111,
        maxPortOffset: 0,
    },
    udp: {
        addrList: ['0.0.0.0'],
        initPort: 12110,
        maxPortOffset: 0,
    }
};

async function startSN(port) {
    snDHTServerConfig.tcp.initPort = port + 1;
    snDHTServerConfig.udp.initPort = port;
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

let port = process.argv[2] || 12110;

startSN(port);
