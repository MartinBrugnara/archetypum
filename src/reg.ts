 type RegConfig = {ints:number, floats:number};

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

    patch(ri: RawInstruction, pc: number):Instruction {
        let ins = new Instruction(ri.op, ri.dst, pc);

        let value = parseInt(ri.src0, 10);
        if (isNaN(value)) {                        // then src0 is a reg name
            if (this.qi[ri.src0] === null) {
                value = this.regs[ri.src0];
            } else {
                value = 0;
                ins.qj = this.qi[ri.src0];
            }
        }
        ins.vj = value;

        if (ri.src1.length !== 0) {
            value = parseInt(ri.src1, 10);
            if (isNaN(value)) {                        // then src1 is a reg name
                if (this.qi[ri.src1] === null) {
                    value = this.regs[ri.src1];
                } else {
                    value = 0;
                    ins.qk = this.qi[ri.src1];
                }
            }
            ins.vk = value;
        }


        return ins
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
