"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("../client");
const sqlite = require("sqlite");
const sqlite3 = require("sqlite3");
const fs = require("fs-extra");
let mainpeer;
let mainclient;
let cache = new Map();
class PeerHelper {
    constructor(name, m_client) {
        this.m_client = m_client;
        this.m_latest = -1;
        if (cache.has(name)) {
            this.m_cache = cache.get(name);
        }
        else {
            this.m_cache = new Map();
            cache.set(name, this.m_cache);
        }
    }
    async get(height) {
        if (this.m_cache.has(height)) {
            return this.m_cache.get(height);
        }
        let ret = await this.m_client.getBlock({ which: height });
        if (ret.block) {
            this.m_cache.set(height, ret.block.hash);
            this.m_cache.set(ret.block.number, ret.block.hash);
            if (height === 'latest') {
                this.m_latest = ret.block.number;
            }
            return ret.block.hash;
        }
        else {
            return;
        }
    }
    getLatestHeight() {
        return this.m_latest;
    }
}
class SqliteChainClient extends client_1.ChainClient {
    constructor(options) {
        super(options);
        this.m_dataDir = options.host;
    }
    async init() {
        if (!this.m_headerStorage) {
            this.m_db = await sqlite.open(this.m_dataDir + '/' + client_1.Chain.s_dbFile, { mode: sqlite3.OPEN_READONLY });
            let config = fs.readJSONSync(this.m_dataDir + '/config.json');
            let blockHeaderType = client_1.BlockHeader;
            switch (config.type.consensus) {
                case 'dpos':
                    blockHeaderType = client_1.DposBlockHeader;
                    break;
                case 'pow':
                    blockHeaderType = client_1.PowBlockHeader;
                    break;
                case 'dbft':
                    blockHeaderType = client_1.DbftBlockHeader;
                default:
                    break;
            }
            this.m_headerStorage = new client_1.HeaderStorage({
                logger: this.m_logger,
                blockHeaderType,
                db: this.m_db,
                blockStorage: undefined,
                readonly: true
            });
        }
    }
    async getBlock(params) {
        await this.init();
        let cr = await this.m_headerStorage.getHeader(params.which);
        return { err: cr.err, block: cr.header };
    }
}
async function checkDiff(peer1, peer2) {
    console.log(`checking between ${peer1.name} and ${peer2.name}`);
    let ph1 = new PeerHelper(peer1.name, peer1.client);
    let ph2 = new PeerHelper(peer2.name, peer2.client);
    let hash1 = await ph1.get('latest');
    let hash2 = await ph2.get('latest');
    let num1 = ph1.getLatestHeight();
    let num2 = ph2.getLatestHeight();
    if (hash1 === hash2) {
        if (num1 === num2) {
            console.log(`${peer1.name} and ${peer2.name} are synced, latest block ${num1} : ${hash1}`);
        }
        else {
            console.log(`${peer1.name} is ${num1 > num2 ? 'longer' : 'shorter'} then ${peer2.name} but syncd`);
            console.log(`${peer1.name} latest block ${num1} : ${hash1} and ${peer2.name} latest block ${num2} : ${hash2}`);
        }
        return;
    }
    console.log(`${peer1.name} and ${peer2.name} not synced, finding branch height...`);
    let begin = Math.min(num1, num2);
    let end = 0;
    do {
        let height = Math.ceil(begin / 2);
        let sh1 = await ph1.get(height);
        let sh2 = await ph2.get(height);
        if (sh1 === sh2) {
            end = height;
        }
        else {
            begin = height;
        }
        if (begin === end + 1) {
            break;
        }
    } while (true);
    console.log(`${peer1.name} and ${peer2.name} branced at ${begin}, where ${peer1.name} have hash ${ph1.get(begin)} and ${peer2.name} have hash ${ph2.get(begin)}`);
}
async function main() {
    let peers = process.argv.slice(2);
    console.log(`will check peers ${JSON.stringify(peers)}`);
    let logger = client_1.initLogger({ loggerOptions: { console: true } });
    for (const peer of peers) {
        let [name, host, port] = peer.split(':');
        if (!mainpeer) {
            mainpeer = name;
            mainclient = port ? new client_1.ChainClient({ host, port: parseInt(port), logger }) : new SqliteChainClient({ host, port: 0, logger });
        }
        else {
            await checkDiff({ name: mainpeer, client: mainclient }, { name, client: port ? new client_1.ChainClient({ host, port: parseInt(port), logger }) : new SqliteChainClient({ host, port: 0, logger }) });
        }
    }
}
main();
