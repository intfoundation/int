"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const error_code_1 = require("../error_code");
const executor_routine_1 = require("./executor_routine");
class InprocessRoutineManager {
    constructor(chain) {
        this.m_chain = chain;
    }
    create(options) {
        const routine = new InprogressRoutine({
            name: options.name,
            chain: this.m_chain,
            block: options.block,
            storage: options.storage
        });
        return { err: error_code_1.ErrorCode.RESULT_OK, routine };
    }
}
exports.InprocessRoutineManager = InprocessRoutineManager;
class InprogressRoutine extends executor_routine_1.BlockExecutorRoutine {
    constructor(options) {
        super({
            name: options.name,
            logger: options.chain.logger,
            block: options.block,
            storage: options.storage
        });
        this.m_state = executor_routine_1.BlockExecutorRoutineState.init;
        this.m_cancelSet = false;
        this.m_canceled = false;
        this.m_chain = options.chain;
    }
    async execute() {
        if (this.m_state !== executor_routine_1.BlockExecutorRoutineState.init) {
            return { err: error_code_1.ErrorCode.RESULT_INVALID_STATE };
        }
        this.m_state = executor_routine_1.BlockExecutorRoutineState.running;
        let ner = await this._newBlockExecutor(this.block, this.storage);
        if (ner.err) {
            this.m_state = executor_routine_1.BlockExecutorRoutineState.finished;
            return { err: ner.err };
        }
        const err = await ner.executor.execute();
        if (this.m_cancelSet && !this.m_canceled) {
            this.m_canceled = true;
        }
        this.m_state = executor_routine_1.BlockExecutorRoutineState.finished;
        if (this.m_canceled) {
            return { err: error_code_1.ErrorCode.RESULT_CANCELED };
        }
        else {
            return { err: error_code_1.ErrorCode.RESULT_OK, result: { err } };
        }
    }
    async verify() {
        if (this.m_state !== executor_routine_1.BlockExecutorRoutineState.init) {
            return { err: error_code_1.ErrorCode.RESULT_INVALID_STATE };
        }
        this.m_state = executor_routine_1.BlockExecutorRoutineState.running;
        let ner = await this._newBlockExecutor(this.block, this.storage);
        if (ner.err) {
            this.m_state = executor_routine_1.BlockExecutorRoutineState.finished;
            return { err: ner.err };
        }
        const result = await ner.executor.verify();
        if (this.m_cancelSet && !this.m_canceled) {
            this.m_canceled = true;
        }
        this.m_state = executor_routine_1.BlockExecutorRoutineState.finished;
        if (this.m_canceled) {
            return { err: error_code_1.ErrorCode.RESULT_CANCELED };
        }
        else {
            return { err: error_code_1.ErrorCode.RESULT_OK, result };
        }
    }
    cancel() {
        if (this.m_state === executor_routine_1.BlockExecutorRoutineState.finished) {
            return;
        }
        else if (this.m_state === executor_routine_1.BlockExecutorRoutineState.init) {
            this.m_state = executor_routine_1.BlockExecutorRoutineState.finished;
            return;
        }
        this.m_cancelSet = true;
    }
    async _newBlockExecutor(block, storage) {
        let nber = await this.m_chain.newBlockExecutor(block, storage);
        if (nber.err) {
            this.m_canceled = true;
            return nber;
        }
        let executor = nber.executor;
        const originExecuteBlockEvent = executor.executeBlockEvent;
        executor.executeBlockEvent = async (listener) => {
            if (this.m_cancelSet) {
                return { err: error_code_1.ErrorCode.RESULT_CANCELED };
            }
            return originExecuteBlockEvent.bind(executor)(listener);
        };
        const originExecuteTransaction = executor.executeTransaction;
        executor.executeTransaction = async (tx, flag) => {
            if (this.m_cancelSet) {
                this.m_canceled = true;
                return { err: error_code_1.ErrorCode.RESULT_CANCELED };
            }
            return originExecuteTransaction.bind(executor)(tx, flag);
        };
        return { err: error_code_1.ErrorCode.RESULT_OK, executor };
    }
}
