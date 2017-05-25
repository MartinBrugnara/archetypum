class Rob {
    cb:CircularBuffer<RobEntry>;

    constructor(size: number, private memMgm:MemoryMGM, private IU:Spec) {
        this.cb = new CircularBuffer<RobEntry>(size)
        memMgm.rob = this;
    }

    isFull = ():boolean => this.cb.isFull();
    isEmpty = ():boolean => this.cb.isEmpty();
    nextTag = ():string => String(this.cb.nextTag());
    push = (r:RobEntry):number => this.cb.push(r);
    pop = ():RobEntry|null => this.cb.pop();

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

    setFlags(entry:RobEntry, reg: Register):void {
        // set all supported flags
        reg.FLAGS[Flag.ZF] = entry.value === 0;
    }

    // return uid of committed istruction, if any, -1 otherwise
    commit(clock: number, reg: Register): number {
        if (this.isEmpty())
            return new CommitResponse();

        let head = this.cb.buffer[this.cb.head];
        if (head.ready === null || head.ready <= clock)
            return new CommitResponse();

        // If here then we commit.
        // then update flag
        if ([FuKind.ADDER, FuKind.MULTIPLIER].indexOf(OpKindMap[head.instr!.op]) !== -1)
            this.setFlags(head, reg);

        if (OpKindMap[head.instr!.op] === FuKind.IU)
            return new CommitResponse(this.cb.pop()!.uid, this.IU.validateChoice(head, reg.FLAGS));

        if (head.dst === '') {                  // Nothing to do
            return this.cb.pop()!.instr.rowid;
        } else if (head.dst in reg.regs) {      // Is reg: save to reg
            reg.regs[head.dst] = head.value;
            return this.cb.pop()!.instr.uid;
            return new CommitResponse(this.cb.pop()!.uid);
        } else {                                // Is memory: write.
            if (this.memMgm.write('ROB', clock, Number(head.dst), head.value, true))
                return new CommitResponse(this.cb.pop()!.uid);
        }
    }
}

class RobEntry {
    constructor(
        public instr: RawInstruction,
        public dst: string,

        public uid: number = null;

        public value: number = 0,
        public ready: number | null = null,
    ){}
}

class CommitResponse {
    constructor(
        public readonly uid:number = -1,
        public readonly flush:number = -1,
    ){}
}
