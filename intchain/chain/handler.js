"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("../../src/client");
const txPendingChecker = require("../../src/core/chain/tx_pending_checker");
const core_1 = require("../../src/core");
function registerHandler(handler) {
    handler.genesisListener = async (context) => {
        await context.storage.createKeyValue('lock');
        await context.storage.createKeyValue('token');
        return client_1.ErrorCode.RESULT_OK;
    };
    handler.onMinerWage(async (height) => {
        return new client_1.BigNumber(0);
    });
    handler.addViewMethod('getBalance', async (context, params) => {
        return await context.getBalance(params.address);
    });
    // handler.addViewMethod('isMiner', async (context: DbftViewContext, params: any): Promise<boolean> => {
    //     return await context.isMiner(params.address);
    // });
    handler.addTX('transferTo', async (context, params) => {
        let err = context.cost(context.totallimit.times(context.price));
        if (err) {
            return err;
        }
        return await context.transferTo(params.to, context.value);
    }, txPendingChecker.transferToChecker);
    handler.addTX('register', async (context, params) => {
        let err = context.cost(context.totallimit.times(context.price));
        if (err) {
            return err;
        }
        return await context.register(context.caller);
    }, txPendingChecker.registerChecker);
    // handler.addTX('unregister', async (context: DbftTransactionContext, params: any): Promise<ErrorCode> => {
    //     let err = context.cost(context.totallimit.times(context.price));
    //     if (err) {
    //         return err;
    //     }
    //     return await context.unregister(context.caller, params.address);
    // });
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
    handler.addTX('vote', async (context, params) => {
        let err = context.cost(context.totallimit.times(context.price));
        if (err) {
            return err;
        }
        return await context.vote(context.caller, params.candidates);
    }, txPendingChecker.voteChecker);
    handler.addViewMethod('getVote', async (context, params) => {
        return await context.getVote();
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
    async function getTokenBalance(balanceKv, tokenid, address) {
        let retInfo = await balanceKv.hget(tokenid, address);
        return retInfo.err === client_1.ErrorCode.RESULT_OK ? retInfo.value : new client_1.BigNumber(0);
    }
    handler.addTX('createToken', async (context, params) => {
        let err = context.cost(context.totallimit.times(context.price));
        if (err) {
            return err;
        }
        let kvRet = await context.storage.createKeyValue('token');
        if (kvRet.err) {
            return kvRet.err;
        }
        await kvRet.kv.hset(params.tokenid, 'creator', context.caller);
        await kvRet.kv.hset(params.tokenid, 'name', params.name);
        await kvRet.kv.hset(params.tokenid, 'symbol', params.symbol);
        await kvRet.kv.hset(params.tokenid, 'supply', new client_1.BigNumber(params.amount));
        await kvRet.kv.hset(params.tokenid, context.caller, new client_1.BigNumber(params.amount));
        return client_1.ErrorCode.RESULT_OK;
    }, txPendingChecker.createTokenChecker);
    handler.addTX('transferTokenTo', async (context, params) => {
        let err = context.cost(context.totallimit.times(context.price));
        if (err) {
            return err;
        }
        let tokenkv = await context.storage.getReadWritableKeyValue('token');
        if (tokenkv.err) {
            return tokenkv.err;
        }
        let fromInfo = await tokenkv.kv.hget(params.tokenid, `freeze^${context.caller}`);
        if (fromInfo.err === client_1.ErrorCode.RESULT_OK && fromInfo.value === true) {
            return client_1.ErrorCode.RESULT_IS_FROZEN;
        }
        else if (fromInfo.err === client_1.ErrorCode.RESULT_EXCEPTION) {
            return client_1.ErrorCode.RESULT_EXCEPTION;
        }
        // let toInfo = await tokenkv.kv!.hget(params.tokenid,`freeze^${params.to}`);
        // if (toInfo.err === ErrorCode.RESULT_OK && toInfo.value === true) {
        //     return ErrorCode.RESULT_IS_FROZEN;
        // } else if (toInfo.err === ErrorCode.RESULT_EXCEPTION) {
        //     return ErrorCode.RESULT_EXCEPTION
        // }
        let fromTotal = await getTokenBalance(tokenkv.kv, params.tokenid, context.caller);
        let amount = new client_1.BigNumber(params.amount);
        if (fromTotal.lt(amount)) {
            return client_1.ErrorCode.RESULT_NOT_ENOUGH;
        }
        let remainingFrom = fromTotal.minus(amount);
        if (remainingFrom.gt(new client_1.BigNumber(0))) {
            await tokenkv.kv.hset(params.tokenid, context.caller, fromTotal.minus(amount));
        }
        else {
            await tokenkv.kv.hdel(params.tokenid, context.caller);
        }
        await (tokenkv.kv.hset(params.tokenid, params.to, (await getTokenBalance(tokenkv.kv, params.tokenid, params.to)).plus(amount)));
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
        let tokenkv = await context.storage.getReadWritableKeyValue('token');
        if (tokenkv.err) {
            return tokenkv.err;
        }
        let fromInfo = await tokenkv.kv.hget(params.tokenid, `freeze^${params.from}`);
        if (fromInfo.err === client_1.ErrorCode.RESULT_OK && fromInfo.value === true) {
            return client_1.ErrorCode.RESULT_IS_FROZEN;
        }
        else if (fromInfo.err === client_1.ErrorCode.RESULT_EXCEPTION) {
            return client_1.ErrorCode.RESULT_EXCEPTION;
        }
        // let toInfo = await tokenkv.kv!.hget(params.tokenid,`freeze^${params.to}`);
        // if (toInfo.err === ErrorCode.RESULT_OK && toInfo.value === true) {
        //     return ErrorCode.RESULT_IS_FROZEN;
        // } else if (toInfo.err === ErrorCode.RESULT_EXCEPTION) {
        //     return ErrorCode.RESULT_EXCEPTION
        // }
        let callerInfo = await tokenkv.kv.hget(params.tokenid, `freeze^${context.caller}`);
        if (callerInfo.err === client_1.ErrorCode.RESULT_OK && callerInfo.value === true) {
            return client_1.ErrorCode.RESULT_IS_FROZEN;
        }
        else if (callerInfo.err === client_1.ErrorCode.RESULT_EXCEPTION) {
            return client_1.ErrorCode.RESULT_EXCEPTION;
        }
        let callerApproval = await tokenkv.kv.hget(params.tokenid, `approval^${params.from}`);
        if (callerApproval.err !== client_1.ErrorCode.RESULT_OK) {
            return callerApproval.err;
        }
        let callerMap = core_1.MapFromObject(callerApproval.value);
        if (!callerMap.has(context.caller)) {
            return client_1.ErrorCode.RESULT_NOT_FOUND;
        }
        if (callerMap.get(context.caller).lt(amount)) {
            return client_1.ErrorCode.RESULT_NOT_ENOUGH;
        }
        let fromBalance = await getTokenBalance(tokenkv.kv, params.tokenid, params.from);
        if (fromBalance.lt(amount)) {
            return client_1.ErrorCode.RESULT_NOT_ENOUGH;
        }
        let toBalance = await getTokenBalance(tokenkv.kv, params.tokenid, params.to);
        let remainingAmount = callerMap.get(context.caller).minus(amount);
        if (remainingAmount.gt(new client_1.BigNumber(0))) {
            callerMap.set(context.caller, remainingAmount);
            await tokenkv.kv.hset(params.tokenid, `approval^${params.from}`, core_1.MapToObject(callerMap));
        }
        else {
            callerMap.delete(context.caller);
            if (callerMap.size === 0) {
                await tokenkv.kv.hdel(params.tokenid, `approval^${params.from}`);
            }
            else {
                await tokenkv.kv.hset(params.tokenid, `approval^${params.from}`, core_1.MapToObject(callerMap));
            }
        }
        let remainingFrom = fromBalance.minus(amount);
        if (remainingFrom.gt(new client_1.BigNumber(0))) {
            await tokenkv.kv.hset(params.tokenid, params.from, remainingFrom);
        }
        else {
            await tokenkv.kv.hdel(params.tokenid, params.from);
        }
        await tokenkv.kv.hset(params.tokenid, params.to, toBalance.plus(amount));
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
        let tokenkv = await context.storage.getReadWritableKeyValue('token');
        if (tokenkv.err) {
            return tokenkv.err;
        }
        let fromInfo = await tokenkv.kv.hget(params.tokenid, `freeze^${context.caller}`);
        if (fromInfo.err === client_1.ErrorCode.RESULT_OK && fromInfo.value === true) {
            return client_1.ErrorCode.RESULT_IS_FROZEN;
        }
        else if (fromInfo.err === client_1.ErrorCode.RESULT_EXCEPTION) {
            return client_1.ErrorCode.RESULT_EXCEPTION;
        }
        let senderBalance = await getTokenBalance(tokenkv.kv, params.tokenid, context.caller);
        if (senderBalance.lt(amount)) {
            return client_1.ErrorCode.RESULT_NOT_ENOUGH;
        }
        let senderApproval = await tokenkv.kv.hget(params.tokenid, `approval^${context.caller}`);
        if (senderApproval.err === client_1.ErrorCode.RESULT_OK) {
            let senderMap = core_1.MapFromObject(senderApproval.value);
            if (senderMap.size < 20) {
                senderMap.set(spender, amount);
                let senderObj = core_1.MapToObject(senderMap);
                await tokenkv.kv.hset(params.tokenid, `approval^${context.caller}`, senderObj);
            }
            else {
                return client_1.ErrorCode.RESULT_OUT_OF_RANGE;
            }
        }
        else if (senderApproval.err === client_1.ErrorCode.RESULT_NOT_FOUND) {
            let approvalMap = new Map();
            approvalMap.set(spender, amount);
            let approvalObj = core_1.MapToObject(approvalMap);
            await tokenkv.kv.hset(params.tokenid, `approval^${context.caller}`, approvalObj);
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
        let tokenkv = await context.storage.getReadWritableKeyValue('token');
        if (tokenkv.err) {
            return tokenkv.err;
        }
        let ret = await tokenkv.kv.hget(params.tokenid, 'creator');
        if (ret.err !== client_1.ErrorCode.RESULT_OK) {
            return ret.err;
        }
        let owner = ret.value;
        if (owner !== context.caller) {
            return client_1.ErrorCode.RESULT_NO_PERMISSIONS;
        }
        let isFrozen = await tokenkv.kv.hget(params.tokenid, `freeze^${freezeAddress}`);
        if (isFrozen.err === client_1.ErrorCode.RESULT_OK && !freeze) {
            await tokenkv.kv.hdel(params.tokenid, `freeze^${freezeAddress}`);
        }
        else if (freeze) {
            await tokenkv.kv.hset(params.tokenid, `freeze^${freezeAddress}`, freeze);
        }
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
        let tokenkv = await context.storage.getReadWritableKeyValue('token');
        if (tokenkv.err) {
            return tokenkv.err;
        }
        let callerInfo = await tokenkv.kv.hget(params.tokenid, `freeze^${context.caller}`);
        if (callerInfo.err === client_1.ErrorCode.RESULT_OK && callerInfo.value === true) {
            return client_1.ErrorCode.RESULT_IS_FROZEN;
        }
        else if (callerInfo.err === client_1.ErrorCode.RESULT_EXCEPTION) {
            return client_1.ErrorCode.RESULT_EXCEPTION;
        }
        let totalSupply = await tokenkv.kv.hget(params.tokenid, 'supply');
        let callerBalance = await getTokenBalance(tokenkv.kv, params.tokenid, context.caller);
        if (totalSupply.err !== client_1.ErrorCode.RESULT_OK) {
            return totalSupply.err;
        }
        if (callerBalance.lt(burnAmount)) {
            return client_1.ErrorCode.RESULT_NOT_ENOUGH;
        }
        await tokenkv.kv.hset(params.tokenid, 'supply', totalSupply.value.minus(burnAmount));
        let remainCaller = callerBalance.minus(burnAmount);
        if (remainCaller.gt(new client_1.BigNumber(0))) {
            await tokenkv.kv.hset(params.tokenid, context.caller, remainCaller);
        }
        else {
            await tokenkv.kv.hdel(params.tokenid, context.caller);
        }
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
        let tokenkv = await context.storage.getReadWritableKeyValue('token');
        if (tokenkv.err) {
            return tokenkv.err;
        }
        let callerInfo = await tokenkv.kv.hget(params.tokenid, `freeze^${context.caller}`);
        if (callerInfo.err === client_1.ErrorCode.RESULT_OK && callerInfo.value === true) {
            return client_1.ErrorCode.RESULT_IS_FROZEN;
        }
        else if (callerInfo.err === client_1.ErrorCode.RESULT_EXCEPTION) {
            return client_1.ErrorCode.RESULT_EXCEPTION;
        }
        let ret = await tokenkv.kv.hget(params.tokenid, 'creator');
        if (ret.err !== client_1.ErrorCode.RESULT_OK) {
            return ret.err;
        }
        let owner = ret.value;
        if (owner !== context.caller) {
            return client_1.ErrorCode.RESULT_NO_PERMISSIONS;
        }
        let totalSupply = await tokenkv.kv.hget(params.tokenid, 'supply');
        let ownerBalance = await getTokenBalance(tokenkv.kv, params.tokenid, owner);
        if (totalSupply.err !== client_1.ErrorCode.RESULT_OK) {
            return totalSupply.err;
        }
        let newSupply = totalSupply.value.plus(mintAmount);
        if (newSupply.gt(new client_1.BigNumber(1e+36))) {
            return client_1.ErrorCode.RESULT_OUT_OF_RANGE;
        }
        await tokenkv.kv.hset(params.tokenid, 'supply', newSupply);
        await tokenkv.kv.hset(params.tokenid, owner, ownerBalance.plus(mintAmount));
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
        let tokenkv = await context.storage.getReadWritableKeyValue('token');
        if (tokenkv.err) {
            return tokenkv.err;
        }
        let callerInfo = await tokenkv.kv.hget(params.tokenid, `freeze^${context.caller}`);
        if (callerInfo.err === client_1.ErrorCode.RESULT_OK && callerInfo.value === true) {
            return client_1.ErrorCode.RESULT_IS_FROZEN;
        }
        else if (callerInfo.err === client_1.ErrorCode.RESULT_EXCEPTION) {
            return client_1.ErrorCode.RESULT_EXCEPTION;
        }
        let ret = await tokenkv.kv.hget(params.tokenid, 'creator');
        if (ret.err !== client_1.ErrorCode.RESULT_OK) {
            return ret.err;
        }
        let owner = ret.value;
        let newOwner = params.newOwner;
        if (owner === context.caller) {
            await tokenkv.kv.hset(params.tokenid, 'creator', newOwner);
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
        let balancekv = await context.storage.getReadableKeyValue('token');
        let retInfo = await balancekv.kv.hget(params.tokenid, 'supply');
        return retInfo.err === client_1.ErrorCode.RESULT_OK ? retInfo.value : new client_1.BigNumber(0);
    });
    handler.addViewMethod('getTokenBalance', async (context, params) => {
        let balancekv = await context.storage.getReadableKeyValue('token');
        return await getTokenBalance(balancekv.kv, params.tokenid, params.address);
    });
    /**
     * 发布锁仓合约
     * */
    handler.addTX('lockAccount', async (context, params) => {
        let err = context.cost(context.totallimit.times(context.price));
        if (err) {
            return err;
        }
        let lockkv = await context.storage.getReadWritableKeyValue('lock');
        if (lockkv.err) {
            return lockkv.err;
        }
        await lockkv.kv.hset(params.contractid, params.lockaddress, params.schedule);
        err = await context.transferTo(params.contractid, context.value);
        if (err) {
            return err;
        }
        return client_1.ErrorCode.RESULT_OK;
    }, txPendingChecker.lockAccountChecker);
    /**
     * 调用锁仓合约
     * */
    handler.addTX('transferFromLockAccount', async (context, params) => {
        let err = context.cost(context.totallimit.times(context.price));
        if (err) {
            return err;
        }
        let lockBalance = await context.getBalance(params.contractid);
        let unlockBalance = new client_1.BigNumber(0);
        let lockkv = await context.storage.getReadWritableKeyValue('lock');
        if (lockkv.err) {
            return lockkv.err;
        }
        let ret = await lockkv.kv.hget(params.contractid, context.caller);
        if (ret.err) {
            return ret.err;
        }
        let schedule = ret.value;
        let nowTime = Date.now();
        schedule.forEach((value, index) => {
            if (nowTime >= value.time) {
                unlockBalance = unlockBalance.plus(new client_1.BigNumber(value.value));
                schedule.splice(index, 1);
            }
        });
        if (unlockBalance.isEqualTo(new client_1.BigNumber(0))) {
            return client_1.ErrorCode.RESULT_UNLOCK_ZERO;
        }
        if (schedule.length === 0) {
            await lockkv.kv.hdel(params.contractid, context.caller);
        }
        else {
            await lockkv.kv.hset(params.contractid, context.caller, schedule);
        }
        if (lockBalance.gte(unlockBalance)) {
            err = await context.transferTo(params.contractid, new client_1.BigNumber(-unlockBalance));
            if (err) {
                return err;
            }
            err = await context.transferTo(context.caller, new client_1.BigNumber(unlockBalance));
            if (err) {
                return err;
            }
        }
        else {
            return client_1.ErrorCode.RESULT_NOT_ENOUGH;
        }
        return client_1.ErrorCode.RESULT_OK;
    }, txPendingChecker.transferFromLockAccountChecker);
}
exports.registerHandler = registerHandler;
