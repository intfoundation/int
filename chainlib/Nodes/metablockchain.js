'uses strict'
const assert = require('assert');

const BlockChain = require('./blockchain');
const { Info } = require('../../chainlib/Infos/Info');
const KeyRing = require('../../chainlib/Account/keyring');
const MetaDB = require('../../db/meta');

class MetaBlockChain extends BlockChain {
    constructor(params) {
        super(params);

        this.m_metaList = new Map();
        this.m_metaDB = new MetaDB(params.metaDB);
    }

    async create() {
        await super.create();
        let header = await this.m_headerChain.getHeaderByHeight(0);
        if (header) {
            let block = this.m_blockStorage.get(header.hash('hex'));
            if (block) {
                for (const tx of block.txs) {
                    assert(tx.isDataTX());
                    let metaInfo = Info.fromRaw(tx.getData());
                    if (metaInfo.getType() === Info.type.METAINFO) {
                        this.addMetaInfo(metaInfo.pubkey, metaInfo.number);
                    }
                }
            }
        }

        await this.m_metaDB.init();

        await this.m_metaDB.clearGroupInfoTable();
        setInterval(() => {
            this.m_metaDB.clearGroupInfoTable();
    }, 30 * 24 * 60 * 6000);
    }

    async storageBlock(newBlock) {
        await super.storageBlock(newBlock);
        for (const tx of newBlock.txs) {
            assert(tx.isDataTX());
            let metaInfo = Info.fromRaw(tx.getData());
            if (metaInfo.getType() === Info.type.GROUPINFO) {
                await this.m_metaDB.updateGroups(metaInfo.members);
            }
        }
    }

    getMetaList() {
        return this.m_metaList;
    }

    addMetaInfo(pubkey, id) {
        if (this.m_metaList.has(id)) {
            return false;
        }

        //兼容JSON.stringify的Buffer表现形式
        if (pubkey.type === "Buffer") {
            pubkey = Buffer.from(pubkey.data);
        }

        let peerid = KeyRing.fromPublic(pubkey).getAddress('string');
        this.m_metaList.set(id, { pubkey: pubkey, peerid: peerid });
        return true;
    }

    addMetaInfos(list) {
        let added = []
        for (const { id, pubkey } of list) {
            if (this.addMetaInfo(pubkey, id)) {
                added.push(pubkey);
            }
        }

        return added;
    }

    getOtherMetaPeerids(myPeerid) {
        let peerids = [];
        for (const [id, { pubkey, peerid }] of this.m_metaList) {
            if (peerid != myPeerid) {
                peerids.push(peerid);
            }
        }

        return peerids;
    }

    isInMetaList(myid) {
        return this.m_metaList.has(myid);
    }

    peeridIsMeta(checkPeerid) {
        for (const [id, { pubkey, peerid }] of this.m_metaList) {
            if (checkPeerid === peerid) {
                return true;
            }
        }
    }

    getMetaListArray() {
        let list = [];
        for (const [id, { pubkey, peerid }] of this.m_metaList) {
            list.push({ id: id, pubkey: pubkey });
        }
        return list;
    }

    getIDByPeerid(peerid) {
        let id = null;
        for (const [id, { pubkey, pid }] of this.m_metaList) {
            if (peerid === pid) {
                return id;
            }
        }
    }

    removeMetaByPeerid(peerid) {
        if (!peerid) {
            return;
        }
        for (const [id, info] of this.m_metaList) {
            if (peerid === info.peerid) {
                this.m_metaList.delete(id);
                return;
            }
        }
    }

    getMetaListIDArray() {
        let list = []
        for (const [id, { pubkey, peerid }] of this.m_metaList) {
            list.push(id);
        }
        return list;
    }

    getMetaListSize() {
        return this.m_metaList.size;
    }

    verifySystemSig(msg, sig) {
        let systemAccount = KeyRing.fromPublic(Buffer.from(this.config.systemPubKey, 'hex'));
        return systemAccount.verifyHash(msg, sig);
    }

    verifyMetaSig(id, msg, sig) {
        if (!this.m_metaList.has(id)) {
            return false;
        }
        let account = KeyRing.fromPublic(this.m_metaList.get(id).pubkey);
        return account.verifyHash(msg, sig);
    }
}

module.exports = MetaBlockChain;