var config = {
    metaAccountWIF:'',
    metaSig:'',
    number:1000,//number为当前meta的序号
    tcpBDTPort:12101,
    udpBDTPort:12103,
    rpcPort:12202,
    postfix:1,//表示如果在通过一个机器上同一目录跑多个meta时的序号，在同一机器同一目录运行保持不同即可
    runserver:0//默认写0
};

module.exports = config;