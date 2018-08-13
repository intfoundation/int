"use strict";
const EventEmitter = require('events');
const assert = require('assert');

class NewBlockDriver extends EventEmitter {
    constructor(number, id, intervalTime, txStorage, devmode = false) {
        super();
        this.nodeTurns = [];//记录参与出块的节点的id列表
        this.prevNode = -2;
        this.m_id = id;//自己的id
        this.intervalTime = intervalTime;//出块时间间隔
        this.number = number;//分配的顺序number
        this.txStorage = txStorage;
        this.devmode = devmode?devmode:0;
        this.begintimes = 1483200000000; //2017-01-01 00:00:00
        this.lastblocktime = 0;//
        this.monitorTimer = 0;
        this.newBlockTimer = 0;
    }

    checkTurn(time, id) {
        if (this.nodeTurns.length === 0) {
            console.log(`[newBlockDriver checkTurn] nodeTruns.length=0`);
            return true;
        }
        let n = this._getTimeSolt(time);
        let nIndex = n % this.nodeTurns.length;
        if (this.prevNode !== this.nodeTurns[nIndex] && id === this.nodeTurns[nIndex]) {
            return true;
        }
        console.log(`[newBlockDriver checkTurn] thisid=${this.m_id},prevNode=${this.prevNode},id=${id}, nIndexID=${this.nodeTurns[nIndex]}`);

        return false;
    }

    updateTurns(turns) {
        if (this._compareList(turns, this.nodeTurns)) {
            return;
        }
        this.nodeTurns = turns;
    }

    next(prevId, blocktime) {
        this.prevNode = prevId;
        this.lastblocktime = blocktime;
        this.beginNewBlock();
    }

    beginNewBlock() {
        this._endNewBlockTimer();
        this._endMonitorTimer();
        let timeOffset = this.intervalTime;
        if (this.lastblocktime > 0) {
            let nLastSolt = this._getTimeSolt(this.lastblocktime);
            let now = Date.now();
            let n = this._getTimeSolt(now);
            //assert(n >= nLastSolt, `beginNewBlock error n=${n},nLastSolt=${nLastSolt},now=${now},lastblocktime=${this.lastblocktime}`);
            if (nLastSolt === n) {
                timeOffset = n * this.intervalTime + this.begintimes + 100 - now; //离下一个solt的时间间隔
            } else if (n > nLastSolt) {
                timeOffset = 0;
            } else {
                console.log(`[newBlockDriver beginNewBlock] error n=${n},nLastSolt=${nLastSolt},now=${now},lastblocktime=${this.lastblocktime}`);
            }
            console.log(`[newBlockDriver beginNewBlock] thisid=${this.m_id},lastsolt=${nLastSolt},nowsolt=${n},timeOffset=${timeOffset},min=${(n-1)*this.intervalTime+this.begintimes},now=${now}, max=${(n)*this.intervalTime+this.begintimes}`);
        }

        if (timeOffset === 0) {
            this._newBlockImpl();
        }
        this.newBlockTimer = setTimeout(() => {
            this._newBlockImpl();
    }, timeOffset);
    }

    _newBlockImpl() {
        let now = Date.now();
        let n = this._getTimeSolt(now);
        let nIndex = n % this.nodeTurns.length;
        if (nIndex === 0) {
            this.emit("OnUpdateTurns", this);
        }
        this.currNode = this.nodeTurns[nIndex];
        console.log(`[newBlockDriver _newBlockImpl] thisid=${this.m_id},trunid=${this.nodeTurns[nIndex]},min=${n*this.intervalTime+this.begintimes},now=${Date.now()}`);
        if (this.nodeTurns[nIndex] === this.m_id) {
            this.emit("OnNewBlock", this, this.nodeTurns, now);
        }

        this._beginMonitorTimer();
    }

    _getTimeSolt(time) {
        let n = Math.floor((time - this.begintimes) / this.intervalTime);
        if (n * this.intervalTime + this.begintimes < time) {
            n = n + 1;
        }

        return n;
    }

    _beginMonitorTimer() {
        this._endMonitorTimer();
        this.monitorTimer = setTimeout(() => {
            console.log(`[newBlockDriver _beginMonitorTimer]  thisid=${this.m_id}, intervalTime=${this.intervalTime}`);
        this._newBlockImpl();
    }, this.intervalTime);
    }

    _endMonitorTimer() {
        if (this.monitorTimer !== 0) {
            clearTimeout(this.monitorTimer);
            this.monitorTimer = 0;
        }
    }

    _endNewBlockTimer() {
        if (this.newBlockTimer !== 0) {
            clearTimeout(this.newBlockTimer);
            this.newBlockTimer = 0;
        }
    }

    _compareList(list1, list2) {
        if (list1.length !== list2.length) {
            return false;
        }

        for (let i = 0; i < list1.length; i++) {
            if (list1[i] != list2[i]) {
                return false;
            }
        }

        return true;
    }

    _getIndex(nodeID) {
        for (let i = 0; i < this.nodeTurns.length; i++) {
            if (nodeID === this.nodeTurns[i]) {
                return i;
            }
        }
        return -1;
    }
}

module.exports = NewBlockDriver;