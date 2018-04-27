const {BX_SetLogLevel, BLOG_LEVEL_WARN, BLOG_LEVEL_INFO, BLOG_LEVEL_ERROR} = require('../../base/base');

const BrowserNode = require('../../client/Peer/browser_node');

BX_SetLogLevel(BLOG_LEVEL_WARN);
const config = require('../../chainlib/config');

const snDHTDefault = [
    { peerid: 'DHTSN', eplist: ['4@106.75.173.44@12110@u','4@106.75.173.44@12111@t'] },
];

const browserConfig = {
    protocolConfig: {
        peerid: 'browser_test3',
        port: 12399, 
        vport: 12100,
        snDHT: snDHTDefault,
        tcp:{
            port:12398,
            addrList: ['0.0.0.0'],
        },
        udp:{
            port:12399,
            addrList: ['0.0.0.0'],
        },
        //addrList: ['0.0.0.0'],
    },
    chainConfig: {
        chaindb:'./storage/chain_browser.db', 
        storagePath: './storage/chain_browser',
        config: config,
    },
};

let browserNode = new BrowserNode(browserConfig);

let doSpend = false;

/*
可用Address: 
{
	"19fHD2uxWtQ5xJ9rjhDVhFNEMp659u7JHb": "L2RbSG3JKq5vZ7k84x8uYL7ZvCLPo9MFaAJPkRFgamRFhjxbAPAx",  //test3_1
	"1HH3SwayDsS2MsXVi6b3dLBbuZPQp3P8wH": "Kz921ZTidseJkWpHSzhQiRez7ZieCxxcC9FsCj5NFbMiGabJDn2F",  //test3_2
	"12cnRvyhCEVFVcx8BawPbn4kgp3ixsdedM": "L1ktX5gUwPoxNF1Z6A6zYzGdBt8RCvHWfmRG8Gd81SyUVHyyy3k7",  //test1_1
	"19jAKRouUbCtGcYJgZqqimUw2DGbAZzDUZ": "KwmDq4S6uwABXWiYAoX8CrA2wGQWuacRxYUoJGWefMkHsK91PuVS",  //test1_2
	"1Fbfv5f5QjWCGsCRSY8tA7Whmg2FPyNJ5j": "KwVqsRTNZT9uB3LqysZ9SeuHDkPsu8ur2dTnHWx6Ebr6A5TsDSaC",  //test2_1
	"1JSjsnzXf6A8GKAd8eytwPHqr6Ci33FCbp": "KymyE49BsZ1DAR4pkKQL6C84V8cSceByQy5AjDXTvWDG6JZgW3eW",  //test2_2
}
*/

//为测试优化：不打印已经打印过的块
let printed = -1;

async function start() {
    browserNode.on('onStateChange', async (oldState, newState) => {
        console.log(`browser node ${oldState} => ${newState}`);
        // BrowserNode.STATE.updated状态表示这个节点已经更新到链上的最新块了
        if (newState === BrowserNode.STATE.updated) {
            console.log('browser node updated.');

            if (doSpend) {
                doSpend = false;
                browserNode.spend("L1ktX5gUwPoxNF1Z6A6zYzGdBt8RCvHWfmRG8Gd81SyUVHyyy3k7", [
                    {address:'19fHD2uxWtQ5xJ9rjhDVhFNEMp659u7JHb', amount:100},
                ]);
                console.log('do spend success');
            }

            // 获取当前链高度
            let currentHeight = browserNode.getNowHeight();
            console.log(`browser see height ${currentHeight}`);

            // 通过地址字符串查询余额
            let addressStr = '12cnRvyhCEVFVcx8BawPbn4kgp3ixsdedM';
            let addressAmount = await browserNode.getAmountByAddress(addressStr);
            console.log(`address ${addressStr} have amount ${addressAmount}`);

            // 通过块高度查询交易
            for (let index = 0; index <= currentHeight; index++) {
                let block = await browserNode.getBlockByHeight(index);
                let blockSize = browserNode.getBlockSizeByHash(block.hash('hex'));
                if (printed < block.height) {
                    console.log(`block ${block.hash('hex')} (height ${block.height})(${blockSize} bytes)info:`);
                    printed = block.height;
                }
                
                //block.txs存储块内的交易
                for(let tx of block.txs) {
                    //tx表示一条交易
                    console.log(`tx ${tx.hash('hex')}:`);
                    if (tx.isCoinbase()) {
                        //console.log('input: coinbase');
                    } else {
                        //tx.inputs表示交易的所有input
                        for(let input of tx.inputs) {
                            //console.log(input.toJSON());
                        }
                    }

                    //tx.outputs表示交易的所有output
                    for(let output of tx.outputs) {
                        //console.log(output.toJSON());
                    }
                }
                
            }
        }
    });
    await browserNode.create();
}

process.on('unhandledRejection', error => {
    console.error('unhandledRejection', error);
    process.exit(1);
});

start();