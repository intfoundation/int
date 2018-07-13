"use strict";

let sqlite3 = require('sqlite3');
const digest = require('../chainlib/Crypto/digest');
const {BaseLib} = require('../base/base');
const path = require('path');

const SQL_INIT_RESP = `
    CREATE TABLE IF NOT EXISTS checkresp (
        "metasig" CHAR(128),
        "pid" CHAR(128),
        "sig" CHAR(128),
        "resp" TEXT,
        "createdtime" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY ("metasig", "pid")
    );
`;

const SQL_INIT_CHECK = `
    CREATE TABLE IF NOT EXISTS checkreq (
        "metasig" CHAR(128),
        "txhash" CHAR(64),
        "group" TEXT,
        "createdtime" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY ("metasig")
    );
`;

const SQL_INSERT_CHECK = `
    INSERT INTO checkreq ("metasig", "txhash", "group") VALUES (?, ?, ?);
`;

const SQL_INSERT_RESP = `
    INSERT INTO checkresp ("metasig", "pid", "sig", "resp") VALUES (?, ?, ?, ?);
`;

const SQL_SELECT_CHECK = `
    SELECT * FROM checkreq;
`;

const SQL_SELECT_RESP = `
    SELECT * FROM checkresp WHERE metasig=?;
`;

const SQL_DELETE_RESP = `
    DELETE FROM checkresp WHERE metasig=?;
`;

class WageDB {
    constructor(path) {
        this.m_path = path;
    }

    async init() {
        await this._createCheckTable();
        await this._createRespTable();
    }

    async _createRespTable() {
        BaseLib.mkdirsSync(path.dirname(this.m_path));
        return new Promise((resolve) => {
            this.m_db = new sqlite3.Database(this.m_path, (error) => {
                if (error === null) {
                    this.m_db.run(SQL_INIT_RESP, (err) => {
                        resolve(err === null);
                    });
                } else {
                    resolve(false);
                }
            });
        });
    }

    async _createCheckTable() {
        BaseLib.mkdirsSync(path.dirname(this.m_path));
        return new Promise((resolve) => {
            this.m_db = new sqlite3.Database(this.m_path, (error) => {
                if (error === null) {
                    this.m_db.run(SQL_INIT_CHECK, (err) => {
                        resolve(err === null);
                    });
                } else {
                    resolve(false);
                }
            });
        });
    }

    async setCheck(sig, txHash, group) {
        return new Promise((resolve) => {
            this.m_db.run(SQL_INSERT_CHECK, [sig, txHash, group], (err) => {
                resolve(err === null);
            });
        });
    }

    async setResp(metasig, pid, sig, resp) {
        return new Promise((resolve) => {
            this.m_db.run(SQL_INSERT_RESP, [metasig, pid, sig, resp], (err) => {
                resolve(err === null);
            });
        });
    }

    async getChecks() {
        return new Promise((resolve) => {
            this.m_db.all(SQL_SELECT_CHECK, (err, rows) => {
                resolve(rows);
            });
        });
    }

    async getResps(metasig) {
        return new Promise((resolve) => {
            this.m_db.all(SQL_SELECT_RESP, [metasig], (err, rows) => {
                resolve(rows);
            });
        });
    }

    async removeResps(metasig) {
        return new Promise((resolve) => {
            this.m_db.all(SQL_DELETE_RESP, [metasig], (err) => {
                resolve(err === null);
            });
        });
    }

    async removeWage(metasig) {
        let run = async (sql, params) => {
            return new Promise((reslove, reject) => {
                this.m_db.run(sql, params, (err) => {
                    reslove(err);
                });
            });
        };
        await run('BEGIN');
        await run("delete from checkreq where metasig=$metasig",{$metasig:metasig});
        await run("delete from checkresp where metasig=$metasig",{$metasig:metasig});
        await run('COMMIT');
    }

    async getWageProof() {
        let proof = null;
        let checks = await this.getChecks();
        for (let check of checks) {
            let createdtime = new Date(check.createdtime);
            createdtime = createdtime.getTime();
            if (Date.now() - createdtime > 30 * 1000) {
                let resps = await this.getResps(check.metasig);
                if (resps.length > 0) {
                    let answers = new Map();
                    for (let resp of resps) {
                        let respHash = digest.sha1(check.txhash + check.metasig + resp.pid).toString('hex');
                        let answer = JSON.parse(resp.resp);
                        if (respHash === answer.resphash) {
                            answers[resp.pid] = '0';
                        }
                    }
                    proof = {};
                    proof['check'] = check;
                    proof['answer'] = answers;
                    break;
                }
            }
        }
        return proof;
    }
}

module.exports = WageDB;
