"use strict";
// intchuan
const sqlite3 = require('sqlite3');
const path = require('path');
const {BaseLib} = require('../base/base');

class BaseDB {
    constructor(path) {
        this.m_path = path;
    }

    async _open() {
        BaseLib.mkdirsSync(path.dirname(this.m_path));
        return new Promise((reslove, reject) => {
            this.m_db = new sqlite3.Database(this.m_path, (error) => {
                reslove(error === null);
            });
        });
    }

    async BeginTranscation() {
        return await this._run('BEGIN;');
    }

    async CommitTranscation() {
        return await this._run('COMMIT;');
    }

    async RollbackTranscation() {
        return await this._run('ROLLBACK;');
    }

    async _run(sql, params){
        return new Promise((reslove, reject) => {
            this.m_db.run(sql, params, (err) => {
                reslove(err);
            });
        });
    }

    async _get(sql, params) {
        return new Promise((reslove, reject) => {
            this.m_db.get(sql, params, (err, row) => {
                reslove(row);
            });
        });
    }

    async _all(sql, params) {
        return new Promise((reslove, reject) => {
            this.m_db.all(sql, params, (err, rows) => {
                reslove(rows);
            });
        });
    }
}

module.exports = BaseDB;