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
        if (this.clock > 20) { // DEBUG, safety stop
            console.error("Shiit 20 iteration?");
            return false;
        }


        this.CDB = new Queue<CdbMessage>();
        this.clock += 1;

        if (this.pc < this.program.length) {       // If code then issue
            let rawInst = this.program[this.pc];
            let inst = this.REG.patch(rawInst);

            let issued:boolean = false;
            for (let fu of this.FUs) {
                if (fu.tryIssue(this.clock, inst)) {
                    this.REG.setProducer(inst, fu.name);
                    this.pc++;
                    break;
                }
            }
        }

        for (let fu of this.FUs) fu.execute(this.clock);
        for (let fu of this.FUs) fu.writeResult(this.clock, this.CDB);

        // TODO: add opt for yield (4 graphics)
        for (let fu of this.FUs) fu.readCDB(this.CDB);
        this.REG.readCDB(this.CDB);

        // if all fu are not busy end
        for (let fu of this.FUs) if (fu.isBusy()) return true;
        return this.pc < this.program.length;
    }
}

 interface FunctionalUnit {
    readonly name:string;
    tryIssue(clockTime: number, instr: Instruction): boolean;
    execute(clockTime: number): void;
    writeResult(clockTime: number, cdb: Queue<CdbMessage>): void;
    readCDB(cdb: Queue<CdbMessage>): void;
    isBusy(): boolean;
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
        if (!this.isBusy()) {
            console.log(clockTime, this.name, "doing nothing");
            return
        }

        if (!this.isReady()) {
            console.log(clockTime, this.name, "waitgin for others");
            console.log(JSON.stringify(this.instr, null, '\t'));
            return;                                     // not ready yet
        }

        if (!this.endTime || this.endTime < clockTime) {
            console.log(clockTime, this.name, "start working", clockTime, this.duration, this.endTime);
            this.endTime = clockTime + this.duration - 1; // -1 => sub current clock
        } else {
            console.log(clockTime, this.name, "already working", clockTime, this.duration, this.endTime);
        }
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

    isReady(): boolean {
        // Assumption: vj contains value iff qj === null
        return this.instr!.qj === null && this.instr!.qk === null
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
    readonly duration = 2;

    constructor(name: string) {
        super(FuKind.ADDER, name);
    }

    computeValue() {
        switch (this.instr!.op) {
            case Op.ADD:
                console.log(this.name, "is add", this.instr!);
                this.result = this.instr!.vj + this.instr!.vk;
                break;
            case Op.SUB:
                console.log(this.name, "is sub", this.instr!);
                this.result = this.instr!.vj - this.instr!.vk;
                break;
        }
    }
}
FuMap[FuKind.ADDER] = (name:string) => new Adder(name);

class Multiplier extends FunctionalUnitBaseClass {
    readonly duration = 4;

    constructor(name: string) {
        super(FuKind.MULTIPLIER, name);
    }

    computeValue() {
        switch (this.instr!.op) {
            case Op.MUL:
                this.result = this.instr!.vj * this.instr!.vk;
                break;
            case Op.DIV:
                this.result = this.instr!.vj / this.instr!.vk;
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
        public vj: number = 0,   // First source operand value
        public vk: number = 0,   // Seconds source operand value
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
        console.log(JSON.stringify(emu.REG, null, '\t'));
    }

    console.log("End of main");
}

main();
