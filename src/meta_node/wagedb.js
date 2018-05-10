"use strict";

class WageDB {
    constructor() {
        this._mongoClient = require('mongodb').MongoClient;
        this._DB_URL = require('./config').MONGO_URL;
        this._DB_NAME = "meta_node";
        this._GROUP_USER_COUNT = 128;
    }

    async init() {
        let client = await this._mongoClient.connect(this._DB_URL);
        this._collection = client.db(this._DB_NAME).collection('wage');
        try {
            await this._collection.createIndex("pid_block", {unique: true});
            await this._collection.createIndex("block");
            await this._collection.createIndex("gid");
        } catch (err) {
            console.log(err);
        }
    }

    async addProof(pid, block, gid, proof) {
        let ret = true;
        try {
            await this._collection.insertOne({'pid_block': pid + '_' + block, 'block': block, 'gid': gid, 'proof': proof});
        } catch (err) {
            console.log(err);
            if (err.code !== 11000) {
                ret = false;
            }
        }
        return ret;
    }

    async getWage() {
        let block = 0;
        let wage = {};
        // let c = await this._collection.find({'block': 0});
        let docs = await this._collection.distinct('gid', {'block': block});
        for (let gid of docs) {
            let papers = await this._collection.find({'gid': gid, 'block': block}).toArray();
            for (let paper of papers) {
                let pid = paper.pid_block.split('_')[0];
                wage[pid] = 0;
            }
            for (let paper of papers) {
                let pidSupervisor = paper.pid_block.split('_')[0];
                for (let pid in paper.proof) {
                    if (pidSupervisor !== pid) {
                        if (paper.proof.hasOwnProperty(pid)) {
                            if (wage.hasOwnProperty(pid) && paper.proof[pid] === 0) {
                                wage[pid] += 1;
                            }
                        }
                    }
                }
            }
        }
        return wage;
    }
}

module.exports = new WageDB();
