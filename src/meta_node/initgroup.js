"use strict";

const MetaDB = require("../db/meta");
const fs = require('fs-extra');
const shuffle = require('shuffle-array');
const Subtract = require('array-subtract');

const _GROUP_USER_COUNT = 128;

/**
 * 
 * @param {MetaDB} db 
 */
async function initGroup(db) {
    let accounts = fs.readJSONSync('./accounts.txt');
    accounts = Array.from(Object.keys(accounts));

    let subtract = new Subtract((a, b) => {
        return a === b;
    });

    await db.BeginTranscation();
    await db.deleteGroups();

    while (accounts.length > 0) {
        let members = shuffle.pick(accounts, { 'picks': _GROUP_USER_COUNT });
        await db.setGroups(members);

        accounts = subtract.sub(accounts, members);
    }

    await db.CommitTranscation();
}

async function init() {
    let metaDB = new MetaDB('./meta.db');
    await metaDB.init();
    await initGroup(metaDB);
}

init().then(()=>{
    console.log('init complete');
    process.exit(0);
});
