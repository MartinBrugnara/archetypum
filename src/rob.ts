class Rob {
    cb:CircularBuffer<RobEntry>;

    constructor(size: number) {
        this.cb = new CircularBuffer<RobEntry>(size)
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
                    if (entry.ready) {
                        return [entry.value, null];
                    } else {
                        return [0, String(tag)];
                    }
                }
            }
            return [registry.regs[reg], null];
        }
    }(this);

    readCDB(cdb: Queue<CdbMessage>): void {
        for (let msg of cdb) {
            let tag = Number(msg.rsName);
            this.cb.buffer[tag].dst = msg.dst;
            this.cb.buffer[tag].value = msg.result;
            this.cb.buffer[tag].ready = true;
        }
    }

    // return pc of committed instruction or -1
    commit(reg: Register, mem: MemoryMGM): number {
        if (!this.isEmpty()) {
            let head = this.cb.buffer[this.cb.head];

            if (head.dst === '') {
                if (head.ready)         // Nothing to do
                    return this.cb.pop()!.instr.rowid;
            } else if (head.dst in reg.regs) {
                if (head.ready) {       // Is Reg and ready: save to reg
                    reg.regs[head.dst] = head.value;
                    return this.cb.pop()!.instr.rowid;
                }
            } else {
                // is memory: try to write to memory
                if (!memory.isBusy())
                    let memory.tryIssue()
            }



            && this.cb.buffer[this.cb.head].ready) {
                // TODO: wat ? fix me
                let data = this.cb.pop()!;
                if (data.dst in reg.regs) {
                    reg.regs[data.dst] = data.value
                    return data.instr.rowid;
                } else {
                    return
                }

                // Check if something to write


                return -1;
            }
        }

        class RobEntry {
            constructor(
                public instr: RawInstruction,
                public dst: string,
                public value: number = 0,
                public ready: boolean = false,
            ){}
        }
