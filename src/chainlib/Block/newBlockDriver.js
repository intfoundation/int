"use strict";
const EventEmitter = require('events');

class NewBlockDriver extends EventEmitter{
    constructor(number,id,txStorage,devmode=false){
        super();
        this.nodeTurns=[];//记录参与出块的节点的id列表
        this.currNode=-1; //当前出块的id
        this.m_id=id;//自己的id
        this.receivedIDs=[]; //新加入的节点“下一轮”出块，它来负责触发更新nodeTurns
        this.bInTurns=false;
        this.intervalTime = 5*1000;//出块时间间隔
        this.moniterTimerID = 0;
        this.newBlockTimer = 0;
        this.number = number;//分配的顺序number
        this.txStorage = txStorage;
        this.devmode = devmode;

        this.txStorage.on('OnNewTx',(storageObj) => {
            if (this.devmode) {
                if (this.currNode === this.m_id) {
                    this._beginNewBlock(true);
                }
                else {
                    if (this.moniterTimerID === 0) {
                        this._beginMoniter();
                    }
                }
            }
            else{
                if (this.currNode === this.m_id) {
                    if (this.newBlockTimer === 0) {
                        this._beginNewBlock();
                    }
                }
                else {
                    if (this.moniterTimerID === 0) {
                        this._beginMoniter();
                    }
                }
            }
        });

        this.txStorage.on('OnEmpty',(storageObj) => {
            this._endMoniter();
            this._endNewBlockTimer();
        });
    }

    //
    updateTurns(turns){
        if(this._compareList(turns,this.nodeTurns))
        {
            return ;
        }
        this.receivedIDs=[];
        this.nodeTurns = turns;
        if(!this.bInTurns)
        {
            for(let i=0;i<this.nodeTurns.length;i++){
                if(this.nodeTurns[i] === this.m_id)
                {
                    this._endMoniter();
                    this.bInTurns = true;
                    break;
                }
            } 
            // if(this.moniterTimerID === 0)
            // {
            //     this._endMoniter()
            //     this.moniterTimerID = setInterval(() => {
            //         console.log("newBlockDriver,updateTurns,the long timer trigger,nodeid="+this.m_id.toString());
            //         //长时间等待还收不到自己入队列信息，那可能出问题，自己出块
            //         //这种情况理论上存在，实际上应该不用考虑，但是以防万一
            //         this.bInTurns = true;
            //         this._beginNewBlock();
            //     },this.intervalTime*2*this.number);
            // }
        }
    }

    next(prevId){
        if(!this.bInTurns)
        {
            return;
        }

        let oldIndex=this.currNode;
        let currIndex = this._getIndex(prevId);
        currIndex++;
        if(currIndex === this.nodeTurns.length)
        {
            currIndex = 0;
        }
        this.currNode = this.nodeTurns[currIndex];
        /*
        let id = this.nodeTurns[oldIndex];
        let temp=[]
        for (let i=0;i<this.receivedIDs.length;i++)
        {
            if(this.receivedIDs[i] === id)
            {
                this.receivedIDs.shift();
                temp=[]
                break;
            }
            else
            {
                temp.push(this.receivedIDs.shift());
            }
        }
        //在receivedIDs中没有找到id，那么把temp给回receivedIDs，并把id压到最后面
        if(temp.length !== 0)
        {
            this.receivedIDs=temp;
            this.receivedIDs.push(id);
        }
        if(this.receivedIDs.length === 0)
        {
            //更新出块序列，把新加上来的节点进入出块列表
            this.emit("OnUpdateTurns",this);
        }
        */
       if(currIndex === 0)
       {
           //更新出块序列，把新加上来的节点进入出块列表
           this.emit("OnUpdateTurns",this);
       }
        if(this.currNode === this.m_id)
        {
            //轮到自己出块了
            this._beginNewBlock();    
        }
        else
        {
            //重新开启监听器
            this._beginMoniter();
        }
    }

    _endNewBlockTimer() {
        if (this.newBlockTimer !== 0) {
            clearInterval(this.newBlockTimer);
            this.newBlockTimer = 0;
        }
    }

    _beginNewBlock(bNow=false){
        this._endMoniter();
        this._endNewBlockTimer();
        if (this.txStorage.getCount() ===0) {
            return;
        }
        if (bNow) {
            this.emit("OnNewBlock",this,this.nodeTurns);
        }
        else {
            this.newBlockTimer = setInterval(() => {
                if (this.newBlockTimer !== 0) {
                    this._endNewBlockTimer();
                }
                this.emit("OnNewBlock",this,this.nodeTurns);
            },this.intervalTime);
        }
    }

    _endMoniter(){
        if(this.moniterTimerID !== 0)
        {
            clearInterval(this.moniterTimerID);
            this.moniterTimerID = 0;
        }
    }
    _beginMoniter(){
        this._endMoniter()
        if (this.txStorage.getCount() ===0) {
            return;
        }
        this.moniterTimerID = setInterval(() => {
            console.log("newBlockDriver.js _beginMoniter trigger");
            if (this.moniterTimerID !== 0) {
                this._endMoniter();
            }
            this.next(this.currNode);
        },this.intervalTime*3/2);
    }

    _compareList(list1,list2){
        if(list1.length !== list2.length)
        {
            return false;
        }

        for(let i=0;i<list1.length;i++)
        {
            if(list1[i] != list2[i])
            {
                return false;
            }
        }

        return true;
    }

    _getIndex(nodeID){
        for(let i=0;i<this.nodeTurns.length;i++)
        {
            if(nodeID===this.nodeTurns[i])
            {
                return i;
            }
        }
        return -1;
    }
}

module.exports = NewBlockDriver;