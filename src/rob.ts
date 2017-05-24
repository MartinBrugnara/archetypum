class Rob {
    buffer:CircularBuffer<RobEntry>;

    constructor(size: number) {
        this.buffer = new CircularBuffer<RobEntry>(size)
    }

    patcher = function(me: Rob) {
        return function(registry: Register, reg: string): [number, string | null] {
            for (let item of me.buffer.reverse()) {
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

}

class RobEntry {
    constructor(
        public instr: RawInstruction,
        public dst: string,
        public value: number,
        public ready: boolean,
    ){}
}
