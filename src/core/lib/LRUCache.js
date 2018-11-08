"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
class LRUNode {
    constructor(value) {
        this.m_next = null;
        this.m_prev = null;
        this.m_v = value;
    }
    set next(node) {
        this.m_next = node;
    }
    get next() {
        return this.m_next;
    }
    set prev(node) {
        this.m_prev = node;
    }
    get prev() {
        return this.m_prev;
    }
    get value() {
        return this.m_v;
    }
}
class DLink {
    constructor() {
        this.m_head = null;
        this.m_tail = null;
        this.m_count = 0;
    }
    get length() {
        return this.m_count;
    }
    get head() {
        return this.m_head;
    }
    get tail() {
        return this.m_tail;
    }
    remove(node) {
        if (this.length === 0) {
            return;
        }
        let prev = node.prev;
        let next = node.next;
        if (prev) {
            prev.next = next;
        }
        if (this.m_head === node) {
            this.m_head = next;
        }
        if (next) {
            next.prev = prev;
        }
        if (this.m_tail === node) {
            this.m_tail = prev;
        }
        this.m_count--;
    }
    addToHead(node) {
        let head = this.m_head;
        node.next = this.m_head;
        if (this.m_head) {
            this.m_head.prev = node;
        }
        this.m_head = node;
        if (this.m_count === 0) {
            this.m_tail = node;
        }
        this.m_count++;
    }
    removeTail() {
        if (this.length === 0) {
            return;
        }
        this.remove(this.m_tail);
    }
    clear() {
        this.m_head = null;
        this.m_tail = null;
        this.m_count = 0;
    }
}
class LRUCache {
    constructor(maxCount) {
        this.m_maxCount = maxCount;
        this.m_memValue = new Map();
        this.m_link = new DLink();
    }
    set(key, value) {
        if (this.m_memValue.has(key)) {
            let [_, node] = this.m_memValue.get(key);
            this.m_link.remove(node);
            this.m_link.addToHead(node);
            this.m_memValue.set(key, [value, node]);
        }
        else {
            if (this.m_link.length >= this.m_maxCount) {
                this.m_link.removeTail();
            }
            let node = new LRUNode(key);
            this.m_link.addToHead(node);
            this.m_memValue.set(key, [value, node]);
        }
    }
    get(key) {
        if (!this.m_memValue.has(key)) {
            return null;
        }
        let [value, _] = this.m_memValue.get(key);
        this.set(key, value);
        return value;
    }
    remove(key) {
        if (!this.m_memValue.has(key)) {
            return;
        }
        let [_, node] = this.m_memValue.get(key);
        this.m_link.remove(node);
        this.m_memValue.delete(key);
    }
    clear() {
        this.m_memValue.clear();
        this.m_link.clear();
    }
    print() {
        let begin = this.m_link.head;
        while (begin) {
            let key = begin.value;
            let [value, _] = this.m_memValue.get(key);
            begin = begin.next;
        }
    }
}
exports.LRUCache = LRUCache;
// let lru: LRUCache<number,string> = new LRUCache<number,string>(5);
// lru.set(1,'a');
// lru.print();
// lru.remove(1);
// lru.print();
// lru.set(1,'a');
// lru.set(2,'b');
// lru.set(3,'c');
// lru.set(4,'d');
// lru.set(5,'e');
// lru.print();
// let s:string|null = lru.get(3);
// lru.print();
// lru.set(6,'f');
// lru.print();
