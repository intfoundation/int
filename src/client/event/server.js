"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("../../core");
const storage_1 = require("./storage");
const util_1 = require("util");
const path = require("path");
class ChainEventServer {
    constructor(options) {
        this.m_syncing = false;
        this.m_chain = options.chain;
        this.m_logger = options.chain.logger;
        const dbPath = path.join(this.m_chain.dataDir, 'events');
        this.m_storage = new storage_1.ChainEventStorage({
            logger: this.m_logger,
            dbPath,
            eventDefinations: options.chain.handler.getEventDefinations()
        });
    }
    async init(options) {
        const readonly = util_1.isNullOrUndefined(options.readonly) ? false : options.readonly;
        const sir = await this.m_storage.init({
            readonly
        });
        if (readonly || (sir.err && sir.err !== core_1.ErrorCode.RESULT_NOT_FOUND)) {
            return sir.err;
        }
        if (sir.err === core_1.ErrorCode.RESULT_NOT_FOUND) {
            const ghr = await this.m_chain.getHeader(0);
            if (ghr.err) {
                this.m_logger.error(`event server init failed for get genesis header failed ${core_1.stringifyErrorCode(ghr.err)}`);
                return ghr.err;
            }
            const genesis = await this.m_chain.getBlock(ghr.header.hash);
            if (!genesis) {
                this.m_logger.error(`event server init failed for get genesis failed`);
                return core_1.ErrorCode.RESULT_EXCEPTION;
            }
            let err = await this.m_storage.addBlock(genesis);
            if (err) {
                this.m_logger.error(`event server init failed for add genesis to storage failed ${core_1.stringifyErrorCode(err)}`);
                return err;
            }
        }
        this._syncEvents();
        this.m_chain.on('tipBlock', () => {
            this._syncEvents();
        });
        return core_1.ErrorCode.RESULT_OK;
    }
    async _syncEvents() {
        if (this.m_syncing) {
            return;
        }
        this.m_syncing = true;
        this.m_logger.info(`begin sync events`);
        while (true) {
            const lbr = await this.m_storage.getLatestBlock();
            if (lbr.err) {
                this.m_logger.error(`event server sync failed for get latest block from storage ${core_1.stringifyErrorCode(lbr.err)}`);
                break;
            }
            const ghr = await this.m_chain.getHeader(lbr.latest.number + 1);
            if (ghr.err) {
                if (ghr.err === core_1.ErrorCode.RESULT_NOT_FOUND) {
                    this.m_logger.info(`event server sync ignored for no more block`);
                }
                else {
                    this.m_logger.error(`event server sync failed for get header from chain ${core_1.stringifyErrorCode(ghr.err)}`);
                }
                break;
            }
            if (ghr.header.preBlockHash === lbr.latest.hash) {
                const block = await this.m_chain.getBlock(ghr.header.hash);
                if (!block) {
                    this.m_logger.error(`event server sync for get block ${ghr.header.hash} failed`);
                    break;
                }
                this.m_logger.info(`begin add events block ${block.number} ${block.hash}`);
                let err = await this.m_storage.addBlock(block);
                if (err) {
                    this.m_logger.error(`event server sync failed for add block ${block.hash} to storage failed ${core_1.stringifyErrorCode(err)}`);
                    break;
                }
            }
            else {
                let _ghr = await this.m_chain.getHeader(lbr.latest.hash);
                if (_ghr.err) {
                    this.m_logger.error(`event server sync failed for get header ${lbr.latest.hash} from chain failed ${core_1.stringifyErrorCode(_ghr.err)}`);
                    break;
                }
                let forkFrom = _ghr.header;
                let _err = core_1.ErrorCode.RESULT_OK;
                while (true) {
                    _ghr = await this.m_chain.getHeader(forkFrom.number - 1);
                    if (_ghr.err) {
                        this.m_logger.error(`event server sync failed for get header ${forkFrom.number - 1} from chain failed ${core_1.stringifyErrorCode(_ghr.err)}`);
                        _err = _ghr.err;
                        break;
                    }
                    if (_ghr.header.hash === forkFrom.preBlockHash) {
                        break;
                    }
                    forkFrom = _ghr.header;
                }
                if (_err) {
                    break;
                }
                _err = await this.m_storage.revertToBlock(forkFrom.number - 1);
                if (_err) {
                    break;
                }
            }
        }
        this.m_logger.info(`finish sync events`);
        this.m_syncing = false;
    }
    async getEventByStub(block, stub) {
        let ghr;
        if (util_1.isString(block)) {
            ghr = await this.m_chain.getHeader(block);
        }
        else if (util_1.isObject(block)) {
            ghr = await this.m_chain.getHeader(block.from, block.offset);
        }
        else {
            return { err: core_1.ErrorCode.RESULT_INVALID_PARAM };
        }
        if (ghr.err) {
            this.m_logger.error(`get event by stub failed for get headers failed `, core_1.stringifyErrorCode(ghr.err));
            return { err: ghr.err };
        }
        let blocks = [];
        for (const header of ghr.headers) {
            let _block = this.m_chain.getBlock(header.hash);
            if (!_block) {
                this.m_logger.error(`get event by stub failed for block ${header.hash} missing`);
                return { err: core_1.ErrorCode.RESULT_INVALID_BLOCK };
            }
            blocks.push(_block);
        }
        const ger = await this.m_storage.getEvents({ blocks: blocks.map((_block) => _block.hash), querySql: stub.querySql });
        if (ger.err) {
            this.m_logger.error(`get event by stub failed for storage err `, core_1.stringifyErrorCode(ger.err));
            return { err: ger.err };
        }
        let events = [];
        for (const _block of blocks) {
            if (ger.events.has(_block.hash)) {
                const blockEvents = _block.content.eventLogs;
                const indices = ger.events.get(_block.hash);
                let eventLogs = [];
                for (const index of indices) {
                    eventLogs.push(blockEvents[index]);
                }
                events.push({ blockHash: _block.hash, blockNumber: _block.number, eventLogs });
            }
        }
        return { err: core_1.ErrorCode.RESULT_OK, events };
    }
}
exports.ChainEventServer = ChainEventServer;
