"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("../../src/client");
const core_1 = require("../../src/core");
const txPendingChecker = require("../../src/core/chain/tx_pending_checker");
function registerHandler(handler) {
    handler.genesisListener = async (context) => {
        await context.storage.createKeyValue('bid');
        await context.storage.createKeyValue('bidInfo');
        return client_1.ErrorCode.RESULT_OK;
    };
    async function getTokenBalance(balanceKv, address) {
        let retInfo = await balanceKv.get(address);
        return retInfo.err === client_1.ErrorCode.RESULT_OK ? retInfo.value : new client_1.BigNumber(0);
    }
    handler.addTX('createToken', async (context, params) => {
        let err = context.cost(context.totallimit.times(context.price));
        if (err) {
            return err;
        }
        // 这里是不是会有一些检查什么的，会让任何人都随便创建Token么?
        // 必须要有tokenid，一条链上tokenid不能重复
        // if (!params.tokenid || !isValidAddress(params.tokenid) ) {
        //     return ErrorCode.RESULT_INVALID_ADDRESS;
        // }
        let kvRet = await context.storage.createKeyValue(params.tokenid);
        if (kvRet.err) {
            return kvRet.err;
        }
        await kvRet.kv.set('creator', context.caller);
        await kvRet.kv.set(context.caller, new client_1.BigNumber(params.amount));
        await kvRet.kv.set('contract', params.tokenid);
        await kvRet.kv.set('supply', new client_1.BigNumber(params.amount));
        await kvRet.kv.set('name', params.name);
        await kvRet.kv.set('symbol', params.symbol);
        return client_1.ErrorCode.RESULT_OK;
    }, txPendingChecker.createTokenChecker);
    handler.addTX('transferTokenTo', async (context, params) => {
        let err = context.cost(context.totallimit.times(context.price));
        if (err) {
            return err;
        }
        let tokenkv = await context.storage.getReadWritableKeyValue(params.tokenid);
        if (tokenkv.err) {
            return tokenkv.err;
        }
        let fromInfo = await tokenkv.kv.hget('freeze', context.caller);
        if (fromInfo.err === client_1.ErrorCode.RESULT_OK && fromInfo.value === true) {
            return client_1.ErrorCode.RESULT_IS_FROZEN;
        }
        else if (fromInfo.err === client_1.ErrorCode.RESULT_EXCEPTION) {
            return client_1.ErrorCode.RESULT_EXCEPTION;
        }
        let toInfo = await tokenkv.kv.hget('freeze', params.to);
        if (toInfo.err === client_1.ErrorCode.RESULT_OK && toInfo.value === true) {
            return client_1.ErrorCode.RESULT_IS_FROZEN;
        }
        else if (toInfo.err === client_1.ErrorCode.RESULT_EXCEPTION) {
            return client_1.ErrorCode.RESULT_EXCEPTION;
        }
        let fromTotal = await getTokenBalance(tokenkv.kv, context.caller);
        let amount = new client_1.BigNumber(params.amount);
        if (fromTotal.lt(amount)) {
            return client_1.ErrorCode.RESULT_NOT_ENOUGH;
        }
        await (tokenkv.kv.set(context.caller, fromTotal.minus(amount)));
        await (tokenkv.kv.set(params.to, (await getTokenBalance(tokenkv.kv, params.to)).plus(amount)));
        return client_1.ErrorCode.RESULT_OK;
    }, txPendingChecker.transferTokenToChecker);
    /**
     * 转移其它地址的 tokens
     */
    handler.addTX('transferFrom', async (context, params) => {
        let err = context.cost(context.totallimit.times(context.price));
        if (err) {
            return err;
        }
        let amount = new client_1.BigNumber(params.amount);
        let tokenkv = await context.storage.getReadWritableKeyValue(params.tokenid);
        if (tokenkv.err) {
            return tokenkv.err;
        }
        let fromInfo = await tokenkv.kv.hget('freeze', params.from);
        if (fromInfo.err === client_1.ErrorCode.RESULT_OK && fromInfo.value === true) {
            return client_1.ErrorCode.RESULT_IS_FROZEN;
        }
        else if (fromInfo.err === client_1.ErrorCode.RESULT_EXCEPTION) {
            return client_1.ErrorCode.RESULT_EXCEPTION;
        }
        let toInfo = await tokenkv.kv.hget('freeze', params.to);
        if (toInfo.err === client_1.ErrorCode.RESULT_OK && toInfo.value === true) {
            return client_1.ErrorCode.RESULT_IS_FROZEN;
        }
        else if (toInfo.err === client_1.ErrorCode.RESULT_EXCEPTION) {
            return client_1.ErrorCode.RESULT_EXCEPTION;
        }
        let callerInfo = await tokenkv.kv.hget('freeze', context.caller);
        if (callerInfo.err === client_1.ErrorCode.RESULT_OK && callerInfo.value === true) {
            return client_1.ErrorCode.RESULT_IS_FROZEN;
        }
        else if (callerInfo.err === client_1.ErrorCode.RESULT_EXCEPTION) {
            return client_1.ErrorCode.RESULT_EXCEPTION;
        }
        let callerApproval = await tokenkv.kv.hget('approval', params.from);
        if (callerApproval.err !== client_1.ErrorCode.RESULT_OK) {
            return callerApproval.err;
        }
        let callerMap = core_1.MapFromObject(callerApproval.value);
        if (callerMap.get(context.caller).lt(amount)) {
            return client_1.ErrorCode.RESULT_NOT_ENOUGH;
        }
        let fromBalance = await getTokenBalance(tokenkv.kv, params.from);
        if (fromBalance.lt(amount)) {
            return client_1.ErrorCode.RESULT_NOT_ENOUGH;
        }
        let toBalance = await getTokenBalance(tokenkv.kv, params.to);
        if (toBalance.lt(amount)) {
            return client_1.ErrorCode.RESULT_NOT_ENOUGH;
        }
        callerMap.set(context.caller, callerMap.get(context.caller).minus(amount));
        await tokenkv.kv.hset('approval', params.from, client_1.MapToObject(callerMap));
        await tokenkv.kv.set(params.from, fromBalance.minus(amount));
        await tokenkv.kv.set(params.to, toBalance.plus(amount));
        return client_1.ErrorCode.RESULT_OK;
    }, txPendingChecker.transferFromChecker);
    /**
     * 授权
     */
    handler.addTX('approve', async (context, params) => {
        let err = context.cost(context.totallimit.times(context.price));
        if (err) {
            return err;
        }
        let spender = params.spender;
        let amount = new client_1.BigNumber(params.amount);
        let tokenkv = await context.storage.getReadWritableKeyValue(params.tokenid);
        if (tokenkv.err) {
            return tokenkv.err;
        }
        let senderBalance = await getTokenBalance(tokenkv.kv, context.caller);
        if (senderBalance.lt(amount)) {
            return client_1.ErrorCode.RESULT_NOT_ENOUGH;
        }
        let senderApproval = await tokenkv.kv.hget('approval', context.caller);
        if (senderApproval.err === client_1.ErrorCode.RESULT_OK) {
            let senderMap = core_1.MapFromObject(senderApproval);
            senderMap.set(spender, senderMap.get(spender).plus(amount));
            await tokenkv.kv.hset('approval', context.caller, senderApproval);
        }
        else if (senderApproval.err === client_1.ErrorCode.RESULT_NOT_FOUND) {
            let approvalMap = new Map();
            approvalMap.set(spender, amount);
            let approvalObj = client_1.MapToObject(approvalMap);
            await tokenkv.kv.hset('approval', context.caller, approvalObj);
        }
        else {
            return senderApproval.err;
        }
        return client_1.ErrorCode.RESULT_OK;
    }, txPendingChecker.approveChecker);
    /**
     * 冻结帐户
     */
    handler.addTX('freezeAccount', async (context, params) => {
        let err = context.cost(context.totallimit.times(context.price));
        if (err) {
            return err;
        }
        let freeze = params.freeze;
        let freezeAddress = params.freezeAddress;
        let tokenkv = await context.storage.getReadWritableKeyValue(params.tokenid);
        if (tokenkv.err) {
            return tokenkv.err;
        }
        let ret = await tokenkv.kv.get('creator');
        if (ret.err !== client_1.ErrorCode.RESULT_OK) {
            return ret.err;
        }
        let owner = ret.value;
        if (owner !== context.caller) {
            return client_1.ErrorCode.RESULT_NO_PERMISSIONS;
        }
        await tokenkv.kv.hset('freeze', freezeAddress, freeze);
        return client_1.ErrorCode.RESULT_OK;
    }, txPendingChecker.freezeAccountChecker);
    /**
     * 燃烧
     */
    handler.addTX('burn', async (context, params) => {
        let err = context.cost(context.totallimit.times(context.price));
        if (err) {
            return err;
        }
        let burnAmount = new client_1.BigNumber(params.amount);
        let tokenkv = await context.storage.getReadWritableKeyValue(params.tokenid);
        if (tokenkv.err) {
            return tokenkv.err;
        }
        let callerInfo = await tokenkv.kv.hget('freeze', context.caller);
        if (callerInfo.err === client_1.ErrorCode.RESULT_OK && callerInfo.value === true) {
            return client_1.ErrorCode.RESULT_IS_FROZEN;
        }
        else if (callerInfo.err === client_1.ErrorCode.RESULT_EXCEPTION) {
            return client_1.ErrorCode.RESULT_EXCEPTION;
        }
        let totalSupply = await tokenkv.kv.get('supply');
        let callerBalance = await getTokenBalance(tokenkv.kv, context.caller);
        if (totalSupply.err !== client_1.ErrorCode.RESULT_OK) {
            return totalSupply.err;
        }
        if (callerBalance.lt(burnAmount)) {
            return client_1.ErrorCode.RESULT_NOT_ENOUGH;
        }
        await tokenkv.kv.set('supply', totalSupply.value.minus(burnAmount));
        await tokenkv.kv.set(context.caller, callerBalance.minus(burnAmount));
        return client_1.ErrorCode.RESULT_OK;
    }, txPendingChecker.burnChecker);
    /**
     * 铸币
     */
    handler.addTX('mintToken', async (context, params) => {
        let err = context.cost(context.totallimit.times(context.price));
        if (err) {
            return err;
        }
        let mintAmount = new client_1.BigNumber(params.amount);
        let tokenkv = await context.storage.getReadWritableKeyValue(params.tokenid);
        if (tokenkv.err) {
            return tokenkv.err;
        }
        let ret = await tokenkv.kv.get('creator');
        if (ret.err !== client_1.ErrorCode.RESULT_OK) {
            return ret.err;
        }
        let owner = ret.value;
        if (owner !== context.caller) {
            return client_1.ErrorCode.RESULT_NO_PERMISSIONS;
        }
        let totalSupply = await tokenkv.kv.get('supply');
        let ownerBalance = await getTokenBalance(tokenkv.kv, owner);
        if (totalSupply.err !== client_1.ErrorCode.RESULT_OK) {
            return totalSupply.err;
        }
        await tokenkv.kv.set('supply', totalSupply.value.plus(mintAmount));
        await tokenkv.kv.set(owner, ownerBalance.plus(mintAmount));
        return client_1.ErrorCode.RESULT_OK;
    }, txPendingChecker.mintTokenChecker);
    /**
     * 转移权限
     */
    handler.addTX('transferOwnership', async (context, params) => {
        let err = context.cost(context.totallimit.times(context.price));
        if (err) {
            return err;
        }
        let tokenkv = await context.storage.getReadWritableKeyValue(params.tokenid);
        if (tokenkv.err) {
            return tokenkv.err;
        }
        let ret = await tokenkv.kv.get('creator');
        if (ret.err !== client_1.ErrorCode.RESULT_OK) {
            return ret.err;
        }
        let owner = ret.value;
        let newOwner = params.newOwner;
        if (owner === context.caller) {
            await tokenkv.kv.set('creator', newOwner);
        }
        else {
            return client_1.ErrorCode.RESULT_NO_PERMISSIONS;
        }
        return client_1.ErrorCode.RESULT_OK;
    }, txPendingChecker.transferOwnershipChecker);
    /**
     * 获取 token 总量
     */
    handler.addViewMethod('getTokenTotalSupply', async (context, params) => {
        let balancekv = await context.storage.getReadableKeyValue(params.tokenid);
        let retInfo = await balancekv.kv.get('supply');
        return retInfo.err === client_1.ErrorCode.RESULT_OK ? retInfo.value : new client_1.BigNumber(0);
    });
    handler.addViewMethod('getTokenBalance', async (context, params) => {
        let balancekv = await context.storage.getReadableKeyValue(params.tokenid);
        return await getTokenBalance(balancekv.kv, params.address);
    });
    handler.addViewMethod('getBalance', async (context, params) => {
        return await context.getBalance(params.address);
    });
    handler.addViewMethod('getVote', async (context, params) => {
        let v = await context.getVote();
        return client_1.MapToObject(v);
    });
    handler.addViewMethod('getStake', async (context, params) => {
        return await context.getStake(params.address);
    });
    handler.addViewMethod('getCandidates', async (context, params) => {
        return await context.getCandidates();
    });
    handler.addViewMethod('getMiners', async (context, params) => {
        return await context.getMiners();
    });
    handler.addTX('transferTo', async (context, params) => {
        let err = context.cost(context.totallimit.times(context.price));
        if (err) {
            return err;
        }
        return await context.transferTo(params.to, context.value);
    }, txPendingChecker.transferToChecker);
    handler.addTX('vote', async (context, params) => {
        let err = context.cost(context.totallimit.times(context.price));
        if (err) {
            return err;
        }
        return await context.vote(context.caller, params.candidates);
    }, txPendingChecker.voteChecker);
    handler.addTX('mortgage', async (context, params) => {
        let err = context.cost(context.totallimit.times(context.price));
        if (err) {
            return err;
        }
        return await context.mortgage(context.caller, new client_1.BigNumber(params.amount));
    }, txPendingChecker.mortgageChecker);
    handler.addTX('unmortgage', async (context, params) => {
        let errC = context.cost(context.totallimit.times(context.price));
        if (errC) {
            return errC;
        }
        let err = await context.transferTo(context.caller, new client_1.BigNumber(params.amount));
        if (err) {
            return err;
        }
        return await context.unmortgage(context.caller, new client_1.BigNumber(params.amount));
    }, txPendingChecker.unmortgageChecker);
    handler.addTX('register', async (context, params) => {
        let err = context.cost(context.totallimit.times(context.price));
        if (err) {
            return err;
        }
        return await context.register(context.caller);
    }, txPendingChecker.registerChecker);
    // 拍卖
    handler.addTX('publish', async (context, params) => {
        let err = context.cost(context.totallimit.times(context.price));
        if (err) {
            return err;
        }
        // params.name: 发布的name, name不能相同
        // context.value: 最低出价, BigNumber
        // params.duation: 持续时间，单位是block
        // 暂时没有对发布方有value的要求，可以加上发布方要扣除一定数量币的功能
        // if (isNullOrUndefined(params.name) || !params.duation || params.duation <= 0 || !(params.lowest instanceof BigNumber)) {
        //     return ErrorCode.RESULT_INVALID_PARAM;
        // }
        let bidKV = (await context.storage.getReadWritableKeyValue('bid')).kv;
        let ret = await bidKV.get(params.name);
        if (ret.err === client_1.ErrorCode.RESULT_OK) {
            return client_1.ErrorCode.RESULT_ALREADY_EXIST;
        }
        let bidInfoKV = (await context.storage.getReadWritableKeyValue('bidInfo')).kv;
        await bidInfoKV.hset('biding', params.name, { publisher: context.caller, finish: context.height + params.duation });
        await bidKV.set(params.name, { caller: context.caller, value: context.value });
        await bidKV.rpush((context.height + params.duation).toString(), params.name);
        return client_1.ErrorCode.RESULT_OK;
    }, txPendingChecker.publishChecker);
    // 出价
    handler.addTX('bid', async (context, params) => {
        let err = context.cost(context.totallimit.times(context.price));
        if (err) {
            return err;
        }
        // params.name: 发布的name, name不能相同
        // context.value: 最低出价, BigNumber
        let bidKV = (await context.storage.getReadWritableKeyValue('bid')).kv;
        let ret = await bidKV.get(params.name);
        if (ret.err !== client_1.ErrorCode.RESULT_OK) {
            return ret.err;
        }
        // 如果本次出价不高于上次，则无效
        if (ret.value.value.gte(context.value)) {
            return client_1.ErrorCode.RESULT_NOT_ENOUGH;
        }
        // 把上一次的出价还给出价者
        await context.transferTo(ret.value.caller, ret.value.value);
        // 更新新的出价
        await bidKV.set(params.name, { caller: context.caller, value: context.value });
        return client_1.ErrorCode.RESULT_OK;
    }, txPendingChecker.bidChecker);
    // 在块后事件中处理拍卖结果
    handler.addPostBlockListener(async (height) => true, async (context) => {
        context.logger.info(`on BlockHeight ${context.height}`);
        let bidKV = (await context.storage.getReadWritableKeyValue('bid')).kv;
        let bidInfoKV = (await context.storage.getReadWritableKeyValue('bidInfo')).kv;
        do {
            let ret = await bidKV.rpop(context.height.toString());
            if (ret.err === client_1.ErrorCode.RESULT_OK) {
                const name = ret.value;
                let info = (await bidInfoKV.hget('biding', name)).value;
                const lastBid = (await bidKV.get(name)).value;
                if (lastBid.caller !== info.publisher) { //  否则流标
                    await context.transferTo(info.publisher, lastBid.value);
                    // 存储本次拍卖的结果
                    info.owner = lastBid.caller;
                    info.value = lastBid.value;
                }
                await bidInfoKV.hdel('biding', name);
                await bidInfoKV.hset('finish', name, info);
                // 清理掉不需要的数据
                await bidKV.hclean(name);
            }
            else {
                break;
            }
        } while (true);
        return client_1.ErrorCode.RESULT_OK;
    });
    // 查询指定name的拍卖信息
    handler.addViewMethod('GetBidInfo', async (context, params) => {
        let value = {};
        let bidInfoKV = (await context.storage.getReadableKeyValue('bidInfo')).kv;
        let bidKV = (await context.storage.getReadableKeyValue('bid')).kv;
        let bid = await bidKV.get(params.name);
        let bidInfo = await bidInfoKV.hget(bid.err === client_1.ErrorCode.RESULT_NOT_FOUND ? 'finish' : 'biding', params.name);
        if (bidInfo.err !== client_1.ErrorCode.RESULT_OK) {
            return;
        }
        value = bidInfo.value;
        value.name = params.name;
        if (!bidInfo.value.owner) {
            value.bidder = bid.value.caller;
            value.bidvalue = bid.value.value;
        }
        return value;
    });
    // 查询所有正在拍卖的name的信息
    handler.addViewMethod('GetAllBiding', async (context, params) => {
        let ret = [];
        let bidInfoKV = (await context.storage.getReadableKeyValue('bidInfo')).kv;
        let bidKV = (await context.storage.getReadableKeyValue('bid')).kv;
        let rets = await bidInfoKV.hgetall('biding');
        if (rets.err === client_1.ErrorCode.RESULT_OK) {
            for (const { key, value } of rets.value) {
                let i = value;
                i.name = key;
                let bid = await bidKV.get(key);
                i.bidder = bid.value.caller;
                i.bidvalue = bid.value.value;
                ret.push(i);
            }
        }
        return ret;
    });
    // 查询所有拍卖完成name的信息
    handler.addViewMethod('GetAllFinished', async (context, params) => {
        let ret = [];
        let bidInfoKV = (await context.storage.getReadableKeyValue('bidInfo')).kv;
        let rets = await bidInfoKV.hgetall('finish');
        if (rets.err === client_1.ErrorCode.RESULT_OK) {
            for (const { key, value } of rets.value) {
                let i = value;
                i.name = key;
                ret.push(i);
            }
        }
        return ret;
    });
}
exports.registerHandler = registerHandler;
