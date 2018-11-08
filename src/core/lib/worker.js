"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const events_1 = require("events");
const child_process_1 = require("child_process");
class Worker extends events_1.EventEmitter {
    constructor(file, params) {
        super();
        this.file = file;
        this.params = params;
        this.data = '';
    }
    run() {
        // 1. 开一个进程，传serverPort, file, params进去
        // 2. 子进程启动，开始运行
        // 3. 函数返回后，子进程
        const bin = process.argv[0];
        const options = { stdio: 'pipe', env: process.env };
        this.child = child_process_1.spawn(bin, [this.file, this.params], options);
        this.child.on('error', (err) => {
            console.error(`child process error! ${err}`);
            this.destory();
        });
        this.child.once('exit', (code, signal) => {
            this.emit('exit', code == null ? -1 : code, signal);
        });
        this.child.stdin.on('error', (err) => {
            console.error(`child process error! ${err}`);
            this.destory();
        });
        this.child.stdout.on('error', (err) => {
            console.error(`child process error! ${err}`);
            this.destory();
        });
        this.child.stderr.on('error', (err) => {
            console.error(`child process error! ${err}`);
            this.destory();
        });
        this.child.stdout.on('data', (data) => {
            this.data += data;
        });
    }
    destory() {
        if (this.child) {
            this.child.kill('SIGTERM');
        }
    }
}
exports.Worker = Worker;
