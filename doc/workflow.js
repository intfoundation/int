class Storage {
    constructor() {
        this.m_headers = Sqlite(/*
            hash: mainKey
            height: key
            headerData: blob
        */);

        this.m_utxo = Sqlite(/*
            outvec(txid+index): mainKey
            address: key
            outputData: blob
        */);

        this.m_blocks = fs(/*block storage path*/);
    }

    addBlock(block) {
        this.m_headers.add(block.header);
        for(let tx of block.txs) {
            for (let input of tx) {
                this.m_utxo.remove(input);
            }
            for (let output of tx) {
                this.m_utxo.insert(output);
            }
        }
    }

    saveBlock(block) {
        this.m_blocks.add(new file(block));
    }

    addHeader(header) {

    }

    getHeader(fromHeight, toHeight) {

    }

    tipHeight() {
        return this.m_headers.maxHeight();
    }

    hasUTXO(input) {
        return this.m_utxo.select(input);
    }
}




class SuperNode {
    create(address) {
        this.m_address = address;
        this.m_storage = new Storage();
        this.m_metaClient = new MetaClient();
    }

    onTX(tx, sign, from) {
        this.m_metaClient.isMiner(from);
        verifySign(tx, sign, from);
        //verify 
        tx.verifySign();
        tx.verfiyAmount();
        for (let input of tx.input) {
            this.m_storage.hasUTXO();
        }

        let block = new block();
        this.writeToBlock(tx);
        this.signBlockHeader(block.header, this.m_address);
        this.m_storage.addBlock(block);
        this.m_storage.saveBlock(block);

        this.broadcastGetHeader(this.m_storage.getHeaders(block.height - someheight, block.height));
    }
}

class MinerNode {
    constructor(address) {
        this.m_address = address;
        this.m_storage = new Storage();
        this.m_metaClient = new MetaClient();
    }

    create() {
        let superNode = this.connectToSuperNode();
        let headers = superNode.getHeaders(this.m_storage.tipHeight);
        let oldHeight = this.m_storage.tipHeight;
        if (headers) {
            for (let header in headers) {
                header.verifySign(this.m_metaClient.getSuperNodeAddress());
                this.m_storage.addHeader();
            }
        }
        this.broadcastGetBlock(oldHeight + 1, this.m_storage.tipHeight);
    }

    onBlock(block) {
        this.m_storage.getHeaders(block.height).verifyBlock(block);
        this.m_storage.addBlock(block);
        if (this.m_metaClient.isBlockInGroup(this.m_address)) {
            this.m_storage.saveBlock(block);
        }
    }


    onTX(tx) {
        let superNode = this.connectToSuperNode();
        let sign = sign(tx, this.m_address);
        superNode.onTX(tx, sign, this.m_address);
    }
}

class MetaClient {
    getSuperNodeAddress() {
        
    }

    isBlockInGroup(address) {

    }
}


let superNode = new SuperNode();

let miners = [new MinerNode(), ...];




