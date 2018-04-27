const {
    blog, BX_SetLogLevel, BLOG_LEVEL_WARN, BLOG_LEVEL_ERROR,
    BLOG_LEVEL_INFO,
    BLOG_LEVEL_ALL,
} = require('../../base/base');

const P2P = require('../../p2p/p2p');

global.ll = console.log.bind(console)


BX_SetLogLevel(BLOG_LEVEL_INFO);

//启动DHTServer用，eplist可以填空数组，内部用不到
const snDHTServerConfig = {
    peerid: 'win10-peer',
    tcp: {
        addrList: ['0.0.0.0'],
        initPort: 20010,
        maxPortOffset: 0,
    },
    udp: {
        addrList: ['0.0.0.0'],
        initPort: 20000,
        maxPortOffset: 0,
    }
};


(async  (snDHTServerConfig) => {
    let {result, p2p} = await P2P.create(snDHTServerConfig);
    p2p.joinDHT([], true);
    result = await p2p.startupSNService(true);
})(snDHTServerConfig)


