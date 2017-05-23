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
            this.mem[loc] = Math.floor(Math.random() * 100);
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

// (in_use, index, value, dirty)
type XCacheEntry = [boolean, number, number, boolean];

class XCache {
    /* Base cache implementation, a.k.a. ``no cache''.
     * Extend and override, read() and write() to implement the various
     * cache algorithms.
     */
    public _cache: {[index:number]: XCacheEntry[]} = {};
    public n: number;
    public size: number;

    protected mem: Memory;

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


class NWayCache extends XCache {
    private isWriteBack: boolean ; // if false, write through

    private readLatency: number;
    private writeLatency: number;

    private currentOpComplete:number = -1;
    private miss = false;
    private writing: XCacheEntry | null = null;

    private result: number | null;

    constructor(c: CacheConf) {
        super(c);
        this.n =  'n' in c ? c['n'] : 2;
        this.size = 'size' in c ? c['size'] : 4;
        this.isWriteBack = 'iswriteback' in c ? c['iswriteback'] : false;
        this.readLatency = 'readLatency' in c ? c['readLatency'] : 0;
        this.writeLatency = 'writeLatency' in c ? c['readLatency'] : 0;

        if (this.size % this.n !== 0)
            throw new Error("Invalid (N,Size) paraemters combination");

        for (let i=0; i<this.size/this.n; i++) {
            this._cache[i] = [];
            for (let j=0; j<this.n; j++)
                this._cache[i].push( [false, 0, 0, false] );
        }
    }

    isBusy() {
        return this.currentOpComplete !== -1;
    }

    findValue(loc:number): number | null {
        let i = loc % this.n;
        for (let j=0; j<this.n; j++) {
            let entry = this._cache[i][j]
            if (entry[0] && entry[1] === loc) {
                return entry[2]
            }
        }
        return null;
    }

    setValue(loc:number, value:number, dirty:boolean=false): XCacheEntry | null {
        let i = loc % this.n;

        // Try replace
        for (let j=0; j<this.n; j++) {
            let entry = this._cache[i][j]
            if (entry[0] && entry[1] === loc) {
                this._cache[i][j] = [true, loc, value, dirty];
                return null;
            }
        }

        // Try find empty
        for (let j=0; j<this.n; j++) {
            let entry = this._cache[i][j]
            if (!entry[0]) {
                this._cache[i][j] = [true, loc, value, dirty];
                return null;
            }
        }

        // Evict: random cache eviction protocol
        let j = Math.floor(Math.random() * this.n);
        let entry = this._cache[i][j];
        this._cache[i][j] = [true, loc, value, dirty];
        if (entry[3] === true)
            return entry;
        return null;
    }


    read(clock: number, loc:number): number | null {
        /* look if in local cache */
        if (this.currentOpComplete === -1) {
            this.currentOpComplete = clock + this.readLatency;
        }

        if (clock === this.currentOpComplete)  {
            let value = this.findValue(loc);
            if (value !== null) { // cache hit
                this.currentOpComplete = -1;
                return value;
            } else {
                this.miss = true;
            }
        }

        if (this.miss) {
            let value = this.mem.read(clock, loc);

            if (value !== null) {
                this.miss = false;

                let evicted = this.setValue(loc, value); // update cache
                if (evicted !== null && this.isWriteBack) {
                    this.result = value;
                    this.writing = evicted;
                } else {
                    this.currentOpComplete = -1;
                    return value;
                }
            }
        }

        if (this.writing !== null) {
            if (this.mem.write(clock, this.writing[1], this.writing[2])) {
                let retval = this.result;
                this.result = null;
                this.writing = null;
                this.currentOpComplete = -1;
                return retval;
            }
        }

        return null;
    }

    write(clock: number, loc:number, value:number): boolean {
        /* look if in local cache */
        if (this.currentOpComplete === -1)
            this.currentOpComplete = clock + this.writeLatency;

        if (clock < this.currentOpComplete) return false;

        if (clock === this.currentOpComplete)  {
            let evicted = this.setValue(loc, value, true);

            if (evicted !== null && this.isWriteBack) {
                this.writing = evicted;
            }

            if (!this.isWriteBack) { // writethrough
                this.writing = [true, loc, value, true];
            }
        }

        if (this.writing !== null) {
            if (this.mem.write(clock, this.writing[1], this.writing[2])) {
                this.writing = null;
            }
        }

        if (this.writing === null) {
            this.currentOpComplete = -1;
            return true;
        } else {
            return false;
        }
    }
}
XCacheMap["nwayset"] = (c: CacheConf) => new NWayCache(c);
