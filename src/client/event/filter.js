"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("../../core");
class ChainEventFilter {
    constructor(filters) {
        this.m_filters = filters;
    }
    init() {
        return core_1.ErrorCode.RESULT_OK;
    }
    get(options) {
    }
    watch() {
    }
    stop() {
    }
}
exports.ChainEventFilter = ChainEventFilter;
