"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const error_code_1 = require("../error_code");
const value_chain_1 = require("../value_chain");
const bignumber_js_1 = require("bignumber.js");
class DbftContext {
    constructor(storage, globalOptions, logger) {
        this.storage = storage;
        this.globalOptions = globalOptions;
        this.logger = logger;
    }
    async init(miners) {
        miners = this.removeDuplicate(miners);
        let storage = this.storage;
        let dbr = await storage.getReadWritableDatabase(value_chain_1.Chain.dbSystem);
        if (dbr.err) {
            this.logger.error(`get system database failed,errcode=${dbr.err}`);
            return { err: dbr.err };
        }
        let kvr = await dbr.value.getReadWritableKeyValue(DbftContext.kvDBFT);
        if (kvr.err) {
            this.logger.error(`get dbft keyvalue failed,errcode=${dbr.err}`);
            return { err: kvr.err };
        }
        let kvDBFT = kvr.kv;
        await kvDBFT.set(DbftContext.keyMiners, JSON.stringify(miners));
        for (let address of miners) {
            let info = { height: 0 };
            let { err } = await kvDBFT.hset(DbftContext.keyCandidate, address, 0);
            if (err) {
                return { err };
            }
        }
        return { err: error_code_1.ErrorCode.RESULT_OK };
    }
    static getElectionBlockNumber(globalOptions, n) {
        if (n === 0) {
            return 0;
        }
        return Math.floor((n - 1) / globalOptions.reSelectionBlocks) * globalOptions.reSelectionBlocks;
    }
    static isElectionBlockNumber(globalOptions, n) {
        // n=0的时候为创世块，config里面还没有值呢
        if (n === 0) {
            return true;
        }
        return n % globalOptions.reSelectionBlocks === 0;
    }
    static isAgreeRateReached(globalOptions, minerCount, agreeCount) {
        return agreeCount >= (minerCount * globalOptions.agreeRateNumerator / globalOptions.agreeRateDenominator);
    }
    static getDueNextMiner(globalOptions, preBlock, nextMiners, view) {
        let offset = view;
        if (!DbftContext.isElectionBlockNumber(globalOptions, preBlock.number)) {
            let idx = nextMiners.indexOf(preBlock.miner);
            if (idx >= 0) {
                offset += idx + 1;
            }
        }
        return nextMiners[offset % nextMiners.length];
    }
    async getMiners() {
        let kvr = await this.getDbftKV(DbftContext.kvDBFT);
        if (kvr.err) {
            this.logger.error(`get dbft keyvalue failed,errcode=${kvr.err}`);
            return { err: kvr.err };
        }
        let kvDBFT = kvr.kv;
        let gm = await kvDBFT.get(DbftContext.keyMiners);
        if (gm.err) {
            this.logger.error(`getMinersFromStorage failed,errcode=${gm.err}`);
            return { err: gm.err };
        }
        return { err: error_code_1.ErrorCode.RESULT_OK, miners: JSON.parse(gm.value) };
    }
    async getCandidates() {
        let gr = await this.getValidCandidates();
        if (gr.err) {
            return { err: gr.err };
        }
        let kvr = await this.getDbftKV(DbftContext.kvDBFT);
        if (kvr.err) {
            this.logger.error(`get dbft keyvalue failed,errcode=${kvr.err}`);
            return { err: kvr.err };
        }
        let kvDBFT = kvr.kv;
        let gv = await kvDBFT.hgetall(DbftContext.keyVote);
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
    async getStake(address) {
        let kvr = await this.getDbftKV(DbftContext.kvDBFT);
        if (kvr.err) {
            this.logger.error(`get dbft keyvalue failed,errcode=${kvr.err}`);
            return { err: kvr.err };
        }
        let kvDBFT = kvr.kv;
        // if voter does not have enough stake , return error
        let her = await kvDBFT.hexists(DbftContext.keyStake, address);
        if (her.err) {
            return { err: her.err };
        }
        if (!her.value) {
            return { err: error_code_1.ErrorCode.RESULT_OK, stake: new bignumber_js_1.BigNumber(0) };
        }
        else {
            let gr = await kvDBFT.hget(DbftContext.keyStake, address);
            if (gr.err) {
                return { err: gr.err };
            }
            return { err: error_code_1.ErrorCode.RESULT_OK, stake: gr.value };
        }
    }
    async getVote() {
        let kvr = await this.getDbftKV(DbftContext.kvDBFT);
        if (kvr.err) {
            this.logger.error(`get dbft keyvalue failed,errcode=${kvr.err}`);
            return { err: kvr.err };
        }
        let kvDBFT = kvr.kv;
        let gr = await kvDBFT.hgetall(DbftContext.keyVote);
        if (gr.err) {
            this.logger.error(`context getVote failed,errcode=${gr.err}`);
            return { err: gr.err };
        }
        let cans = await this.getValidCandidates();
        if (cans.err) {
            this.logger.error(`context getValidCandidates failed,errcode=${cans.err}`);
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
        let vote = new Array();
        for (let v of gr.value) {
            if (isValid(v.key)) {
                vote.push({ address: v.key, vote: v.value });
            }
        }
        // 按照投票权益排序
        vote.sort((l, r) => {
            if (l.vote.eq(r.vote)) {
                return 0;
            }
            else {
                return (l.vote.gt(r.vote) ? -1 : 1);
            }
        });
        return { err: error_code_1.ErrorCode.RESULT_OK, vote };
    }

    async registerToCandidate(candidate, blockheight) {
        let kvr = await this.getDbftKV(DbftContext.kvDBFT);
        if (kvr.err) {
            this.logger.error(`execute register get dbft keyvalue failed,errcode=${kvr.err}`);
            return kvr.err;
        }
        let kvDBFT = kvr.kv;
        let her = await kvDBFT.hexists(DbftContext.keyCandidate, candidate);
        if (her.err) {
            this.logger.error(`execute register hexists candidate failed,errcode=${her.err}`);
            return her.err;
        }
        if (her.value) {
            return error_code_1.ErrorCode.RESULT_OK;
        }
        // let info: CandidateInfo = {height: blockheight};
        let { err } = await kvDBFT.hset(DbftContext.keyCandidate, candidate, 0);
        return err;
    }

    async mortgage(from, amount) {
        let kvr = await this.getDbftKV(DbftContext.kvDBFT);
        if (kvr.err) {
            this.logger.error(`execute mortgage get dbft keyvalue failed,errcode=${kvr.err}`);
            return kvr.err;
        }
        let kvDBFT = kvr.kv;
        let stakeInfo = await kvDBFT.hget(DbftContext.keyStake, from);
        let stake = new bignumber_js_1.BigNumber(0);
        if (stakeInfo.err === error_code_1.ErrorCode.RESULT_OK) {
            stake = stakeInfo.value;
        }
        else if (stakeInfo.err != error_code_1.ErrorCode.RESULT_NOT_FOUND) {
            this.logger.error(`execute mortgage get stakeInfo failed,errcode=${stakeInfo.err}`);
            return stakeInfo.err;
        }
        let result = await kvDBFT.hset(DbftContext.keyStake, from, stake.plus(amount));
        if (result.err) {
            this.logger.error(`execute mortgage update stakeInfo failed,errcode=${result.err}`);
            return result.err;
        }
        result.err = await this._updatevote(from, amount);
        return result.err;
    }
    async unmortgage(from, amount) {
        let kvr = await this.getDbftKV(DbftContext.kvDBFT);
        if (kvr.err) {
            this.logger.error(`get dbft keyvalue failed,errcode=${kvr.err}`);
            return kvr.err;
        }
        let kvDBFT = kvr.kv;
        let stakeInfo = await kvDBFT.hget(DbftContext.keyStake, from);
        if (stakeInfo.err) {
            this.logger.error(`execute unmortgage get stakenfo failed,errcode=${kvr.err}`);
            return stakeInfo.err;
        }
        let stake = stakeInfo.value;
        if (stake.lt(amount)) {
            return error_code_1.ErrorCode.RESULT_NOT_ENOUGH;
        }
        let result = { err: error_code_1.ErrorCode.RESULT_OK };
        if (stake.isEqualTo(amount)) {
            result = await kvDBFT.hdel(DbftContext.keyStake, from);
        }
        else {
            result = await kvDBFT.hset(DbftContext.keyStake, from, stake.minus(amount));
        }
        if (result.err) {
            this.logger.error(`execute unmortgage update stakeInfo failed,errcode=${result.err}`);
            return result.err;
        }
        result.err = await this._updatevote(from, (new bignumber_js_1.BigNumber(0)).minus(amount));
        if (result.err) {
            this.logger.error(`execute unmortgage update vote failed,errcode=${result.err}`);
            return result.err;
        }
        if (stake.isEqualTo(amount)) {
            result = await kvDBFT.hdel(DbftContext.keyProducers, from);
        }
        return result.err;
    }
    async vote(from, candidates) {
        candidates = this.removeDuplicate(candidates);
        let cans = await this.getValidCandidates();
        if (cans.err) {
            this.logger.error(`execute vote getValidCandidates failed,errcode=${cans.err}`);
            return cans.err;
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
                return error_code_1.ErrorCode.RESULT_NOT_FOUND;
            }
        }
        let kvr = await this.getDbftKV(DbftContext.kvDBFT);
        if (kvr.err) {
            this.logger.error(`execute vote get dbft keyvalue failed,errcode=${kvr.err}`);
            return kvr.err;
        }
        let kvDBFT = kvr.kv;
        let stakeInfo = await kvDBFT.hget(DbftContext.keyStake, from);
        if (stakeInfo.err) {
            this.logger.error(`execute vote get stakeInfo failed,errcode=${stakeInfo.err}`);
            return stakeInfo.err;
        }
        let stake = stakeInfo.value;
        let producerInfo = await kvDBFT.hget(DbftContext.keyProducers, from);
        let result = { err: error_code_1.ErrorCode.RESULT_OK };
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
                    return error_code_1.ErrorCode.RESULT_OK;
                }
            }
            // 取消投给先前的那些人
            result.err = await this._updatevote(from, new bignumber_js_1.BigNumber(0).minus(stake));
            if (result.err) {
                this.logger.error(`execute vote _updatevote failed,errcode=${result.err}`);
                return result.err;
            }
        }
        // 设置新的投票对象
        result = await kvDBFT.hset(DbftContext.keyProducers, from, candidates);
        if (result.err) {
            this.logger.error(`execute vote update producers failed,errcode=${result.err}`);
            return result.err;
        }
        // 计票
        result.err = await this._updatevote(from, stake);
        return result.err;
    }
    async updateCreatorHeight(miner, blockHeight) {
        let kvr = await this.getDbftKV(DbftContext.kvDBFT);
        if (kvr.err) {
            this.logger.error(`get dbft keyvalue failed,errcode=${kvr.err}`);
            return kvr.err;
        }
        let kvDBFT = kvr.kv;
        let { err } = await kvDBFT.hset(DbftContext.keyNewBlockHeight, miner, blockHeight);
        if (err) {
            this.logger.error(`updateCreatorHeight set new data failed,errcode=${err},miner:${miner},blockeight:${blockHeight}`);
        }
        return err;
    }
    async banMiner(blockHeight) {
        let kvr = await this.getDbftKV(DbftContext.kvDBFT);
        let selectFlag = false;
        if (kvr.err) {
            this.logger.error(`get dbft keyvalue failed,errcode=${kvr.err}`);
            return { err: kvr.err, reSelect: selectFlag };
        }
        let kvDBFT = kvr.kv;
        let allHeightInfo = await kvDBFT.hgetall(DbftContext.keyNewBlockHeight);
        if (allHeightInfo.err) {
            this.logger.error(`banMiner get allHeightInfo failed,errcode=${allHeightInfo.err}`);
            return { err: allHeightInfo.err, reSelect: selectFlag };
        }
        let gm = await this.getMiners();
        if (gm.err) {
            this.logger.error(`banMiner get miners failed,errcode=${gm.err}`);
            return { err: gm.err, reSelect: selectFlag };
        }
        let allHeightInfoMap = new Map();
        for (let blockInfo of allHeightInfo.value) {
            allHeightInfoMap.set(blockInfo.key, blockInfo.value);
        }
        let result = { err: error_code_1.ErrorCode.RESULT_OK };
        for (let m of gm.miners) {
            let minerNewHeight = allHeightInfoMap.get(m);
            if (allHeightInfoMap.has(m)) {
                if ((blockHeight - minerNewHeight) >= this.globalOptions.numberOffsetToLastBlock) {
                    result = await kvDBFT.hset(DbftContext.keyCandidate, m, blockHeight + this.globalOptions.banBlocks);
                    if (result.err) {
                        this.logger.error(`banMiner update ban status failed,errcode=${result.err}`);
                        return { err: result.err, reSelect: selectFlag };
                    }
                    selectFlag = true;
                }
            }
            else {
                //如果发现有miner没有newBlockHeight数据，则把最新的高度更新上去
                result = await kvDBFT.hset(DbftContext.keyNewBlockHeight, m, blockHeight);
                if (result.err) {
                    this.logger.error(`banMiner update miner new blockHeight failed,errcode=${result.err}`);
                    return { err: result.err, reSelect: selectFlag };
                }
            }
        }
        return { err: result.err, reSelect: selectFlag };
    }
    async unBanMiner(blockHeight) {
        let kvr = await this.getDbftKV(DbftContext.kvDBFT);
        let selectFlag = false;
        if (kvr.err) {
            this.logger.error(`get dbft keyvalue failed,errcode=${kvr.err}`);
            return kvr.err;
        }
        let kvDBFT = kvr.kv;
        let candidateInfo = await kvDBFT.hgetall(DbftContext.keyCandidate);
        let result = { err: error_code_1.ErrorCode.RESULT_OK };
        for (let c of candidateInfo.value) {
            if (c.value !== 0 && c.value <= blockHeight) {
                let result = await kvDBFT.hset(DbftContext.keyCandidate, c.key, 0);
                if (result.err) {
                    this.logger.error(`unBanMiner update candidate info failed,errcode=${result.err}`);
                }
                //清除newBlockHeight数据
                result = await kvDBFT.hdel(DbftContext.keyNewBlockHeight, c.key);
                if (result.err) {
                    this.logger.error(`unBanMiner delete newBlockHeight info failed,errcode=${result.err}`);
                }
            }
        }
        return error_code_1.ErrorCode.RESULT_OK;
    }
    async updateMiners(blockheight) {
        let kvr = await this.getDbftKV(DbftContext.kvDBFT);
        if (kvr.err) {
            this.logger.error(`get dbft keyvalue failed,errcode= ${kvr.err}`);
            return kvr.err;
        }
        let kvDBFT = kvr.kv;
        let gvr = await this.getVote();
        if (gvr.err) {
            this.logger.error(`updateMiners, getvote fail,errcode=${gvr.err}`);
            return gvr.err;
        }
        let election = gvr.vote;
        let miners = election.slice(0, this.globalOptions.maxValidator).map((x) => {
            return x.address;
        });
        // this._shuffle(shuffle_factor, creators);
        let minValidator = this.globalOptions.minValidator;
        if (minValidator > miners.length) {
            this.logger.error(`updateCandidate failed, valid miners not enough,votes ${election.toString()}, length ${miners.length} minValidator ${minValidator}`);
            return error_code_1.ErrorCode.RESULT_NOT_ENOUGH;
        }
        let { err } = await kvDBFT.set(DbftContext.keyMiners, JSON.stringify(miners));
        if (err) {
            this.logger.error(`updateMiners set miners fail,errcode=${err}`);
            return err;
        }
        //对于新增的miner，newBlock的数据需要做初始化
        let result = { err: error_code_1.ErrorCode.RESULT_OK };
        for (let miner of miners) {
            let result = await kvDBFT.hexists(DbftContext.keyNewBlockHeight, miner);
            if (result.err) {
                this.logger.error(`updateMiners hexists miner newBlockHeight fail,errcode=${result.err}`);
                continue;
            }
            else if (!result.value) {
                result = await kvDBFT.hset(DbftContext.keyNewBlockHeight, miner, blockheight);
                if (result.err) {
                    this.logger.error(`updateMiners hset miner newBlockHeight fail,errcode=${result.err}`);
                    continue;
                }
            }
        }
        return result.err;
    }
    //用于换票或者赎回票之后更新对应miner的所得票数
    async _updatevote(voteor, amount) {
        let kvr = await this.getDbftKV(DbftContext.kvDBFT);
        if (kvr.err) {
            this.logger.error(`execute _updatevote get dbft keyvalue failed,errcode=${kvr.err}`);
            return kvr.err;
        }
        let kvDBFT = kvr.kv;
        let producerInfo = await kvDBFT.hget(DbftContext.keyProducers, voteor);
        if (producerInfo.err === error_code_1.ErrorCode.RESULT_NOT_FOUND) {
            return error_code_1.ErrorCode.RESULT_OK;
        }
        if (producerInfo.err) {
            this.logger.error(`execute _updatevote get producerInfo failed,errcode=${producerInfo.err}`);
            return producerInfo.err;
        }
        let producers = producerInfo.value;
        for (let p of producers) {
            let voteInfo = await kvDBFT.hget(DbftContext.keyVote, p);
            if (voteInfo.err === error_code_1.ErrorCode.RESULT_OK) {
                let vote = voteInfo.value.plus(amount);
                let result = { err: error_code_1.ErrorCode.RESULT_OK };
                if (vote.eq(0)) {
                    result = await kvDBFT.hdel(DbftContext.keyVote, p);
                }
                else {
                    result = await kvDBFT.hset(DbftContext.keyVote, p, vote);
                }
                if (result.err) {
                    this.logger.error(`execute _updatevote update vote failed,errcode=${result.err}`);
                    return result.err;
                }
            }
            else if (voteInfo.err === error_code_1.ErrorCode.RESULT_NOT_FOUND) {
                let setResult = await kvDBFT.hset(DbftContext.keyVote, p, amount);
                if (setResult.err) {
                    this.logger.error(`execute _updatevote hset vote failed,errcode=${setResult.err}`);
                    return setResult.err;
                }
            }
            else {
                this.logger.error(`execute _updatevote get voteInfo failed,errcode=${voteInfo.err}`);
                return voteInfo.err;
            }
        }
        return error_code_1.ErrorCode.RESULT_OK;
    }
    async getValidCandidates() {
        let kvr = await this.getDbftKV(DbftContext.kvDBFT);
        if (kvr.err) {
            this.logger.error(`execute getValidCandidates get dbft keyvalue failed,errcode=${kvr.err}`);
            return { err: kvr.err };
        }
        let kvDBFT = kvr.kv;
        let gr = await kvDBFT.hgetall(DbftContext.keyCandidate);
        if (gr.err) {
            this.logger.error(`execute getValidCandidates get allCandidate failed,errcode=${gr.err}`);
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
    //获取相应的kv表
    async getDbftKV(name) {
        let storage = this.storage;
        let dbr = await storage.getReadWritableDatabase(value_chain_1.Chain.dbSystem);
        if (dbr.err) {
            this.logger.error(`get system database failed,errcode=${dbr.err}`);
            return { err: dbr.err };
        }
        let kvr = await dbr.value.getReadWritableKeyValue(name);
        return kvr;
    }
    //去重函数
    removeDuplicate(s) {
        let s1 = [];
        let bit = new Map();
        for (let v of s) {
            if (!bit.has(v)) {
                s1.push(v);
                bit.set(v, 1);
            }
        }
        return s1;
    }
}
DbftContext.kvDBFT = 'dbft';
DbftContext.keyCandidate = 'candidate';
DbftContext.keyMiners = 'miner';
DbftContext.keyVote = 'vote';
DbftContext.keyStake = 'stake';
DbftContext.keyProducers = 'producers';
// 生产者最后一次出块时间
DbftContext.keyNewBlockHeight = 'newblockheight';
exports.DbftContext = DbftContext;
