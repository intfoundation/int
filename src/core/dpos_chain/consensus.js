"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const util_1 = require("util");
const error_code_1 = require("../error_code");
const bignumber_js_1 = require("bignumber.js");
const assert = require("assert");
// DPOS的节点会定时出块，如果时间间隔已到，指定节点还未出块的话，就跳过这个节点，下一个节点出块
// 出块间隔时间必须远小于创建并广播块到所有DPOS出块节点的时间
// 所有time单位均为seconds
// 出块间隔时间
// export const blockInterval = 10
// 出块间隔允许的最大误差
// export const maxBlockIntervalOffset = 1
// //重新选举的块时间，暂时设定成每10块选举一次
// export const reSelectionBlocks = 10
// //最大出块者总数，先定成21
// export const maxCreator = 21;
// //最小出块者总数，先定成2
// export const minCreator = 2;
// //每个节点最多可以投的producer数量
// export const dposVoteMaxProducers = 30;
// //超过该时间不出块就将被封禁
// export const timeOffsetToLastBlock = 60 * 60 * 24;
// //封禁时长
// export const timeBan = 30 * timeOffsetToLastBlock;
// //每unbanBlocks个块后进行一次解禁计算
// export const unbanBlocks = reSelectionBlocks * 2;
function onCheckGlobalOptions(globalOptions) {
    if (util_1.isNullOrUndefined(globalOptions.minCreateor)) {
        return false;
    }
    if (util_1.isNullOrUndefined(globalOptions.maxCreateor)) {
        return false;
    }
    if (util_1.isNullOrUndefined(globalOptions.reSelectionBlocks)) {
        return false;
    }
    if (util_1.isNullOrUndefined(globalOptions.blockInterval)) {
        return false;
    }
    if (util_1.isNullOrUndefined(globalOptions.timeOffsetToLastBlock)) {
        return false;
    }
    if (util_1.isNullOrUndefined(globalOptions.timeBan)) {
        return false;
    }
    if (util_1.isNullOrUndefined(globalOptions.unbanBlocks)) {
        return false;
    }
    if (util_1.isNullOrUndefined(globalOptions.dposVoteMaxProducers)) {
        return false;
    }
    if (util_1.isNullOrUndefined(globalOptions.maxBlockIntervalOffset)) {
        return false;
    }
    return true;
}
exports.onCheckGlobalOptions = onCheckGlobalOptions;
class ViewContext {
    constructor(m_database, globalOptions, logger) {
        this.m_database = m_database;
        this.globalOptions = globalOptions;
        this.logger = logger;
    }
    get database() {
        return this.m_database;
    }
    static getElectionBlockNumber(globalOptions, _number) {
        if (_number === 0) {
            return 0;
        }
        return Math.floor((_number - 1) / globalOptions.reSelectionBlocks) * globalOptions.reSelectionBlocks;
    }
    async getNextMiners() {
        let kvElectionDPOS = (await this.database.getReadableKeyValue(ViewContext.kvDPOS)).kv;
        let llr = await kvElectionDPOS.llen(ViewContext.keyNextMiners);
        if (llr.err) {
            return { err: llr.err };
        }
        let lrr = await kvElectionDPOS.lrange(ViewContext.keyNextMiners, 0, llr.value);
        if (lrr.err) {
            return { err: lrr.err };
        }
        return { err: error_code_1.ErrorCode.RESULT_OK, creators: lrr.value };
    }
    async getStoke(address) {
        let kvCurDPOS = (await this.database.getReadableKeyValue(ViewContext.kvDPOS)).kv;
        // 如果投票者的权益不够，则返回
        let her = await kvCurDPOS.hexists(ViewContext.keyStoke, address);
        if (her.err) {
            return { err: her.err };
        }
        if (!her.value) {
            return { err: error_code_1.ErrorCode.RESULT_OK, stoke: new bignumber_js_1.BigNumber(0) };
        }
        else {
            let gr = await kvCurDPOS.hget(ViewContext.keyStoke, address);
            if (gr.err) {
                return { err: gr.err };
            }
            return { err: error_code_1.ErrorCode.RESULT_OK, stoke: gr.value };
        }
    }
    async getVote() {
        let kvCurDPOS = (await this.database.getReadableKeyValue(ViewContext.kvDPOS)).kv;
        let gr = await kvCurDPOS.hgetall(ViewContext.keyVote);
        if (gr.err) {
            return { err: gr.err };
        }
        let cans = await this.getValidCandidates();
        if (cans.err) {
            return { err: cans.err };
        }
        cans.candidates.sort();
        let isValid = (s) => {
            for (let c of cans.candidates) {
                if (c === s) {
                    return true;
                }
                else if (c > s) {
                    return false;
                }
            }
            return false;
        };
        let vote = new Map();
        for (let v of gr.value) {
            if (isValid(v.key)) {
                vote.set(v.key, v.value);
            }
        }
        return { err: error_code_1.ErrorCode.RESULT_OK, vote };
    }
    async getCandidates() {
        let kvDPos = (await this.database.getReadableKeyValue(ViewContext.kvDPOS)).kv;
        let gr = await this.getValidCandidates();
        if (gr.err) {
            return { err: gr.err };
        }
        let gv = await kvDPos.hgetall(ViewContext.keyVote);
        if (gv.err) {
            return { err: gv.err };
        }
        let vote = new Map();
        for (let v of gv.value) {
            vote.set(v.key, v.value);
        }
        gr.candidates.sort((a, b) => {
            if (vote.has(a) && vote.has(b)) {
                if (vote.get(a).eq(vote.get(b))) {
                    return 0;
                }
                return vote.get(a).gt(vote.get(b)) ? -1 : 1;
            }
            if (!vote.has(a) && !vote.has(b)) {
                return 0;
            }
            if (vote.has(a)) {
                return -1;
            }
            return 1;
        });
        return { err: error_code_1.ErrorCode.RESULT_OK, candidates: gr.candidates };
    }
    async getValidCandidates() {
        let kvDPos = (await this.database.getReadableKeyValue(ViewContext.kvDPOS)).kv;
        let gr = await kvDPos.hgetall(ViewContext.keyCandidate);
        if (gr.err) {
            return { err: gr.err };
        }
        let candidates = [];
        for (let v of gr.value) {
            if (v.value === 0) {
                candidates.push(v.key);
            }
        }
        return { err: error_code_1.ErrorCode.RESULT_OK, candidates };
    }
    async isBan(address) {
        let kvDPos = (await this.database.getReadableKeyValue(ViewContext.kvDPOS)).kv;
        let timeInfo = await kvDPos.hget(ViewContext.keyCandidate, address);
        if (timeInfo.err) {
            return { err: error_code_1.ErrorCode.RESULT_OK, ban: false };
        }
        return { err: error_code_1.ErrorCode.RESULT_OK, ban: timeInfo.value === 0 ? false : true };
    }
}
ViewContext.kvDPOS = 'dpos';
ViewContext.keyCandidate = 'candidate'; // 总的候选人
ViewContext.keyVote = 'vote';
ViewContext.keyStoke = 'stoke';
ViewContext.keyNextMiners = 'miner';
// 每个代表投票的那些人
ViewContext.keyProducers = 'producers';
// 生产者最后一次出块时间
ViewContext.keyNewBlockTime = 'newblocktime';
exports.ViewContext = ViewContext;
class Context extends ViewContext {
    get database() {
        return this.m_database;
    }
    async init(candidates, miners) {
        let kvCurDPOS = (await this.database.getReadWritableKeyValue(ViewContext.kvDPOS)).kv;
        let candiateValues = candidates.map(() => {
            return 0;
        });
        let hmr = await kvCurDPOS.hmset(Context.keyCandidate, candidates, candiateValues);
        if (hmr.err) {
            return hmr;
        }
        let rpr = await kvCurDPOS.rpushx(Context.keyNextMiners, miners);
        if (rpr.err) {
            return rpr;
        }
        return { err: error_code_1.ErrorCode.RESULT_OK };
    }
    async finishElection(blockhash) {
        let kvCurDPOS = (await this.database.getReadWritableKeyValue(ViewContext.kvDPOS)).kv;
        let gvr = await this.getVote();
        if (gvr.err) {
            this.logger.error(`finishElection, getvote failde,errcode=${gvr.err}`);
            return { err: gvr.err };
        }
        let election = new Array();
        for (let address of gvr.vote.keys()) {
            election.push({ address, vote: gvr.vote.get(address) });
        }
        // 按照投票权益排序
        election.sort((l, r) => {
            if (l.vote.eq(r.vote)) {
                return 0;
            }
            else {
                return (l.vote.gt(r.vote) ? -1 : 1);
            }
        });
        let creators = election.slice(0, this.globalOptions.maxCreator).map((x) => {
            return x.address;
        });
        if (creators.length === 0) {
            return { err: error_code_1.ErrorCode.RESULT_OK };
        }
        if (creators.length < this.globalOptions.minCreator) {
            // 这种情况下不需要更换出块序列,但是有可能有的出块者被禁止了，检查是否能补充进去
            let minersInfo = await this.getNextMiners();
            assert(minersInfo.err === error_code_1.ErrorCode.RESULT_OK, 'miners must exist');
            let currMiners = [];
            for (let m of minersInfo.creators) {
                if (!(await this.isBan(m)).ban) {
                    currMiners.push(m);
                }
            }
            if (currMiners.length < this.globalOptions.minCreator) {
                // 这个时候就需要从外面补充了
                let currLen = currMiners.length;
                while (creators.length > 0 && currMiners.length < this.globalOptions.minCreator) {
                    let m = creators.shift();
                    let i = 0;
                    for (i = 0; i < currLen; i++) {
                        if (m === currMiners[i]) {
                            break;
                        }
                    }
                    if (i === currLen) {
                        currMiners.push(m);
                    }
                }
            }
            if (currMiners.length < this.globalOptions.minCreator) {
                // 补充起来后，数量都还小于最小出块人数，这种情况是不是不应该存在啊，先报错吧
                // throw new Error();
                creators = minersInfo.creators;
            }
            else {
                creators = currMiners;
            }
        }
        this._shuffle(blockhash, creators);
        let llr = await kvCurDPOS.llen(ViewContext.keyNextMiners);
        if (llr.err) {
            return { err: llr.err };
        }
        for (let ix = 0; ix < llr.value; ++ix) {
            let lrr = await kvCurDPOS.lremove(ViewContext.keyNextMiners, 0);
            if (lrr.err) {
                return { err: lrr.err };
            }
        }
        let lpr = await kvCurDPOS.rpushx(ViewContext.keyNextMiners, creators);
        if (lpr.err) {
            return { err: lpr.err };
        }
        return { err: error_code_1.ErrorCode.RESULT_OK };
    }
    async mortgage(from, amount) {
        assert(amount.gt(0), 'amount must positive');
        let kvDPos = (await this.database.getReadWritableKeyValue(ViewContext.kvDPOS)).kv;
        let stokeInfo = await kvDPos.hget(ViewContext.keyStoke, from);
        let stoke = stokeInfo.err === error_code_1.ErrorCode.RESULT_OK ? stokeInfo.value : new bignumber_js_1.BigNumber(0);
        await kvDPos.hset(ViewContext.keyStoke, from, stoke.plus(amount));
        await this._updatevote(from, amount);
        return { err: error_code_1.ErrorCode.RESULT_OK, returnCode: error_code_1.ErrorCode.RESULT_OK };
    }
    async unmortgage(from, amount) {
        assert(amount.gt(0), 'amount must positive');
        let kvDPos = (await this.database.getReadWritableKeyValue(ViewContext.kvDPOS)).kv;
        let stokeInfo = await kvDPos.hget(ViewContext.keyStoke, from);
        if (stokeInfo.err) {
            return { err: stokeInfo.err };
        }
        let stoke = stokeInfo.value;
        if (stoke.lt(amount)) {
            return { err: error_code_1.ErrorCode.RESULT_OK, returnCode: error_code_1.ErrorCode.RESULT_NOT_ENOUGH };
        }
        if (stoke.isEqualTo(amount)) {
            await kvDPos.hdel(ViewContext.keyStoke, from);
        }
        else {
            await kvDPos.hset(ViewContext.keyStoke, from, stoke.minus(amount));
        }
        await this._updatevote(from, (new bignumber_js_1.BigNumber(0)).minus(amount));
        if (stoke.isEqualTo(amount)) {
            await kvDPos.hdel(ViewContext.keyProducers, from);
        }
        return { err: error_code_1.ErrorCode.RESULT_OK, returnCode: error_code_1.ErrorCode.RESULT_OK };
    }
    async vote(from, candidates) {
        assert(candidates.length > 0 && candidates.length <= this.globalOptions.dposVoteMaxProducers, 'candidates.length must right');
        let cans = await this.getValidCandidates();
        if (cans.err) {
            return { err: cans.err };
        }
        cans.candidates.sort();
        let isValid = (s) => {
            for (let c of cans.candidates) {
                if (c === s) {
                    return true;
                }
                else if (c > s) {
                    return false;
                }
            }
            return false;
        };
        for (let p of candidates) {
            if (!isValid(p)) {
                return { err: error_code_1.ErrorCode.RESULT_OK, returnCode: error_code_1.ErrorCode.RESULT_NOT_FOUND };
            }
        }
        let kvDPos = (await this.database.getReadWritableKeyValue(ViewContext.kvDPOS)).kv;
        let stokeInfo = await kvDPos.hget(ViewContext.keyStoke, from);
        if (stokeInfo.err) {
            return { err: error_code_1.ErrorCode.RESULT_OK, returnCode: error_code_1.ErrorCode.RESULT_NOT_ENOUGH };
        }
        let stoke = stokeInfo.value;
        let producerInfo = await kvDPos.hget(ViewContext.keyProducers, from);
        if (producerInfo.err === error_code_1.ErrorCode.RESULT_OK) {
            let producers = producerInfo.value;
            if (producers.length === candidates.length) {
                producers.sort();
                candidates.sort();
                let i = 0;
                for (i = 0; i < producers.length; i++) {
                    if (producers[i] !== candidates[i]) {
                        break;
                    }
                }
                if (i === producers.length) {
                    return { err: error_code_1.ErrorCode.RESULT_OK, returnCode: error_code_1.ErrorCode.RESULT_OK };
                }
            }
            // 取消投给先前的那些人
            await this._updatevote(from, new bignumber_js_1.BigNumber(0).minus(stoke));
        }
        // 设置新的投票对象
        await kvDPos.hset(ViewContext.keyProducers, from, candidates);
        // 计票
        await this._updatevote(from, stoke);
        return { err: error_code_1.ErrorCode.RESULT_OK, returnCode: error_code_1.ErrorCode.RESULT_OK };
    }
    async registerToCandidate(candidate) {
        let kvDPos = (await this.database.getReadWritableKeyValue(ViewContext.kvDPOS)).kv;
        let her = await kvDPos.hexists(ViewContext.keyCandidate, candidate);
        if (her.err) {
            return { err: her.err };
        }
        if (her.value) {
            return { err: error_code_1.ErrorCode.RESULT_OK, returnCode: error_code_1.ErrorCode.RESULT_OK };
        }
        await kvDPos.hset(ViewContext.keyCandidate, candidate, 0);
        return { err: error_code_1.ErrorCode.RESULT_OK, returnCode: error_code_1.ErrorCode.RESULT_OK };
    }
    async unbanProducer(timestamp) {
        let kvDPos = (await this.database.getReadWritableKeyValue(ViewContext.kvDPOS)).kv;
        // 解禁
        let candidateInfo = await kvDPos.hgetall(ViewContext.keyCandidate);
        for (let c of candidateInfo.value) {
            if (c.value !== 0 && c.value <= timestamp) {
                await kvDPos.hset(ViewContext.keyCandidate, c.key, 0);
            }
        }
    }
    async banProducer(timestamp) {
        let kvDPos = (await this.database.getReadWritableKeyValue(ViewContext.kvDPOS)).kv;
        let allTimeInfo = await kvDPos.hgetall(ViewContext.keyNewBlockTime);
        let minersInfo = await this.getNextMiners();
        assert(minersInfo.err === error_code_1.ErrorCode.RESULT_OK);
        for (let m of minersInfo.creators) {
            for (let i = 0; i < allTimeInfo.value.length; i++) {
                if (m === allTimeInfo.value[i].key) {
                    if (timestamp - allTimeInfo.value[i].value >= this.globalOptions.timeOffsetToLastBlock) {
                        await kvDPos.hset(ViewContext.keyCandidate, m, timestamp + this.globalOptions.timeBan);
                    }
                    break;
                }
            }
        }
    }
    async updateProducerTime(producer, timestamp) {
        let kvDPos = (await this.database.getReadWritableKeyValue(ViewContext.kvDPOS)).kv;
        await kvDPos.hset(ViewContext.keyNewBlockTime, producer, timestamp);
    }
    async maintain_producer(timestamp) {
        let kvDPos = (await this.database.getReadWritableKeyValue(ViewContext.kvDPOS)).kv;
        let minersInfo = await this.getNextMiners();
        assert(minersInfo.err === error_code_1.ErrorCode.RESULT_OK);
        for (let m of minersInfo.creators) {
            let her = await kvDPos.hexists(ViewContext.keyNewBlockTime, m);
            if (her.err) {
                return her.err;
            }
            if (!her.value) {
                // 可能是新进入序列，默认把当前block的时间当作它的初始出块时间
                await kvDPos.hset(ViewContext.keyNewBlockTime, m, timestamp);
            }
        }
        // 已经被剔除出块序列了，清理它的计时器
        let allTimeInfo = await kvDPos.hgetall(ViewContext.keyNewBlockTime);
        for (let p of allTimeInfo.value) {
            let i = 0;
            for (i = 0; i < minersInfo.creators.length; i++) {
                if (p.key === minersInfo.creators[i]) {
                    break;
                }
            }
            if (i === minersInfo.creators.length) {
                let her = await kvDPos.hexists(ViewContext.keyNewBlockTime, p.key);
                if (her.err) {
                    return her.err;
                }
                if (her.value) {
                    await kvDPos.hdel(ViewContext.keyNewBlockTime, p.key);
                }
            }
        }
        return error_code_1.ErrorCode.RESULT_OK;
    }
    async _updatevote(voteor, amount) {
        let kvDPos = (await this.database.getReadWritableKeyValue(ViewContext.kvDPOS)).kv;
        let producerInfo = await kvDPos.hget(ViewContext.keyProducers, voteor);
        if (producerInfo.err === error_code_1.ErrorCode.RESULT_OK) {
            let producers = producerInfo.value;
            for (let p of producers) {
                let voteInfo = await kvDPos.hget(ViewContext.keyVote, p);
                if (voteInfo.err === error_code_1.ErrorCode.RESULT_OK) {
                    let vote = voteInfo.value.plus(amount);
                    if (vote.eq(0)) {
                        await kvDPos.hdel(ViewContext.keyVote, p);
                    }
                    else {
                        await kvDPos.hset(ViewContext.keyVote, p, vote);
                    }
                }
                else {
                    assert(amount.gt(0), '_updatevote amount must positive');
                    await kvDPos.hset(ViewContext.keyVote, p, amount);
                }
            }
        }
        return error_code_1.ErrorCode.RESULT_OK;
    }
    _shuffle(blockhash, producers) {
        let buf = Buffer.from(blockhash);
        let total = 0;
        for (let i = 0; i < buf.length; i++) {
            total = total + buf[i];
        }
        for (let i = 0; i < producers.length; ++i) {
            let k = total + i * 2685821657736338717;
            k ^= (k >> 12);
            k ^= (k << 25);
            k ^= (k >> 27);
            k *= 2685821657736338717;
            let jmax = producers.length - i;
            let j = i + k % jmax;
            let temp = producers[i];
            producers[i] = producers[j];
            producers[j] = temp;
        }
    }
}
exports.Context = Context;
