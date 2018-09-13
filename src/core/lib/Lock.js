"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
class ClassNotfiy {
    constructor(resolve, reject) {
        this.m_resolve = resolve;
        this.m_reject = reject;
    }
    get resolve() {
        return this.m_resolve;
    }
    get reject() {
        return this.m_reject;
    }
}
class Lock {
    constructor() {
        this.m_busy = false;
        this.m_list = [];
    }
    enter() {
        if (this.m_busy) {
            return new Promise((resolve, reject) => {
                this.m_list.push(new ClassNotfiy(resolve, reject));
            });
        }
        this.m_busy = true;
        return Promise.resolve(true);
    }
    leave() {
        this.m_busy = false;
        if (this.m_list.length === 0) {
            return;
        }
        let notifyObj = this.m_list.shift();
        this.m_busy = true;
        notifyObj.resolve(true);
    }
    destory() {
        while (this.m_list.length > 0) {
            this.m_list.shift().reject(false);
        }
    }
}
exports.Lock = Lock;
