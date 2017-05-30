class Rob {
    cb:CircularBuffer<RobEntry>;

    constructor(private readonly size: number, private memMgm:MemoryMGM, private IU:Spec) {
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

    setFlags(entry:RobEntry, reg: Register):void {
        // set all supported flags
        reg.FLAGS[Flag.ZF] = entry.value === 0;
        console.log(reg.FLAGS);
    }

    // return uid of committed istruction, if any, -1 otherwise
    commit(clock: number, reg: Register): CommitResponse {
        console.log(clock, "in commit");
        if (this.isEmpty())
            return new CommitResponse();

        let head = this.cb.buffer[this.cb.head];
        if (head.ready === null || head.ready >= clock) {
            console.log(clock, "in commit, if 1b", head.ready);
            return new CommitResponse();
        }

        // If here then we commit.
        // then update flag
        if ([FuKind.ADDER, FuKind.MULTIPLIER].indexOf(OpKindMap[head.instr!.op]) !== -1) {
            console.log(clock, "in commit, if 2");
            this.setFlags(head, reg);
        }

        if (OpKindMap[head.instr!.op] === FuKind.IU) {
            console.log(clock, "in commit, if 3");
            return new CommitResponse(this.cb.pop()!.uid, this.IU.validateChoice(head, reg.FLAGS));
        }

        if (head.dst === '') {                  // Nothing to do
        console.log(clock, "in commit, if 4 ");
            return new CommitResponse(this.cb.pop()!.uid);
        } else if (head.dst in reg.regs) {      // Is reg: save to reg
        console.log(clock, "in commit, if 5 ");
            reg.regs[head.dst] = head.value;
            return new CommitResponse(this.cb.pop()!.uid);
        } else {                                // Is memory: write.
        console.log(clock, "in commit, if 6 ");
            if (this.memMgm.write('ROB', clock, Number(head.dst), head.value, true))
                return new CommitResponse(this.cb.pop()!.uid);
        console.log(clock, "in commit, if 6b ");
        }

        console.log(clock, "in commit, if 7 ");
        return new CommitResponse();
    }
}

class RobEntry {
    constructor(
        public instr: RawInstruction,
        public dst: string,

        public uid: number = -1,

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
