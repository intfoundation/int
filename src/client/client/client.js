"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const events_1 = require("events");
const rpc_1 = require("./rpc");
class ChainClient extends rpc_1.HostClient {
    constructor(options) {
        super(options);
        this.m_emitter = new events_1.EventEmitter();
    }
    on(event, listener) {
        this.m_emitter.on(event, listener);
        this._beginWatchTipBlock();
        return this;
    }
    once(event, listener) {
        this.m_emitter.once(event, listener);
        this._beginWatchTipBlock();
        return this;
    }
    async _beginWatchTipBlock() {
        if (this.m_tipBlockTimer) {
            return;
        }
        this.m_tipBlockTimer = setInterval(async () => {
            let { err, block } = await this.getBlock({ which: 'latest' });
            if (block) {
                if (!this.m_tipBlock || this.m_tipBlock.hash !== block.hash) {
                    this.m_tipBlock = block;
                    this.m_emitter.emit('tipBlock', this.m_tipBlock);
                    if (!this.m_emitter.listenerCount('tipBlock')) {
                        clearInterval(this.m_tipBlockTimer);
                        delete this.m_tipBlockTimer;
                    }
                }
            }
            // TODO: set block interval 
        }, 10000);
    }
}
exports.ChainClient = ChainClient;
