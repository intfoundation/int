"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const error_code_1 = require("../error_code");
const path = require("path");
const fs = require("fs-extra");
class NodeStorage {
    constructor(options) {
        this.m_nodes = [];
        this.m_banNodes = [];
        this.m_bFlush = false;
        this.m_staticNodes = [];
        this.m_file = path.join(options.dataDir, 'nodeinfo');
        this.m_logger = options.logger;
        try {
            fs.ensureDirSync(options.dataDir);
            if (fs.existsSync(this.m_file)) {
                let json = fs.readJsonSync(this.m_file);
                this.m_nodes = json['nodes'] ? json['nodes'] : [];
                this.m_banNodes = json['bans'] ? json['bans'] : [];
            }
        }
        catch (e) {
            this.m_logger.error(`[node_storage NodeStorage constructor] ${e.toString()}`);
        }
        // 在这里读一次staticnodes
        const staticFile = path.join(options.dataDir, 'staticnodes');
        if (fs.pathExistsSync(staticFile)) {
            this.m_staticNodes = fs.readJSONSync(staticFile);
        }
        setInterval(() => {
            this.flush();
        }, 60 * 1000);
    }
    get(arg) {
        let count = 0;
        if (arg === 'all') {
            count = this.m_nodes.length;
        }
        else {
            count = count > this.m_nodes.length ? this.m_nodes.length : arg;
        }
        let peerids = this.m_nodes.slice(0, count);
        return peerids;
    }
    get staticNodes() {
        return this.m_staticNodes;
    }
    add(peerid) {
        let nIndex = this.getIndex(peerid);
        if (nIndex !== -1) {
            this.m_nodes.splice(nIndex, 1);
        }
        this.m_nodes.splice(0, 0, peerid);
        this.m_bFlush = true;
        return error_code_1.ErrorCode.RESULT_OK;
    }
    remove(peerid) {
        let nIndex = this.getIndex(peerid);
        if (nIndex === -1) {
            return error_code_1.ErrorCode.RESULT_NOT_FOUND;
        }
        this.m_nodes.splice(nIndex, 1);
        this.m_bFlush = true;
        return error_code_1.ErrorCode.RESULT_OK;
    }
    // time的单位为分钟
    ban(peerid, time) {
        let nIndex = this.getIndex(peerid);
        if (nIndex !== -1) {
            this.m_nodes.splice(nIndex, 1);
        }
        nIndex = this.getBanIndex(peerid);
        if (nIndex !== -1) {
            this.m_banNodes.splice(nIndex, 1);
        }
        let info = { peerid, endtime: time === 0 ? 0 : Date.now() + time * 60 * 1000 };
        let pos = 0;
        for (let i = 0; i < this.m_banNodes.length; i++) {
            pos++;
            if (info.endtime <= this.m_banNodes[i].endtime) {
                break;
            }
        }
        this.m_banNodes.splice(pos, 0, info);
        this.m_bFlush = true;
        return error_code_1.ErrorCode.RESULT_OK;
    }
    isBan(peerid) {
        let nIndex = this.getBanIndex(peerid);
        if (nIndex === -1) {
            return false;
        }
        if (this.m_banNodes[nIndex].endtime === 0) {
            return true;
        }
        if (Date.now() >= this.m_banNodes[nIndex].endtime) {
            this.m_banNodes.splice(nIndex, 1);
            this.m_bFlush = true;
            return true;
        }
        return false;
    }
    getIndex(peerid) {
        for (let i = 0; i < this.m_nodes.length; i++) {
            if (this.m_nodes[i] === peerid) {
                return i;
            }
        }
        return -1;
    }
    getBanIndex(peerid) {
        for (let i = 0; i < this.m_banNodes.length; i++) {
            if (this.m_banNodes[i].peerid === peerid) {
                return i;
            }
        }
        return -1;
    }
    flush() {
        if (!this.m_bFlush) {
            return;
        }
        try {
            let json = {};
            json['nodes'] = this.m_nodes;
            json['bans'] = this.m_banNodes;
            fs.writeJsonSync(this.m_file, json);
            this.m_bFlush = false;
        }
        catch (e) {
            this.m_logger.error(`[node_storage NodeStorage flush] ${e.toString()}`);
        }
    }
}
exports.NodeStorage = NodeStorage;
