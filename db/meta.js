"use strict";

const BaseDB = require('./basedb');
const digest = require('../chainlib/Crypto/digest');

const initGroupSql = 'CREATE TABLE if not exists "GroupInfo"("hash" VARCHAR PRIMARY KEY NOT NULL UNIQUE, "members" VARCHAR NOT NULL);';
const initMembersSql = 'CREATE TABLE if not exists "Members"("member" VARCHAR NOT NULL UNIQUE, "groupHash" VARCHAR NOT NULL);';
const getGroupsSql = 'select * from GroupInfo where hash = (select groupHash from Members where member = $peerid)';
const insertGroupSql = 'insert into GroupInfo values($hash, $members)';
const insertMembersSql = 'insert into Members values($member, $groupHash)';

const deleteGroupSql = 'delete from GroupInfo';
const deleteMemberSql = 'delete from Members';

class MetaDB extends BaseDB {
    constructor(path) {
        super(path);
    }

    async init() {
        await this._open();
        await this._initGroup();
        await this._initMembers();
    }

    async _initGroup() {
        return await this._run(initGroupSql);
    }

    async _initMembers() {
        return await this._run(initMembersSql);
    }

    async getGroupsFromPeerid(peerid) {
        let row = await this._get(getGroupsSql, { $peerid: peerid });
        return row ? [row.hash, JSON.parse(row.members)] : [null, null];
    }

    async deleteGroups() {
        await this._run(deleteGroupSql);
        await this._run(deleteMemberSql);
    }

    async setGroups(members) {
        let memberJSON = JSON.stringify(members);
        let gid = digest.sha1(memberJSON).toString('hex');
        await this._run(insertGroupSql, { $hash: gid, $members: memberJSON });
        let ops = [];
        for (const address of members) {
            ops.push(this._run(insertMembersSql, { $member: address, $groupHash: gid }));
        }
        await Promise.all(ops);
    }

    async clearGroupInfoTable() {
        await this.BeginTranscation();
        await this._run("delete from [GroupInfo] where hash in (select hash from [GroupInfo] where hash not in (select groupHash from [members]));");
        await this.CommitTranscation();
    }

    async updateGroups(members) {
        members.sort((a, b) => {
            if (a > b) {
                return -1;
            } else if (a === b) {
                return 0;
            } else {
                return 1;
            }
        });
        let memberJSON = JSON.stringify(members);
        let gid = digest.sha1(memberJSON).toString('hex');
        
        await this.BeginTranscation();

        for (const address of members) {
            let row = await this._get("select member from Members where member=$members", { $members: address });
            if (!row) {
               let r= await this._run("insert into Members('member','groupHash') values ($member,$groupHash)", { $member: address, $groupHash: gid });
               let i=0;
            }
            else {
                await this._run("update Members set groupHash=$groupHash where member=$member", { $member: address, $groupHash: gid });
            }
        }

        let row = await this._get("select hash from GroupInfo where hash=$hash", { $hash: gid });
        if (!row) {
            await this._run("insert into GroupInfo('hash','members') values ($hash,$members)", { $hash: gid, $members: memberJSON });
        }
        else {
            await this._run("update GroupInfo set members=$members where hash=$hash", { $member: members, $hash: gid });
        }

        await this.CommitTranscation();
    }
}

module.exports = MetaDB;