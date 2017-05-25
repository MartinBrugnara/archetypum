class Rob {
    cb:CircularBuffer<RobEntry>;

    constructor(size: number, private memMgm:MemoryMGM) {
        this.cb = new CircularBuffer<RobEntry>(size)
        memMgm.rob = this;
    }

    isFull = ():boolean => this.cb.isFull();
    isEmpty = ():boolean => this.cb.isEmpty();
    nextTag = ():string => String(this.cb.nextTag());
    push = (r:RobEntry):number => this.cb.push(r);
    pop = ():RobEntry|null => this.cb.pop();

    flush(): void {
        this.cb = new CircularBuffer<RobEntry>(this.size);
        this.memMgm.rob = this;
    }

    patcher = function(me: Rob) {
        return function(registry: Register, reg: string): [number, string | null] {
            for (let item of me.cb.reverse()) {
                let tag = item[0], entry = item[1];
                if (reg === entry.dst) {
                    if (entry.ready !== null) {
                        return [entry.value, null];
                    } else {
                        return [0, String(tag)];
                    }
                }
            }
            return [registry.regs[reg], null];
        }
    }(this);

    readCDB(clock:number, cdb: Queue<CdbMessage>): void {
        for (let msg of cdb) {
            let tag = Number(msg.rsName);
            this.cb.buffer[tag].dst = msg.dst;
            this.cb.buffer[tag].value = msg.result;
            this.cb.buffer[tag].ready = clock;
        }
    }

    // return pc of committed instruction or -1
    commit(clock: number, reg: Register): number {
        if (this.isEmpty())
            return -1

        let head = this.cb.buffer[this.cb.head];
        if (head.ready === null || head.ready === clock)
            return -1;

        if (head.dst === '') {                  // Nothing to do
            return this.cb.pop()!.instr.rowid;
        } else if (head.dst in reg.regs) {      // Is reg: save to reg
            reg.regs[head.dst] = head.value;
            return this.cb.pop()!.instr.rowid;
        } else {                                // Is memory: write.
            if (this.memMgm.write('ROB', clock, Number(head.dst), head.value, true))
                return this.cb.pop()!.instr.rowid;
        }

        return -1;
    }
}

class RobEntry {
    constructor(
        public instr: RawInstruction,
        public dst: string,
        public value: number = 0,
        public ready: number | null = null,
    ){}
}
