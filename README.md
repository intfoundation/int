## INT Chain

Official Node.js implementation of the INT Chain protocol.

## Environment dependence

Building int requires a Node.js (version 8.0 or later).
You can install it from Node.js official website(https://nodejs.org/en/download/).

## Installation Instructions

(1) Clone the repository to a directory of your choosing

    git clone https://github.com/intfoundation/int

(2)  entry into the first level of int project.

    cd .../int
    
(3) install node_modules of int project dependency.
    
    npm install

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

    INT CLI  [ Node: 8.0.0, CLI: 3.0.0]
    
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
        
                          