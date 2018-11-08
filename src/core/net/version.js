"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const error_code_1 = require("../error_code");
let MAIN_VERSION = '1.2.3.4';
class Version {
    constructor() {
        this.m_genesis = '';
        this.m_mainVersion = MAIN_VERSION;
        this.m_timestamp = Date.now();
        this.m_peerid = '';
        this.m_random = 1000000 * Math.random();
    }
    compare(other) {
        if (this.m_timestamp > other.m_timestamp) {
            return 1;
        }
        else if (this.m_timestamp < other.m_timestamp) {
            return -1;
        }
        if (this.m_random > other.m_random) {
            return 1;
        }
        else if (this.m_random > other.m_random) {
            return -1;
        }
        return 0;
    }
    set mainversion(v) {
        this.m_mainVersion = v;
    }
    get mainversion() {
        return this.m_mainVersion;
    }
    get timestamp() {
        return this.m_timestamp;
    }
    set genesis(genesis) {
        this.m_genesis = genesis;
    }
    get genesis() {
        return this.m_genesis;
    }
    set peerid(p) {
        this.m_peerid = p;
    }
    get peerid() {
        return this.m_peerid;
    }
    decode(reader) {
        try {
            this.m_timestamp = reader.readU64();
            this.m_peerid = reader.readVarString();
            this.m_genesis = reader.readVarString();
            this.m_mainVersion = reader.readVarString();
        }
        catch (e) {
            return error_code_1.ErrorCode.RESULT_INVALID_FORMAT;
        }
        return error_code_1.ErrorCode.RESULT_OK;
    }
    encode(writer) {
        try {
            writer.writeU64(this.m_timestamp);
            writer.writeVarString(this.m_peerid);
            writer.writeVarString(this.m_genesis);
            writer.writeVarString(this.m_mainVersion);
        }
        catch (e) {
            return error_code_1.ErrorCode.RESULT_INVALID_FORMAT;
        }
        return error_code_1.ErrorCode.RESULT_OK;
    }
    isSupport() {
        return true;
    }
}
exports.Version = Version;
