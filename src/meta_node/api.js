"use strict";

let groupDB = require("./groupdb");
let wageDB = require("./wagedb");
let KeyRing = require('../chainlib/Account/keyring');
let metaSecret = '';
let metaKey = KeyRing.fromSecret(metaSecret);

const Koa = require('koa');
const Router = require('koa-router');
const bodyParser = require('koa-bodyparser');

const SuperNodeClient = require('../client/Peer/superNodeClient');
let superNodeClient = new SuperNodeClient('127.0.0.1', require('./config').SUPER_NODE_RPC_PORT);

let _todayBlockHeight = {
    height: 0,
    time: 0,
};

const app = new Koa();
const router = new Router();

async function _updateTodayBlockHeight() {
    let now = Date.now();
    if (now - _todayBlockHeight.time > 24*60*60*1000*1000) {
        _todayBlockHeight.height = await superNodeClient.getNowBlockHeight();
        _todayBlockHeight.time = now;
    }
}

setInterval(async () => {
    await _updateTodayBlockHeight();
}, 1000 * 60 * 60);

router.post('/login', async (ctx) => {
    console.log(ctx.request);
    let pid = ctx.request.body["pid"];
    let ret = await groupDB.getMembers(pid);
    if (ret) {
        let resp = {'block': _todayBlockHeight.height, 'gid': ret.gid, 'members': ret.members};
        resp = JSON.stringify(resp);
        let sig = metaKey.signHash(resp);
        ctx.body = {"sig": sig.toString('hex'), "resp": resp};
    } else {
        ctx.body = {};
    }
});

router.post('/wage', async (ctx) => {
    console.log(ctx.request);
    let sig = ctx.request.body['sig'];
    let msig = ctx.request.body['msig'];
    let group = ctx.request.body['group'];
    group = JSON.parse(group);
    let answer = ctx.request.body['answer'];
    answer = JSON.parse(answer);
    let proof = {};
    for (let member of group['members']) {
        proof[member] = 1;
        if (member in answer) {
            proof[member] = answer[member];
        }
    }
    let pid = ctx.request.body["pid"];
    let ret = await wageDB.addProof(pid, group['block'], group['gid'], proof);
    ctx.body = {"ret": ret};
});

async function init() {
    await groupDB.init();
    await wageDB.init();
    await _updateTodayBlockHeight();
    // await groupDB.initGroup();
    app.use(bodyParser());
    app.use(router.routes());
    app.listen(23333);
}

init().then(()=>{
    console.log("init end");
});
