## INT Chain

Official Node.js implementation of the INT Chain protocol.

### Environment dependence

Building int requires a Node.js (version 8.0 or later).
You can install it from Node.js official website(https://nodejs.org/en/download/).

### Installation Instructions

(1) Clone the repository to a directory of your choosing

    git clone https://github.com/intfoundation/int

(2)  entry into the first level of int project.

    cd .../int
    
(3) install node_modules of int project dependency.
    
    npm install
    
### Start a miner

    node src/tool/startMiner.js --minerSecret ... --coinbase ... .......

    options:
        --minerSecret                    It's required to give signature to block
        --coinbase                       It's required to receive block reward.
                                         Please keep the private key of the coinbase, do not tell others.
        --blocklimit                     The max sum of transactions limit in a block. 
                                         Max value is 80000000,and default value is 50000000.
        --port                           Network communication port of P2P,default value is 8553|8554.
        --loggerLevel                    The log leverl [all, trace, debug, info, warn, error, off]
        --hander                         The location of the handler file, which is the entry of the chain handler

### Start a peer

    node src/tool/startPeer.js .......

    options:
        --test                           Connect the test net
        --main                           Connect the main net
        --dataDir                        Data storage location
        --peerid                         The id of peer
        --loggerConsole                  Print log or not
        --loggerLevel                    The log leverl [all, trace, debug, info, warn, error, off]
        --rpchost                        the host that peer can communicate by RPC,defaut value is localhost
        --rpcpot                         the RPC server port，default value is 8555

## INT Chain CLI

**The INT Chain Command Line Interface.**

***

### Installation


**Globally**

Install INT CLI globally with

    $ npm install -g int-cli
    
Now you can run INT CLI using following command anywhere

    $ int

**Locally**

Install INT CLI to your node_modules folder with

    $ npm install --save int-cli
    
Now you can run INT CLI using following command andywhere

    $ node_modules/.bin/int
    
**Usage**

    INT CLI  [ Node: 8.0.0, CLI: 3.0.x]
    
    Commands:
        peer                         Start a peer
        
        
    Options:
        -v, --version                    Print INT Chain version
        -h, --help                       Show help
        --test                           Connect the test net
        --main                           Connect the main net
        --dataDir                        Data storage location
        --peerid                         The id of peer
        --loggerConsole                  Print log or not
        --loggerLevel                    The log leverl [all, trace, debug, info, warn, error, off]
        --hander                         The location of the handler file, which is the entry of the chain handler
        
                          