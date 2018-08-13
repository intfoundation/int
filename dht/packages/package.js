'use strict';

const Base = require('../../base/base.js');
const msgpack = require('msgpack-lite');

const LOG_INFO = Base.BX_INFO;
const LOG_WARN = Base.BX_WARN;
const LOG_DEBUG = Base.BX_DEBUG;
const LOG_CHECK = Base.BX_CHECK;
const LOG_ASSERT = Base.BX_ASSERT;
const LOG_ERROR = Base.BX_ERROR;

const HEADER_LENGTH = 36;

const CommandType = {
    FIND_PEER_REQ: 0x51,
    FIND_PEER_RESP: 0x52,
    UPDATE_VALUE_REQ: 0x53,
    UPDATE_VALUE_RESP: 0x54,
    FIND_VALUE_REQ: 0x55,
    FIND_VALUE_RESP: 0x56,
    PING_REQ: 0x57,
    PING_RESP: 0x58,
    HANDSHAKE_REQ: 0x59,
    HANDSHAKE_RESP: 0x5A,
    HOLE_CALL_REQ: 0x5B,
    HOLE_CALL_RESP: 0x5C,
    HOLE_CALLED_REQ: 0x5D,
    HOLE_CALLED_RESP: 0x5E,
    BROADCAST_EVENT_REQ: 0x5F,
    BROADCAST_EVENT_RESP: 0x60,
    PACKAGE_PIECE_REQ: 0x61,
    PACKAGE_PIECE_RESP: 0x62,
    COMBINE_PACKAGE: 0x63,

    isResp(cmdType) {
        return !(cmdType & 0x1);
    },

    isValid(cmdType) {
        return cmdType >= CommandType.FIND_PEER_REQ && cmdType <= CommandType.COMBINE_PACKAGE;
    },

    toString(cmdType) {
        switch (cmdType) {
            case CommandType.FIND_PEER_REQ:
                return 'DHTCMD:FIND_PEER_REQ';
            case CommandType.FIND_PEER_RESP:
                return 'DHTCMD:FIND_PEER_RESP';
            case CommandType.UPDATE_VALUE_REQ:
                return 'DHTCMD:UPDATE_VALUE_REQ';
            case CommandType.UPDATE_VALUE_RESP:
                return 'DHTCMD:UPDATE_VALUE_RESP';
            case CommandType.FIND_VALUE_REQ:
                return 'DHTCMD:FIND_VALUE_REQ';
            case CommandType.FIND_VALUE_RESP:
                return 'DHTCMD:FIND_VALUE_RESP';
            case CommandType.PING_REQ:
                return 'DHTCMD:PING_REQ';
            case CommandType.PING_RESP:
                return 'DHTCMD:PING_RESP';
            case CommandType.HANDSHAKE_REQ:
                return 'DHTCMD:HANDSHAKE_REQ';
            case CommandType.HANDSHAKE_RESP:
                return 'DHTCMD:HANDSHAKE_RESP';
            case CommandType.HOLE_CALL_REQ:
                return 'DHTCMD:HOLE_CALL_REQ';
            case CommandType.HOLE_CALL_RESP:
                return 'DHTCMD:HOLE_CALL_RESP';
            case CommandType.HOLE_CALLED_REQ:
                return 'DHTCMD:HOLE_CALLED_REQ';
            case CommandType.HOLE_CALLED_RESP:
                return 'DHTCMD:HOLE_CALLED_RESP';
            case CommandType.BROADCAST_EVENT_REQ:
                return 'DHTCMD:BROADCAST_EVENT_REQ';
            case CommandType.BROADCAST_EVENT_RESP:
                return 'DHTCMD:BROADCAST_EVENT_RESP';
            case CommandType.COMBINE_PACKAGE:
                return 'DHTCMD:COMBINE_PACKAGE';
            case CommandType.PACKAGE_PIECE_REQ:
                return 'DHTCMD:PACKAGE_PIECE_REQ';
            case CommandType.PACKAGE_PIECE_RESP:
                return 'DHTCMD:PACKAGE_PIECE_RESP';
            default:
                return `DHTCMD:Unknown_${cmdType}`;
        }
    },
}

class DHTPackage {
    constructor(cmdType, seq, appid) {
        this.m_common = {
            'cmdType': cmdType,
            'appid': appid || 0,
            'src': {
                'hash': undefined,
                'peerid': undefined,
                'eplist': null,
                'services': null,
                'additionalInfo': null,
            },
            'dest': {
                'hash': undefined,
                'peerid': undefined,
                'ep': null,
            },
            'seq': seq || 0,
            'ackSeq': 0,
            'ttl': 0,
            'nodes': null,
        };

        this.m_body = null;
    }

    get appid() {
        return this.m_common.appid;
    }
    
    get cmdType() {
        return this.m_common.cmdType;
    }

    fillCommon(srcPeerInfo, destPeerInfo, recommandNodes = null) {
        this.m_common.src.peerid = srcPeerInfo.peerid;
        this.m_common.src.eplist = srcPeerInfo.eplist;
        this.m_common.src.services = srcPeerInfo.services;
        this.m_common.src.additionalInfo = srcPeerInfo.additionalInfo;
        this.m_common.src.hash = srcPeerInfo.hash;
        this.m_common.src.onlineDuration = srcPeerInfo.onlineDuration;
        this.m_common.src.natType = srcPeerInfo.natType;
        this.m_common.dest.peerid = destPeerInfo.peerid;
        this.m_common.dest.hash = destPeerInfo.hash;
        this.m_common.dest.ep = destPeerInfo.ep;
        if (recommandNodes && recommandNodes.length > 0) {
            this.m_common.nodes = recommandNodes;
        }
    }

    get common() {
        return this.m_common;
    }

    get body() {
        return this.m_body;
    }

    set body(newValue) {
        this.m_body = newValue;
    }

    get src() {
        return this.m_common.src;
    }

    get dest() {
        return this.m_common.dest;
    }

    get servicePath() {
        if (this.m_body) {
            return this.m_body.servicePath;
        }
        return undefined;
    }

    get nodes() {
        return this.m_common.nodes;
    }

    set nodes(newValue) {
        this.m_common.nodes = newValue;
    }

    decodeBody(bodyBuffer) {
        if (bodyBuffer.length > 0) {
            this.m_body = msgpack.decode(bodyBuffer);
        } else {
            this.m_body = {};
        }
        this._fillDefaultBodyField();
        return this.m_body;
    }

    checkCommon() {
        LOG_ASSERT(this.m_common.src.hash && typeof this.m_common.src.hash === 'number',
            `Package(${CommandType.toString(this.m_common.cmdType)}) field(src.hash:number) not filled.`);
        LOG_ASSERT(this.m_common.dest.hash && typeof this.m_common.dest.hash === 'number',
            `Package(${CommandType.toString(this.m_common.cmdType)}) field(dest.hash:number) not filled.`);
            
        if (this.m_common.cmdType !== CommandType.PACKAGE_PIECE_REQ) {
            LOG_ASSERT(this.m_common.src.peerid && typeof this.m_common.src.peerid === 'string',
                `Package(${CommandType.toString(this.m_common.cmdType)}) field(src.peerid:string) not filled.`);
            LOG_ASSERT(this.m_common.dest.peerid && typeof this.m_common.dest.peerid === 'string',
                `Package(${CommandType.toString(this.m_common.cmdType)}) field(dest.peerid:string) not filled.`);
            if (CommandType.isResp(this.m_common.cmdType)) {
                LOG_ASSERT(typeof this.m_common.ackSeq === 'number' && this.m_common.ackSeq > 0,
                    `Package(${CommandType.toString(this.m_common.cmdType)}) field(ackSeq:number) not filled.`);
            }

            if (this.m_common.nodes) {
                for (let peer of this.m_common.nodes) {
                    this._checkPeer(peer);
                }
            }
        }
    }

    checkBody() {
    }

    checkAllField() {
        this.checkCommon();
        this.checkBody();
    }

    _checkPeer(peer) {
        LOG_ASSERT(peer.id && typeof peer.id === 'string' && peer.id.length > 0,
            `Package(${CommandType.toString(this.m_common.cmdType)}) field(peer.id:string) not filled.`);
        LOG_ASSERT(peer.eplist && typeof peer.eplist === 'object' && typeof peer.eplist[0] === 'string',
            `Package(${CommandType.toString(this.m_common.cmdType)}) field(peer.eplist:array[string]) not filled.`);
    }

    _fillDefaultBodyField() {

    }
}

DHTPackage.HEADER_LENGTH = HEADER_LENGTH;

DHTPackage.CommandType = CommandType;
module.exports = DHTPackage;