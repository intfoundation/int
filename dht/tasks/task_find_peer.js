'use strict';

const Base = require('../../base/base.js');
const {HashDistance, Result: DHTResult} = require('../util.js');
const Peer = require('../peer.js');
const {TouchNodeConvergenceTask} = require('./task_touch_node_recursion.js');
const DHTPackage = require('../packages/package.js');
const DHTCommandType = DHTPackage.CommandType;

const LOG_TRACE = Base.BX_TRACE;
const LOG_INFO = Base.BX_INFO;
const LOG_WARN = Base.BX_WARN;
const LOG_DEBUG = Base.BX_DEBUG;
const LOG_CHECK = Base.BX_CHECK;
const LOG_ASSERT = Base.BX_ASSERT;
const LOG_ERROR = Base.BX_ERROR;

class FindPeerTask extends TouchNodeConvergenceTask {
    constructor(owner, peerid, callback) {
        super(owner);

        this.m_peerid = peerid;

        this.m_foundPeerList = new Map();
    }

    get peerid() {
        return this.m_peerid;
    }

    _processImpl(response, remotePeer) {
        LOG_INFO(`LOCALPEER:(${this.bucket.localPeer.peerid}:${this.servicePath}) remotePeer:${response.common.src.peerid} responsed FindPeer(${this.m_peerid})`);
        this.m_foundPeerList.set(response.common.src.peerid, new Peer.Peer(response.common.src));
        if (response.common.src.peerid === this.m_peerid) {
            this._onComplete(DHTResult.SUCCESS);
        } else {
            super._processImpl(response, remotePeer);
        }
    }

    _onCompleteImpl(result) {
        LOG_INFO(`LOCALPEER:(${this.bucket.localPeer.peerid}:${this.servicePath}) FindPeer complete:${this.m_foundPeerList.size}`);
        let foundPeerList = [...this.m_foundPeerList.values()];
        HashDistance.sortByDistance(foundPeerList, {hash: HashDistance.checkHash(this.m_peerid)});
        this._callback(result, foundPeerList);
    }

    _createPackage() {
        let cmdPackage = this.packageFactory.createPackage(DHTCommandType.FIND_PEER_REQ);
        cmdPackage.body = {
            taskid: this.m_id,
            target: this.m_peerid
        };
        return cmdPackage;
    }

    get _targetKey() {
        return this.m_peerid;
    }

    _stopImpl() {
    }
}

module.exports = FindPeerTask;