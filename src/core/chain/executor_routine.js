"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var BlockExecutorRoutineState;
(function (BlockExecutorRoutineState) {
    BlockExecutorRoutineState[BlockExecutorRoutineState["init"] = 0] = "init";
    BlockExecutorRoutineState[BlockExecutorRoutineState["running"] = 1] = "running";
    BlockExecutorRoutineState[BlockExecutorRoutineState["finished"] = 2] = "finished";
})(BlockExecutorRoutineState = exports.BlockExecutorRoutineState || (exports.BlockExecutorRoutineState = {}));
class BlockExecutorRoutine {
    constructor(options) {
        this.m_logger = options.logger;
        this.m_block = options.block;
        this.m_storage = options.storage;
        this.m_name = options.name;
    }
    get name() {
        return this.m_name;
    }
    get block() {
        return this.m_block;
    }
    get storage() {
        return this.m_storage;
    }
}
exports.BlockExecutorRoutine = BlockExecutorRoutine;
