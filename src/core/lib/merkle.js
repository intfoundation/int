/*!
 * merkle.js - merkle trees for bcoin
 * Copyright (c) 2014-2015, Fedor Indutny (MIT License)
 * Copyright (c) 2014-2017, Christopher Jeffrey (MIT License).
 * https://github.com/bcoin-org/bcoin
 */
'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * @module crypto/merkle
 */
const digest = require("./digest");
/**
 * Build a merkle tree from leaves.
 * Note that this will mutate the `leaves` array!
 * @param {Buffer[]} leaves
 * @returns {Array} [nodes, malleated]
 */
function createTree(leaves) {
    const nodes = leaves;
    let size = leaves.length;
    let malleated = false;
    let i = 0;
    if (size === 0) {
        nodes.push(Buffer.alloc(32));
        return [nodes, malleated];
    }
    while (size > 1) {
        for (let j = 0; j < size; j += 2) {
            const k = Math.min(j + 1, size - 1);
            const left = nodes[i + j];
            const right = nodes[i + k];
            if (k === j + 1 && k + 1 === size
                && left.equals(right)) {
                malleated = true;
            }
            const hash = digest.root256(left, right);
            nodes.push(hash);
        }
        i += size;
        size += 1;
        size >>>= 1;
    }
    return [nodes, malleated];
}
exports.createTree = createTree;
/**
 * Calculate merkle root from leaves.
 * @param {Buffer[]} leaves
 * @returns {Array} [root, malleated]
 */
function createRoot(leaves) {
    const [nodes, malleated] = createTree(leaves);
    const root = nodes[nodes.length - 1];
    return [root, malleated];
}
exports.createRoot = createRoot;
/**
 * Collect a merkle branch from vector index.
 * @param {Number} index
 * @param {Buffer[]} leaves
 * @returns {Buffer[]} branch
 */
function createBranch(index, leaves) {
    let size = leaves.length;
    const [nodes] = createTree(leaves);
    const branch = [];
    let i = 0;
    while (size > 1) {
        const j = Math.min(index ^ 1, size - 1);
        branch.push(nodes[i + j]);
        index >>>= 1;
        i += size;
        size += 1;
        size >>>= 1;
    }
    return branch;
}
exports.createBranch = createBranch;
/**
 * Derive merkle root from branch.
 * @param {Buffer} hash
 * @param {Buffer[]} branch
 * @param {Number} index
 * @returns {Buffer} root
 */
function deriveRoot(hash, branch, index) {
    let root = hash;
    for (const branchHash of branch) {
        if (index & 1) {
            root = digest.root256(branchHash, root);
        }
        else {
            root = digest.root256(root, branchHash);
        }
        index >>>= 1;
    }
    return root;
}
exports.deriveRoot = deriveRoot;
