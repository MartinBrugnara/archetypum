class Memory {
    mem: {[index:number]: number} = {}
    currentOpComplete:number = -1;

    constructor(private readLatency:number=0, private writeLatency:number=0) {}


    isBusy() {
        return this.currentOpComplete !== -1;
    }

    read(clock: number, loc:number): number | null {
        console.log("in read");
        if (this.currentOpComplete === -1) {
            console.log("set cop");
            this.currentOpComplete = clock + this.readLatency;
        } else if (clock >= this.currentOpComplete) {
            this.currentOpComplete = -1;
            console.log("set cop done, ret val");
            return this._read(loc);
        }
        console.log("retu null");
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

class XCache {
    /* Base cache implementation, a.k.a. ``no cache''.
     * Extend and override, read() and write() to implement the various
     * cache algorithms.
     */
    private _cache: {[index:number]: number} = {}

    constructor(private mem: Memory) {}

    read(clock: number, loc:number): number | null {
        return this.mem.read(clock, loc);
    }

    write(clock: number, loc:number, value:number): boolean {
        return this.mem.write(clock, loc, value);
    }
}
