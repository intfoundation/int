const sqlite3 = require('sqlite3');
const crypto = require('crypto');
const fs = require('fs');

const initDataSql = 'CREATE TABLE if not exists "InfoDB"("key" VARCHAR PRIMARY KEY NOT NULL UNIQUE, "value" VARCHAR NOT NULL);';
const setDataSql = 'replace into InfoDB values ($key, $value)';
const setDataSql1 = 'insert into InfoDB values ($key, $value)';

async function open(file) {
    return new Promise((reslove, reject) => {
        let db = new sqlite3.Database(file, (error) => {
            reslove([error === null, db]);
        });
    });
}

async function close(db) {
    return new Promise((reslove, reject) => {
        db.close((err) => {
            reslove(err === null);
        });
    });
}

async function run(db, sql, params){
    return new Promise((reslove, reject) => {
        db.run(sql, params, (err) => {
            reslove(err);
        });
    });
}

async function runall(filename) {
    let [ret, db] = await open(filename);
    await run(db, initDataSql);
    await run(db, setDataSql1, { $key: 'a', $value: 'a' });
    await run(db, setDataSql1, { $key: 's', $value: 's' });
    await run(db, setDataSql1, { $key: 'd', $value: 'd' });

    await close(db);
}

function toMD5(file){
    let buffer = fs.readFileSync(file);
    let fsHash = crypto.createHash('md5');

    fsHash.update(buffer);
    return fsHash.digest('hex');
}

async function testall() {
    await runall('./db1.db');
    await runall('./db2.db');
    await runall('./db3.db');

    //test md5
    console.log('file1 md5: %s', toMD5('./db1.db'));
    console.log('file2 md5: %s', toMD5('./db2.db'));
    console.log('file3 md5: %s', toMD5('./db3.db'));

    //fs.unlinkSync('./db1.db');
    //fs.unlinkSync('./db2.db');
    //fs.unlinkSync('./db3.db');
}

testall();