"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const worker_1 = require("./worker");
const error_code_1 = require("../error_code");
class Workpool {
    constructor(workerfile, size) {
        this.file = workerfile;
        this.size = size;
        this.workers = new Array(this.size);
    }
    push(params, callback) {
        //找一个空闲的worker
        for (let index = 0; index < this.workers.length; index++) {
            if (!this.workers[index]) {
                //run for worker
                let workerParam = JSON.stringify(params);
                this.workers[index] = new worker_1.Worker(this.file, workerParam);
                this.workers[index].on('exit', (code, signal) => {
                    callback(code, signal, this.workers[index].data);
                    this.workers[index] = undefined;
                });
                this.workers[index].run();
                return error_code_1.ErrorCode.RESULT_OK;
            }
        }
        return error_code_1.ErrorCode.RESULT_NOT_FOUND;
    }
    stop() {
        for (let index = 0; index < this.workers.length; index++) {
            if (this.workers[index]) {
                this.workers[index].destory();
                //this.workers[index] = undefined;
            }
        }
    }
}
exports.Workpool = Workpool;
