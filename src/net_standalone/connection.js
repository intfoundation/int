import {ErrorCode} from '../error_code';
import {IConnection} from '../net';

export class StandaloneConnection extends IConnection {
    send(data: Buffer): number {
        return 0;
    }
    close(): Promise<ErrorCode> {
        return Promise.resolve(ErrorCode.RESULT_OK);
    }
    getRemote(): string {
        return '';
    }
}