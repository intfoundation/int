'use strict';

const Base = require('../../base/base.js');
const {Result: DHTResult, Config} = require('../util.js');
const Task = require('./task.js');
const DHTPackageFactory = require('../package_factory.js');
const DHTPackage = require('../packages/package.js');
const DHTCommandType = DHTPackage.CommandType;
const {ResendControlor} = require('../package_sender.js');

const TaskConfig = Config.Task;
const PackageConfig = Config.Package;

const LOG_INFO = Base.BX_INFO;
const LOG_WARN = Base.BX_WARN;
const LOG_DEBUG = Base.BX_DEBUG;
const LOG_CHECK = Base.BX_CHECK;
const LOG_ASSERT = Base.BX_ASSERT;
const LOG_ERROR = Base.BX_ERROR;

class SplitPackageTask extends Task {
    constructor(owner, cmdPackage, peer) {
        super(owner, {timeout: PackageConfig.Timeout});
        this.m_cmdPackage = cmdPackage;
        this.m_peer = peer;
        this.m_address = null;
        this.m_sendingPieces = [];
        this.m_owner = owner;
    }

    _startImpl() {
        LOG_INFO(`LOCALPEER:(${this.bucket.localPeer.peerid}:${this.servicePath}) start SplitPackage(seq:${this.m_cmdPackage.common.seq},type:${this.m_cmdPackage.cmdType},taskid:${this.id}) to ${this.m_sendingPieces.length} pieces.`);
        this._genPieces();
        for (let pkg of this.m_sendingPieces) {
            pkg.resender.send();
        }
    }

    _stopImpl() {
    }

    _processImpl(response, remotePeer) {
        LOG_INFO(`LOCALPEER:(${this.bucket.localPeer.peerid}:${this.servicePath}) SplitPackage (seq:${this.m_cmdPackage.common.seq},type:${this.m_cmdPackage.cmdType},taskid:${this.id}) response (${response.common.ackSeq}:${response.body.taskid}:${response.body.no}).`);
        for (let i = 0; i < this.m_sendingPieces.length; i++) {
            if (this.m_sendingPieces[i].body.no === response.body.no) {
                this.m_sendingPieces.splice(i, 1);
                break;
            }
        }

        if (this.m_sendingPieces.length === 0) {
            LOG_INFO(`LOCALPEER:(${this.bucket.localPeer.peerid}:${this.servicePath}) SplitPackage (seq:${this.m_cmdPackage.common.seq},type:${this.m_cmdPackage.cmdType},taskid:${this.id}) done.`);
            this._onComplete(DHTResult.SUCCESS);
        }
    }

    _retryImpl() {
        for (let pkg of this.m_sendingPieces) {
            pkg.resender.send();
        }
    }

    _onCompleteImpl(result) {
    }

    _genPieces() {
        if (this.m_cmdPackage.cmdPackage === DHTCommandType.PACKAGE_PIECE_REQ) {
            this.m_owner.BODY_LIMIT = 0;
        }

        let encoder = DHTPackageFactory.createEncoder(this.m_cmdPackage);
        let sendingBuffer = encoder.encode();
        const bodyLimit = this._bodyLimit();
        let pieceCount = Math.ceil(sendingBuffer.length / bodyLimit);
        let maxPkgNo = pieceCount - 1;

        let bodyOffset = 0;

        for (let pkgNo = 0; pkgNo < pieceCount; pkgNo++) {
            let piecePkg = this.packageFactory.createPackage(DHTCommandType.PACKAGE_PIECE_REQ);
            piecePkg.body = {
                taskid: this.id,
                peerid: this.bucket.localPeer.peerid,
                max: maxPkgNo,
                no: pkgNo,
                buf: sendingBuffer.slice(bodyLimit * pkgNo, Math.min(sendingBuffer.length, bodyLimit * (pkgNo + 1))),
            }

            piecePkg.resender = new ResendControlor(this.m_peer, piecePkg, this.packageSender, super.m_maxIdleTime, 5);
            this.m_sendingPieces.push(piecePkg);
        }
    }

    _bodyLimit() {
        let now = Date.now();
        if (!this.m_owner.BODY_LIMIT || now - this.m_owner.BODY_LIMIT_CALC_TIME > 600000) {
            let emptyPiecePkg = this.packageFactory.createPackage(DHTCommandType.PACKAGE_PIECE_REQ);
            emptyPiecePkg.body = {
                taskid: TaskConfig.MaxTaskID,
                max: 0xFFFFFFFF,
                no: 0xFFFFFFFF,
                buf: Buffer.allocUnsafe(0),
            }

            let peerStruct = this.bucket.localPeer.toStructForPackage();

            if (!this.m_peer.hash) {
                this.m_peer.hash = HashDistance.hash(this.m_peer.peerid);
            }
            let destInfo = {
                peerid: this.m_peer.peerid,
                hash: this.m_peer.hash,
                ep: '',
            };
            emptyPiecePkg.fillCommon(peerStruct, destInfo);

            let encoder = DHTPackageFactory.createEncoder(emptyPiecePkg);
            let pkgBuffer = encoder.encode();

            const MAX_EP_STRING_LENGTH = 46 + 5; // @IPV6@PORT
            let emptyPiecePkgLength = pkgBuffer.length + MAX_EP_STRING_LENGTH;
            this.m_owner.BODY_LIMIT = DHTPackageFactory.PACKAGE_LIMIT - emptyPiecePkgLength;
            this.m_owner.BODY_LIMIT_CALC_TIME = now;
        }
        return this.m_owner.BODY_LIMIT;
    }
}

module.exports = SplitPackageTask;