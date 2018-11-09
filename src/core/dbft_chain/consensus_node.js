"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const events_1 = require("events");
const assert = require('assert');
const error_code_1 = require("../error_code");
const writer_1 = require("../lib/writer");
const chain_1 = require("../chain");
const block_1 = require("./block");
const context_1 = require("./context");
const reader_1 = require("../lib/reader");
const libAddress = require("../address");
const digest = require('../lib/digest');
var DBFT_SYNC_CMD_TYPE;
(function (DBFT_SYNC_CMD_TYPE) {
    DBFT_SYNC_CMD_TYPE[DBFT_SYNC_CMD_TYPE["prepareRequest"] = 23] = "prepareRequest";
    DBFT_SYNC_CMD_TYPE[DBFT_SYNC_CMD_TYPE["prepareResponse"] = 24] = "prepareResponse";
    DBFT_SYNC_CMD_TYPE[DBFT_SYNC_CMD_TYPE["changeview"] = 25] = "changeview";
    DBFT_SYNC_CMD_TYPE[DBFT_SYNC_CMD_TYPE["end"] = 26] = "end";
})(DBFT_SYNC_CMD_TYPE = exports.DBFT_SYNC_CMD_TYPE || (exports.DBFT_SYNC_CMD_TYPE = {}));
var ConsensusState;
(function (ConsensusState) {
    ConsensusState[ConsensusState["none"] = 0] = "none";
    ConsensusState[ConsensusState["waitingCreate"] = 1] = "waitingCreate";
    ConsensusState[ConsensusState["waitingProposal"] = 2] = "waitingProposal";
    ConsensusState[ConsensusState["waitingVerify"] = 3] = "waitingVerify";
    ConsensusState[ConsensusState["waitingAgree"] = 4] = "waitingAgree";
    ConsensusState[ConsensusState["waitingBlock"] = 5] = "waitingBlock";
    ConsensusState[ConsensusState["changeViewSent"] = 10] = "changeViewSent";
    ConsensusState[ConsensusState["changeViewSucc"] = 11] = "changeViewSucc";
})(ConsensusState || (ConsensusState = {}));
class DbftConsensusNode extends events_1.EventEmitter {
    constructor(options) {
        super();
        this.m_changeView = new Map();
        this.m_currView = 0;
        this.m_network = options.network;
        this.m_globalOptions = options.globalOptions;
        this.m_state = ConsensusState.none;
        this.m_secret = options.secret;
        this.m_address = libAddress.addressFromSecretKey(this.m_secret);
        this.m_pubkey = libAddress.publicKeyFromSecretKey(this.m_secret);
        let initBound = (conns) => {
            for (let conn of conns) {
                this._beginSyncWithNode(conn);
            }
        };
        let connOut = this.m_network.node.getOutbounds();
        initBound(connOut);
        let connIn = this.m_network.node.getInbounds();
        initBound(connIn);
        this.m_network.on('inbound', (conn) => {
            this._beginSyncWithNode(conn);
        });
        this.m_network.on('outbound', (conn) => {
            this._beginSyncWithNode(conn);
        });
    }
    on(event, listener) {
        return super.on(event, listener);
    }
    once(event, listener) {
        return super.once(event, listener);
    }
    get base() {
        return this.m_network;
    }
    get logger() {
        return this.m_network.logger;
    }
    async init() {
        // await this.m_node.init();
        let hr = await this.m_network.headerStorage.getHeader(0);
        if (hr.err) {
            this.logger.error(`dbft consensus node init failed for ${hr.err}`);
            return hr.err;
        }
        this.m_genesisTime = hr.header.timestamp;
        // let err = await this.m_node.initialOutbounds();
        // if (err) {
        //     this.logger.error(`dbft consensus node init failed for ${err}`);
        //     return err;
        // }
        return error_code_1.ErrorCode.RESULT_OK;
    }
    _cancel() {
        this.m_state = ConsensusState.none;
        this.m_context = undefined;
        this.m_changeView = new Map();
        this.m_currView = 0;
        this._resetTimer();
    }
    updateTip(header, nextMiners, totalView) {
        // TODO: 这里还需要比较两个header 的work，只有大的时候覆盖
        if (this.m_tip) {
            this.logger.info(`updateTip this.m_state=${this.m_state} totalView=${totalView} header_number=${header.number},${this.m_tip.header.hash} ${header.hash}`);
        }
        else {
            this.logger.info(`updateTip this.m_state=${this.m_state} ${totalView}`);
        }
        if (!this.m_tip || this.m_tip.header.hash !== header.hash) {
            this.m_tip = {
                header,
                nextMiners,
                totalView
            };
            if (this.m_state !== ConsensusState.none) {
                // this.logger.warn(`dbft conensus update tip when in consensus `, this.m_context!);
                this._cancel();
            }
            else {
                this._resetTimer();
            }
            this.m_network.setValidators(nextMiners);
        }
    }
    async agreeProposal(block) {
        if (this.m_state !== ConsensusState.waitingVerify) {
            this.logger.warn(`skip agreeProposal in state `, this.m_state);
            return error_code_1.ErrorCode.RESULT_SKIPPED;
        }
        let curContext = this.m_context;
        assert(curContext && curContext.block);
        if (!curContext || !curContext.block) {
            this.logger.error(`agreeProposal in invalid context `, curContext);
            return error_code_1.ErrorCode.RESULT_SKIPPED;
        }
        if (!this.m_tip.header.isPreBlock(block.header)) {
            this.logger.error(`agreeProposal block ${block.header.hash} ${block.number} in invalid context block ${this.m_tip.header.hash} ${this.m_tip.header.number}`);
            return error_code_1.ErrorCode.RESULT_SKIPPED;
        }
        this.m_state = ConsensusState.waitingAgree;
        let newContext = {
            curView: curContext.curView,
            block,
            signs: new Map()
        };
        // 可能已经收到了其他节点的验证信息
        for (let [k, v] of curContext.preSigns) {
            if (v.hash === block.hash) {
                newContext.signs.set(k, v.signInfo);
            }
        }
        this.m_context = newContext;
        const sign = libAddress.sign(block.hash, this.m_secret);
        this._sendPrepareResponse(block, sign);
        this._onPrepareResponse({ hash: block.hash, pubkey: this.m_pubkey, sign });
        return error_code_1.ErrorCode.RESULT_OK;
    }
    async newProposal(block) {
        assert(this.m_tip);
        if (!this.m_tip) {
            return error_code_1.ErrorCode.RESULT_SKIPPED;
        }
        if (this.m_state !== ConsensusState.waitingProposal) {
            this.logger.warn(`dbft conensus newProposal ${block.header.hash}  ${block.header.number} while not in blockCreated state`);
            return error_code_1.ErrorCode.RESULT_SKIPPED;
        }
        if (!this.m_tip.header.isPreBlock(block.header)) {
            this.logger.warn(`dbft conensus newProposal ${block.header.hash}  ${block.header.number} while in another context ${this.m_tip.header.hash} ${this.m_tip.header.number}`);
            return error_code_1.ErrorCode.RESULT_SKIPPED;
        }
        this.logger.info(`newProposal miners=${JSON.stringify(this.m_network.getValidators())}, blockhash=${block.hash}`);
        if (this.m_network.getValidators().length > 1) {
            let i = 0;
        }
        // 先对不完整的块进行签名，保证block的正常发送
        block.header.updateContent(block.content);
        let err = block.header.signBlock(this.m_secret);
        block.header.updateHash();
        if (err) {
            return error_code_1.ErrorCode.RESULT_INVALID_BLOCK;
        }
        this._sendPrepareRequest(block);
        this.m_state = ConsensusState.waitingVerify;
        let curContext = {
            curView: this.m_currView,
            block,
            preSigns: new Map()
        };
        this.m_context = curContext;
        return error_code_1.ErrorCode.RESULT_OK;
    }
    async _resetTimer() {
        let tr = await this._nextTimeout();
        if (tr.err === error_code_1.ErrorCode.RESULT_SKIPPED) {
            return tr.err;
        }
        if (this.m_timer) {
            clearTimeout(this.m_timer);
            delete this.m_timer;
        }
        this.m_timer = setTimeout(async () => {
            delete this.m_timer;
            this._onTimeout();
            this._resetTimer();
        }, tr.timeout);
        return error_code_1.ErrorCode.RESULT_OK;
    }
    _isOneOfMiner() {
        return this.m_tip.nextMiners.indexOf(this.m_address) >= 0;
    }
    _onTimeout() {
        assert(this.m_tip);
        if (!this.m_tip) {
            this.logger.warn(`bdft consensus has no tip when time out`);
            return;
        }
        if (this.m_state === ConsensusState.waitingCreate) {
            this.m_state = ConsensusState.waitingProposal;
            let newContext = {
                curView: this.m_currView,
                preSigns: new Map()
            };
            this.m_context = newContext;
            let now = Date.now() / 1000;
            let blockHeader = new block_1.DbftBlockHeader();
            blockHeader.setPreBlock(this.m_tip.header);
            blockHeader.timestamp = now;
            blockHeader.view = this.m_currView;
            this.emit('createBlock', blockHeader);
        }
        else {
            // 超时，发起changeview
            let newView = 0;
            if (this.m_state === ConsensusState.changeViewSent) {
                newView = this.m_context.expectView + 1;
            }
            else {
                newView = this.m_currView + 1;
            }
            this.logger.debug(`${this.m_address} _onTimeout changeview ${newView}`);
            const sign = libAddress.sign(Buffer.from(digest.md5(Buffer.from(this.m_tip.header.hash + newView.toString(), 'hex')).toString('hex')), this.m_secret);
            this._sendChangeView(newView, sign);
            this.m_state = ConsensusState.changeViewSent;
            let newContext = {
                curView: this.m_currView,
                expectView: newView
            };
            this.m_context = newContext;
            this._onChangeView(newView, this.m_pubkey);
        }
    }
    async _sendPrepareRequest(block) {
        let writer = new writer_1.BufferWriter();
        let err = block.encode(writer);
        let data = writer.render();
        let pkg = chain_1.PackageStreamWriter.fromPackage(DBFT_SYNC_CMD_TYPE.prepareRequest, null, data.length).writeData(data);
        this.m_network.broadcastToValidators(pkg);
    }
    _sendPrepareResponse(block, sign) {
        let writer = new writer_1.BufferWriter();
        writer.writeBytes(this.m_pubkey);
        writer.writeBytes(sign);
        let data = writer.render();
        let pkg = chain_1.PackageStreamWriter.fromPackage(DBFT_SYNC_CMD_TYPE.prepareResponse, { hash: block.hash }, data.length).writeData(data);
        this.m_network.broadcastToValidators(pkg);
    }
    _sendChangeView(newView, sign) {
        let writer = new writer_1.BufferWriter();
        writer.writeBytes(this.m_pubkey);
        writer.writeBytes(sign);
        let data = writer.render();
        let pkg = chain_1.PackageStreamWriter.fromPackage(DBFT_SYNC_CMD_TYPE.changeview, { newView }, data.length).writeData(data);
        this.m_network.broadcastToValidators(pkg);
    }
    _beginSyncWithNode(conn) {
        conn.on('pkg', async (pkg) => {
            if (pkg.header.cmdType === DBFT_SYNC_CMD_TYPE.prepareRequest) {
                let block = this.base.newBlock();
                let reader = new reader_1.BufferReader(pkg.copyData());
                let err = block.decode(reader);
                if (err) {
                    // TODO: ban it
                    // this.base.banConnection();
                    this.logger.error(`recv invalid prepareRequest from `, conn.fullRemote);
                    return;
                }
                if (!block.header.verifySign()) {
                    // TODO: ban it
                    // this.base.banConnection();
                    this.logger.error(`recv invalid signature prepareRequest from `, conn.fullRemote);
                    return;
                }
                if (!block.verify()) {
                    // TODO: ban it
                    // this.base.banConnection();
                    this.logger.error(`recv invalid block in prepareRequest from `, conn.fullRemote);
                    return;
                }
                block.header.updateHash();
                this._onPrepareRequest({ block }, conn);
            }
            else if (pkg.header.cmdType === DBFT_SYNC_CMD_TYPE.prepareResponse) {
                const hash = pkg.body.hash;
                let reader = new reader_1.BufferReader(pkg.copyData());
                let pubkey;
                let sign;
                try {
                    pubkey = reader.readBytes(33);
                    sign = reader.readBytes(64);
                }
                catch (e) {
                    // TODO: ban it
                    // this.base.banConnection();
                    this.logger.error(`decode prepareResponse failed `, e);
                    return;
                }
                if (!libAddress.verify(hash, sign, pubkey)) {
                    // TODO: ban it
                    // this.base.banConnection();
                    this.logger.error(`prepareResponse verify sign invalid hash=${hash},pubkey=${pubkey.toString('hex')},sign=${sign.toString('hex')}`);
                    return;
                }
                if (libAddress.addressFromPublicKey(pubkey) === this.m_address) {
                    // TODO: ban it
                    // this.base.banConnection();
                    this.logger.error(`prepareResponse got my sign`);
                    return;
                }
                this._onPrepareResponse({ hash, pubkey, sign }, conn);
            }
            else if (pkg.header.cmdType === DBFT_SYNC_CMD_TYPE.changeview) {
                const newView = pkg.body.newView;
                let reader = new reader_1.BufferReader(pkg.copyData());
                let pubkey;
                let sign;
                try {
                    pubkey = reader.readBytes(33);
                    sign = reader.readBytes(64);
                }
                catch (e) {
                    // TODO: ban it
                    // this.base.banConnection();
                    this.logger.error(`decode changeView failed `, e);
                    return;
                }
                let viewBuf = Buffer.from(digest.md5(Buffer.from(this.m_tip.header.hash + newView.toString(), 'hex')).toString('hex'));
                if (!libAddress.verify(viewBuf, sign, pubkey)) {
                    // TODO: ban it
                    // this.base.banConnection();
                    this.logger.error(`changeView verify sign invalid`);
                    return;
                }
                this._onChangeView(newView, pubkey, conn);
                // this.emit('changeview', pkg.body);
            }
        });
    }
    _onChangeView(newView, pubkey, from) {
        let id = libAddress.addressFromPublicKey(pubkey);
        this.logger.info(`_onChangeView receive correct changview from ${id} newView=${newView}`);
        if (this.m_changeView.has(id)) {
            if (this.m_changeView.get(id) === newView) {
                // 多次发送同一个view的ChangeView消息，ban it ？
                return;
            }
        }
        this.m_changeView.set(id, newView);
        let viewCount = new Map();
        for (let [_key, view] of this.m_changeView) {
            viewCount.has(view) ? viewCount.set(view, viewCount.get(view) + 1) : viewCount.set(view, 1);
            if (context_1.DbftContext.isAgreeRateReached(this.m_globalOptions, this.m_tip.nextMiners.length, viewCount.get(view))) {
                this.m_changeView = new Map();
                this.m_currView = view;
                let newContext = {
                    curView: view
                };
                this.m_context = newContext;
                this.m_state = ConsensusState.changeViewSucc;
                this.logger.info(`_onChangeView enter ConsensusState.changeViewSucc view=${view}`);
                this._resetTimer();
                break;
            }
        }
    }
    _onPrepareRequest(pkg, from) {
        if (!this.m_tip) {
            this.logger.warn(`_onPrepareRequest while no tip`);
            return;
        }
        if (this.m_state === ConsensusState.waitingProposal) {
            assert(this.m_context);
            let curContext = this.m_context;
            if (!this.m_tip.header.isPreBlock(pkg.block.header)) {
                this.logger.error(`_onPrepareRequest got block ${pkg.block.header.hash} ${pkg.block.header.number} while tip is ${this.m_tip.header.hash} ${this.m_tip.header.number}`);
                return;
            }
            let header = pkg.block.header;
            if (curContext.curView !== header.view) {
                // 有可能漏了change view，两边view 不一致
                this.logger.error(`_onPrepareRequest got block ${header.hash} ${header.number} ${header.view} while cur view is ${curContext.curView}`);
                return;
            }
            let due = context_1.DbftContext.getDueNextMiner(this.m_globalOptions, this.m_tip.header, this.m_tip.nextMiners, curContext.curView);
            if (header.miner !== due) {
                // TODO: ban it
                // this.base.banConnection();
                this.logger.error(`_onPrepareRequest recv prepareRequest's block ${pkg.block.header.hash} number=${pkg.block.header.number} miner=${header.miner},pubkey=${header.pubkey.toString('hex')} not match due miner ${due}`);
                return;
            }
            this.m_state = ConsensusState.waitingVerify;
            let newContext = {
                curView: curContext.curView,
                block: pkg.block,
                preSigns: curContext.preSigns
            };
            this.m_context = newContext;
            this.logger.info(`_onPrepareRequest, bdft consensus enter waitingVerify ${header.hash} ${header.number}`);
            this.emit('verifyBlock', pkg.block);
        }
        else {
            // 其他状态都忽略
            this.logger.warn(`_onPrepareRequest in invalid state `, this.m_state);
        }
    }
    _onPrepareResponse(pkg, from) {
        if (!this.m_tip) {
            this.logger.warn(`_onPrepareResponse while no tip`);
            return;
        }
        if (this.m_state !== ConsensusState.waitingAgree
            && this.m_state !== ConsensusState.waitingProposal
            && this.m_state !== ConsensusState.waitingVerify) {
            this.logger.info(`_onPrepareResponse in invalid state `, this.m_state);
            return;
        }
        assert(this.m_context);
        const address = libAddress.addressFromPublicKey(pkg.pubkey);
        if (this.m_tip.nextMiners.indexOf(address) < 0) {
            this.logger.warn(`_onPrepareResponse got ${address} 's sign not in next miners`);
            return;
        }
        if (this.m_state !== ConsensusState.waitingAgree) {
            let curContext = this.m_context;
            if (curContext.preSigns.has(address)) {
                this.logger.warn(`_onPrepareResponse {not ConsensusState.waitingProposal} got ${address} 's duplicated sign`);
                return;
            }
            curContext.preSigns.set(address, { hash: pkg.hash, signInfo: { pubkey: pkg.pubkey, sign: pkg.sign } });
            this.logger.info(`_onPrepareResponse {not ConsensusState.waitingProposal} receive correct signed prepare response from ${address} hash=${pkg.hash}`);
        }
        else {
            let curContext = this.m_context;
            if (curContext.block.hash !== pkg.hash) {
                this.logger.warn(`_onPrepareResponse got ${pkg.hash} while waiting ${curContext.block.hash}`);
                return;
            }
            if (curContext.signs.has(address)) {
                this.logger.warn(`_onPrepareResponse got ${address} 's duplicated sign`);
                return;
            }
            this.logger.info(`_onPrepareResponse receive correct signed prepare response from ${address} hash=${pkg.hash}`);
            curContext.signs.set(address, { pubkey: pkg.pubkey, sign: pkg.sign });
            if (context_1.DbftContext.isAgreeRateReached(this.m_globalOptions, this.m_tip.nextMiners.length, curContext.signs.size)) {
                this.logger.info(`_onPrepareResponse bdft consensus node enter state waitingBlock miners=${this.m_tip.nextMiners.length}, ${curContext.block.hash} ${curContext.block.number}`);
                this.m_state = ConsensusState.waitingBlock;
                let signs = [];
                for (let s of curContext.signs.values()) {
                    signs.push(s);
                }
                this.emit('mineBlock', curContext.block, signs);
            }
        }
    }
    async _nextTimeout() {
        if (!this.m_tip) {
            return { err: error_code_1.ErrorCode.RESULT_SKIPPED };
        }
        if (!this._isOneOfMiner()) {
            return { err: error_code_1.ErrorCode.RESULT_SKIPPED };
        }
        // view=0  非miner timeout=base+ 2^1；miner timeout=base+2^0
        // view=1  非miner timeout=base+ 2^1+2^2；miner timeout=base+2^0+2^1
        // view=2  非miner timeout=base+ 2^1+2^2+2^3；miner timeout=base+2^0+2^1+2^2
        // view=n  非miner timeout=base+ 2^1+2^2+2^3+...+2^(n+1)次方；miner timeout=base+2^0+2^1+2^2+...+2^n
        // 非miner: 2^1+2^2+...+2^n = 2^(n+2)-2^1   miner: 2^0+2^1+2^2+...+2^n = 2^(n+1)-2^0
        while (true) {
            let due = context_1.DbftContext.getDueNextMiner(this.m_globalOptions, this.m_tip.header, this.m_tip.nextMiners, this.m_currView);
            if (this.m_state === ConsensusState.none || this.m_state === ConsensusState.changeViewSucc) {
                if (this.m_address === due) {
                    this.m_state = ConsensusState.waitingCreate;
                    let newContext = {
                        curView: this.m_currView
                    };
                    this.m_context = newContext;
                    this.logger.debug(`bdft consensus enter waitingCreate ,due=${due},tipnumber=${this.m_tip.header.number}`);
                }
                else {
                    this.m_state = ConsensusState.waitingProposal;
                    let newContext = {
                        curView: this.m_currView,
                        preSigns: new Map()
                    };
                    this.m_context = newContext;
                    this.logger.debug(`bdft consensus enter waitingProposal ,due=${due},tipnumber=${this.m_tip.header.number}`);
                }
            }
            let blockInterval = this.m_globalOptions.blockInterval;
            let intervalCount = this.m_tip.totalView;
            let contextView = 0;
            if (this.m_context) {
                contextView = this.m_context.curView;
            }
            if (due === this.m_address) {
                if (this.m_state === ConsensusState.waitingCreate) {
                    intervalCount += Math.pow(2, contextView + 1) - 1;
                }
                else {
                    // miner此时和非miner在同一个时刻触发timeout
                    intervalCount += Math.pow(2, contextView + 2) - 2;
                }
            }
            else {
                intervalCount += Math.pow(2, contextView + 2) - 2;
            }
            let nextTime = this.m_genesisTime + intervalCount * blockInterval;
            let now = Date.now() / 1000;
            if (nextTime > now) {
                this.logger.info(`_nextTimeout intervalCount=${intervalCount},totalView=${this.m_tip.totalView},contextView=${contextView},due=${due},tipnumber=${this.m_tip.header.number},timeout=${(nextTime - now) * 1000}`);
                return { err: error_code_1.ErrorCode.RESULT_OK, timeout: (nextTime - now) * 1000 };
            }
            else {
                // this.logger.debug(`_nextTimeout RESULT_SKIPPED intervalCount=${intervalCount},totalView=${this.m_tip.totalView},contextView=${contextView},due=${due},tipnumber=${this.m_tip.header.number},nextTime=${nextTime}, now=${now}`);
                // return {err: ErrorCode.RESULT_SKIPPED};
                this.logger.debug(`_nextTimeout RESULT_SKIPPED`);
                this.m_currView++;
                this.m_state = ConsensusState.none;
            }
        }
    }
}
exports.DbftConsensusNode = DbftConsensusNode;
