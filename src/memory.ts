class MemConf {
    constructor(
        public readonly readLatency:number,
        public readonly writeLatency:number,
    ){}
}

class Memory {
    mem: {[index:number]: number} = {}
    currentOpComplete:number = -1;

    private readLatency:number=0
    private writeLatency:number=0

    constructor(c: MemConf) {
        this.readLatency = c.readLatency;
        this.writeLatency = c.writeLatency;
    }

    isBusy() {
        return this.currentOpComplete !== -1;
    }

    read(clock: number, loc:number): number | null {
        if (this.currentOpComplete === -1) {
            this.currentOpComplete = clock + this.readLatency;
        } else if (clock >= this.currentOpComplete) {
            this.currentOpComplete = -1;
            return this._read(loc);
        }
        return null
    }

    // return if the op has completed
    write(clock: number, loc:number, value:number): boolean {
        if (this.currentOpComplete === -1) {
            this.currentOpComplete = clock + this.writeLatency;
        } else if (clock === this.currentOpComplete) {
            this.currentOpComplete = -1;
            this._write(loc, value);
            return true;
        }
        return false;
    }


    _read(loc:number): number {
        if (this.mem[loc] === undefined) {
            this.mem[loc] = Math.round(Math.random() * 100);
        }
        return this.mem[loc];
    }

    _write(loc:number, value:number): void {
        this.mem[loc] = value;
    }
}

type CacheConf = {[key:string]: any}
let XCacheMap: {[key:string]: (c: CacheConf) => XCache} = {}

function XCacheFactory(name:string, c: CacheConf): XCache {
    if (name in XCacheMap)
        return XCacheMap[name](c);
    else
        return new XCache(c);
}

class XCache {
    /* Base cache implementation, a.k.a. ``no cache''.
     * Extend and override, read() and write() to implement the various
     * cache algorithms.
     */
    private _cache: {[index:number]: number} = {};
    private mem: Memory;

    constructor(c: CacheConf) {
        if (c['mem'] !== undefined)
            this.mem = <Memory>c.mem;
    }

    read(clock: number, loc:number): number | null {
        return this.mem.read(clock, loc);
    }

    write(clock: number, loc:number, value:number): boolean {
        return this.mem.write(clock, loc, value);
    }
}
XCacheMap["no-cache"] = (c: CacheConf) => new XCache(c);
