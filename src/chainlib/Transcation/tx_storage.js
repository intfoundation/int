'use strict'

const EventMitter = require('events');

//暂时先不永久化存储
class TxStorage  extends EventMitter {
    constructor(dbObj) {
        super();
        this.m_chainDB = dbObj;
        this.m_cacheTx = [];
    }

    async init() {

    }

    getCount() {
        return this.m_cacheTx.length;
    }

    async deleteTx(hash){
        if (!hash || hash === "") {
            return;
        }

        let nCount = 0;
        for(let tx of this.m_cacheTx) {
            if (tx.hash('hex') === hash) {
                this.m_cacheTx.splice(nCount,1);
                break;
            }
            else {
                nCount++;
            }
        }

        if (this.m_cacheTx.length === 0) {
            this.emit("OnEmpty",this);
        }
    }

    async deleteTxs(list){
        while (list.length >0) {
            await this.deleteTx(list.shift());
        }
    }

    async shift() {
        return this.m_cacheTx.shift();
    }

    async addTx(tx) {
        this.m_cacheTx.push(tx);
        this.emit('OnNewTx',this)
    }

    async  hasTx(hash) {
        for(let tx of this.m_cacheTx) {
            if (tx.hash('hex') === hash) {
                return true;
            }
        }
        return false;
    }
}

module.exports = TxStorage;