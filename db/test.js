"use strict";

let wage = require("./wage.js")

async function test() {
    await wage.insertSupervisorProof("ssss_asdfasdf", "supervisor");
    await wage.insertWorkerProof("wwww_asdfasdf", "qiuqiu", "worker");
    let m = await wage.getAllData();
    console.log(m);
    m = await wage.getValidProoves();
    console.log(m);
}

test()
