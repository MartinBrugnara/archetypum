 class CdbMessage {
    constructor(public rsName: string, public result: number, public dst: string) {}
}
 class Emulator {
    private clock:number = 0;
    private pc:number = 0;

    REG:Register;
    FUs:FunctionalUnit[];
    CDB:Queue<CdbMessage>;

    constructor(fuConf: FuConfig, regConf: RegConfig, private program:Program) {
        this.REG = new Register(regConf);
        this.FUs = FuFactory(fuConf)
    }

    step():boolean {
        if (this.pc == this.program.length) return false;

        this.CDB = new Queue<CdbMessage>();
        this.clock += 1;

        // Issue
        let rawInst = this.program[this.pc];
        let inst = this.REG.patch(rawInst);

        let issued:boolean = false;
        for (let fu of this.FUs) {
            issued = issued || fu.tryIssue(this.clock, inst);
            if (issued) {
                this.REG.setProducer(inst, fu.name);
                break;
            }
        }

        if (!issued) return true;                                  // stall
        this.pc++;
        for (let fu of this.FUs) fu.execute(this.clock);
        for (let fu of this.FUs) fu.writeResult(this.clock, this.CDB);

        // TODO: add opt for yield (4 graphics)
        for (let fu of this.FUs) fu.readCDB(this.CDB);
        this.REG.readCDB(this.CDB);
        return true;
    }
}

 interface FunctionalUnit {
    readonly name:string;
    tryIssue(clockTime: number, instr: Instruction): boolean;
    execute(clockTime: number): void;
    writeResult(clockTime: number, cdb: Queue<CdbMessage>): void;
    readCDB(cdb: Queue<CdbMessage>): void;
}

 enum FuKind {ADDER, MULTIPLIER}
let FuMap: {[key:number]: (name:string) => FunctionalUnit} = {}

class FunctionalUnitBaseClass implements FunctionalUnit {
    protected readonly duration: number;
    protected result: number;
    protected instr: Instruction | null = null;
    private endTime: number;

    constructor(readonly kind: FuKind, readonly name: string) {}

    tryIssue(clockTime: number, instr: Instruction): boolean {
        if (this.kind !== instr.kind() || this.isBusy())
            return false;
        this.instr = instr;
        return true;
    }

    execute(clockTime: number): void {
        if (!this.isBusy() || this.instr!.vj === null || this.instr!.vk === null)
            return;                                     // not ready yet
        this.endTime = clockTime + this.duration;
        // TODO: force execute cycle <> writeResult with +1
    }

    computeValue(): void {
        throw new Error('Implement in child');
    }

    writeResult(clockTime: number, cdb: Queue<CdbMessage>): void {
        if (this.isBusy && this.endTime === clockTime) {
            this.computeValue();
            cdb.push(new CdbMessage(this.name, this.result, this.instr!.dst));
            this.instr = null;
        }
    }

    isBusy(): boolean {
        return !!this.instr;
    }

    readCDB(cdb: Queue<CdbMessage>): void {
        if (this.instr === null) return;
        if (!this.isBusy || (this.instr.qj === null && this.instr.qk === null))
            return;
        for (let msg of cdb) {
            if (this.instr.qj !== null && this.instr.qj === msg.rsName) {
                this.instr.vj = msg.result;
                this.instr.qj = null;
            }
            if (this.instr.qk !== null && this.instr.qk === msg.rsName) {
                this.instr.vk = msg.result;
                this.instr.qk = null;
            }
        }
    }
}

class Adder extends FunctionalUnitBaseClass {
    constructor(name: string) {
        super(FuKind.ADDER, name);
    }

    computeValue() {
        switch (this.instr!.op) {
            case Op.ADD:
                this.result = this.instr!.vj! + this.instr!.vk!;
                break;
            case Op.SUB:
                this.result = this.instr!.vj! - this.instr!.vk!;
                break;
        }
    }
}
FuMap[FuKind.ADDER] = (name:string) => new Adder(name);

class Multiplier extends FunctionalUnitBaseClass {
    constructor(name: string) {
        super(FuKind.MULTIPLIER, name);
    }

    computeValue() {
        switch (this.instr!.op) {
            case Op.MUL:
                this.result = this.instr!.vj! * this.instr!.vk!;
                break;
            case Op.DIV:
                this.result = this.instr!.vj! / this.instr!.vk!;
                break;
        }
    }
}
FuMap[FuKind.MULTIPLIER] = (name:string) => new Multiplier(name);


 type FuConfig = [[FuKind, string, number]];
 function FuFactory(conf: FuConfig): FunctionalUnit[] {
    let fus:FunctionalUnit[] = [];
    for (let fuc of conf) {
        for (let i=0; i<fuc[2]; i++) {
            fus.push(FuMap[fuc[0]](`${fuc[1]}${i}`));
        }
    }
    return fus;
}

 class RawInstruction {
    constructor(
        public op: Op,
        public src0: string,
        public src1: string,
        public dst: string
    ){}
}

 type Program = RawInstruction[];

 class Instruction {
    constructor(
        public op: Op,                     // Operation
        public dst: string,                // destination register (only REG)
        public vj: number | null = null,   // First source operand value
        public vk: number | null = null,   // Seconds source operand value
        public qj: string | null = null,   // RS name producing first operand
        public qk: string | null = null    // RS name producing second operand
    ){}

    kind(): FuKind {
        return OpKindMap[this.op];
    }
}


 enum Op {ADD, SUB, MUL, DIV}

let OpKindMap: {[index:number] : FuKind} = {}
OpKindMap[Op.ADD] = FuKind.ADDER;
OpKindMap[Op.SUB] = FuKind.ADDER;
OpKindMap[Op.MUL] = FuKind.MULTIPLIER;
OpKindMap[Op.DIV] = FuKind.MULTIPLIER;
 class Queue<T> {
    _store: T[] = [];

    [Symbol.iterator]() {
        return this._store[Symbol.iterator]()
    }

    push(val: T) {
        this._store.push(val);
    }
    pop(): T | undefined {
        return this._store.shift();
    }
}


 type RegConfig = {ints:number, floats:number};

 class Register {
    private regs: {[key:string]: number} = {};
    private qi: {[key:string]: string | null} = {};

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

    patch(ri: RawInstruction):Instruction {
        let ins = new Instruction(ri.op, ri.dst);

        ins.vj = parseInt(ri.src0, 10);
        if (isNaN(ins.vj)) {                        // then src0 is a reg name
            ins.vj = this.regs[ri.src0]
            if (isNaN(ins.vj)) {                    // then we wait for RS
                ins.vj = null;
                ins.qj = this.qi[ri.src0];
            }
        }

        if (ri.src1 !== null) {
            ins.vk = parseInt(ri.src1, 10);
            if (isNaN(ins.vk)) {                     // then src1 is a reg name
                ins.vk = this.regs[ri.src1]
                if (isNaN(ins.vk)) {                 // then we wait for RS
                    ins.vk = null;
                    ins.qk = this.qi[ri.src1];
                }
            }
        }

        return ins
    }

    setProducer(inst: Instruction, rs: string) {
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

// ---------------------------------------------------------------------------
// TEST DATA
// ---------------------------------------------------------------------------

let program = [
    new RawInstruction(Op.ADD,  '3', '5', 'R0'),
    new RawInstruction(Op.SUB, 'R0', '2', 'R0'),
    new RawInstruction(Op.MUL, 'R0', '1', 'R1'),
    new RawInstruction(Op.DIV, 'R1', '3', 'R3'),
]

function main(){
    console.log("In main");
    let emu = new Emulator(
        [[FuKind.ADDER, 'ADDR', 3], [FuKind.MULTIPLIER, 'MULT', 3] ],
        {ints:8, floats:8},
        program
    )

    while(emu.step()) {
        console.log(emu);
    }

    console.log("End of main");
}

main();
