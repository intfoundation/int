import {INode, NodeConnection} from '../net/node';
import {ErrorCode} from '../error_code';
import {IConnection} from '../net';
import {StandaloneConnection} from './connection';

export class StandaloneNode extends INode {
    constructor(peerid: string) {
        super({peerid});
    }

    protected async _connectTo(peerid: string): Promise<{err: ErrorCode, conn?: NodeConnection}> {
        let connType = this._nodeConnectionType();
        let conn: any = new connType(this);
        return {err: ErrorCode.RESULT_OK, conn};
    }

    protected _connectionType(): new(...args: any[]) => IConnection {
        return StandaloneConnection;
    }

    public async listen(): Promise<ErrorCode> {
        return ErrorCode.RESULT_OK;
    }

    public async randomPeers(count: number, excludes: string[]): Promise<{err: ErrorCode, peers: string[]}> {
        return {err: ErrorCode.RESULT_SKIPPED, peers: []};
    }
}