 type RegConfig = {ints:number, floats:number};

type Patcher = (reg: Register, src: string) => [number, string | null];

 class Register {
    public regs: {[key:string]: number} = {};
    public qi: {[key:string]: string | null} = {};

    constructor(conf:RegConfig){
        for(let i=0; i<conf.ints; i++) {
            this.regs[`R${i}`] = 0;
            this.qi[`R${i}`] = null;
        }
        for(let f=0; f<conf.floats; f++) {
            this.regs[`F${f}`] = 0;
            this.qi[`F${f}`] = null;
        }
    }

    /*
     * qfunc: given source register returns [value, name/tag]
     * */
    patch(ri: RawInstruction, qfunc: Patcher, uid:number): Instruction {
        let ins = new Instruction(ri.op, ri.dst, uid);

        let value = parseInt(ri.src0, 10);
        if (isNaN(value)) {                        // then src0 is a reg name
            let res = qfunc(this, ri.src0), v = res[0], remote = res[1];
            if (remote === null) {
                value = v;
            } else {
                value = 0;
                ins.qj = remote;
            }
        }
        ins.vj = value;

        if (ri.src1.length !== 0) {
            value = parseInt(ri.src1, 10);
            if (isNaN(value)) {                    // then src1 is a reg name
                let res = qfunc(this, ri.src1);
                let v = res[0], remote = res[1];
                if (remote  === null) {
                    value = v;
                } else {
                    value = 0;
                    ins.qk = remote;
                }
            }
            ins.vk = value;
        }

        return ins
    }

    // No Rob patcher implementation
    patcher = function(me: Register, reg: string): [number, string | null] {
        return [me.regs[reg], me.qi[reg]];
    }

    setProducer(inst: Instruction, rs: string) {
        if (this.regs[inst.dst] === undefined)
            return;
        this.regs[inst.dst] = 0;
        this.qi[inst.dst] = rs;
    }

    readCDB(cdb: Queue<CdbMessage>): void {
        for (let msg of cdb) {
            if (this.qi[msg.dst] === msg.rsName) { // if were still waiting for it
                this.regs[msg.dst] = msg.result;
                this.qi[msg.dst] = null;
            }
        }
    }
}
