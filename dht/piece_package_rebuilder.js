'use strict';

const Base = require('../base/base.js');
const DHTPackageFactory = require('./package_factory.js');
const {Config} = require('./util.js');

const PackageConfig = Config.Package;

const LOG_INFO = Base.BX_INFO;
const LOG_WARN = Base.BX_WARN;
const LOG_DEBUG = Base.BX_DEBUG;
const LOG_CHECK = Base.BX_CHECK;
const LOG_ASSERT = Base.BX_ASSERT;
const LOG_ERROR = Base.BX_ERROR;

class PiecePackageRebuilder {
    constructor() {
        this.m_packageRebuildingPeerTaskMgrs = new Map();
    }

    onGotNewPiece(splitPackageReq) {
        let peerid = splitPackageReq.body.peerid;
        let rebuildingTaskMgr = this.m_packageRebuildingPeerTaskMgrs.get(peerid);
        if (!rebuildingTaskMgr) {
            rebuildingTaskMgr = new PackageRebuildingPeerTaskMgr(peerid);
            this.m_packageRebuildingPeerTaskMgrs.set(peerid, rebuildingTaskMgr);
        }

        let originalPackageBuffer = rebuildingTaskMgr.onGotNewPiece(splitPackageReq);
        if (originalPackageBuffer) {
            if (rebuildingTaskMgr.taskCount === 0) {
                this.m_packageRebuildingPeerTaskMgrs.delete(peerid);
            }
            return originalPackageBuffer;
        }
        return null;
    }

    clearTimeoutTasks() {
        let emptyPeerids = [];

        this.m_packageRebuildingPeerTaskMgrs.forEach((rebuildingTaskMgr, peerid) => {
            rebuildingTaskMgr.clearTimeoutTasks();
            if (rebuildingTaskMgr.taskCount === 0) {
                emptyPeerids.push(peerid);
            }
        });

        emptyPeerids.forEach(peerid => this.m_packageRebuildingPeerTaskMgrs.delete(peerid));
    }
}

class PackageRebuildingPeerTaskMgr {
    constructor(peerid) {
        this.m_tasks = new Map();
    }

    onGotNewPiece(piecePkg) {
        let taskid = piecePkg.body.taskid;
        let task = this.m_tasks.get(taskid);
        if (!task) {
            task = new PackageRebuildingTask(taskid, piecePkg.body.max + 1);
            this.m_tasks.set(taskid, task);
        }

        let originalPackageBuffer = task.onGotNewPiece(piecePkg);
        if (originalPackageBuffer) {
            this.m_tasks.delete(taskid);
            return originalPackageBuffer;
        }
        return null;
    }

    get taskCount() {
        return this.m_tasks.size;
    }

    clearTimeoutTasks() {
        const now = Date.now();
        let timeoutTasks = [];
        this.m_tasks.forEach((task, taskid) => {
            if (task.activeTime > now) {
                task.activeTime = now;
            } else if (now - task.activeTime > PackageConfig.Timeout) {
                timeoutTasks.push(taskid);
            }
        });

        timeoutTasks.forEach(taskid => this.m_tasks.delete(taskid));
    }
}

class PackageRebuildingTask {
    constructor(taskid, pieceCount) {
        this.m_piecePkgs = Array.from({length: pieceCount});
        this.m_gotPieceCount = 0;
        this.m_activeTime = 0;
    }

    onGotNewPiece(piecePkg) {
        this.m_activeTime = Date.now();

        let pieceNo = piecePkg.body.no;
        LOG_ASSERT(piecePkg.body.max + 1 === this.m_piecePkgs.length,
            `Splite package max-no conflict: (max:${piecePkg.body.max}, pieceCount:(${this.m_piecePkgs.length}))`);
        if (!this.m_piecePkgs[pieceNo]) {
            this.m_piecePkgs[pieceNo] = piecePkg;
            this.m_gotPieceCount++;
        }

        if (this.m_gotPieceCount === this.m_piecePkgs.length) {
            let buffers = Array.from({length: this.m_piecePkgs.length});
            this.m_piecePkgs.forEach(piece => buffers[piece.body.no] = piece.body.buf);
            let orignalPkgBuffer = Buffer.concat(buffers);
            return orignalPkgBuffer;
        }
        return null;
    }

    get activeTime() {
        return this.m_activeTime;
    }

    set activeTime(newValue) {
        this.m_activeTime = newValue;
    }
}

module.exports = PiecePackageRebuilder;