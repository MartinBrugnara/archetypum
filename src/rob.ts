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
            this.cb.buffer[tag].value = msg.result;
            this.cb.buffer[tag].ready = true;
        }
    }

    commit(reg: Register): void {
        // TODO: implement me
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
