 class CdbMessage {
    constructor(public rsName: string, public result: number, public dst: string) {}
}
 class Emulator {
    public clock:number = 0;
    public pc:number = 0;

    REG:Register;
    FUs:FunctionalUnit[];
    CDB:Queue<CdbMessage>;

    constructor(fuConf: FuConfig, regConf: RegConfig, public readonly program:Program) {
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
            let inst = this.REG.patch(rawInst, this.pc);

            let issued:boolean = false;
            for (let fu of this.FUs) {
                if (fu.tryIssue(this.clock, inst)) {
                    this.program[this.pc].issued = this.clock;
                    this.REG.setProducer(inst, fu.name);
                    this.pc++;
                    break;
                }
            }
        }

        for (let fu of this.FUs) {
            let rowid = fu.execute(this.clock);
            if (rowid >= 0) this.program[rowid].executed = this.clock;
        }

        for (let fu of this.FUs) {
            let rowid = fu.writeResult(this.clock, this.CDB);
            if (rowid >= 0) this.program[rowid].written = this.clock;
        }

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
    execute(clockTime: number): number;
    writeResult(clockTime: number, cdb: Queue<CdbMessage>): number;
    readCDB(cdb: Queue<CdbMessage>): void;
    isBusy(): boolean;
    getInstr(): Instruction | null;
}

 enum FuKind {ADDER, MULTIPLIER}
let FuMap: {[key:number]: (name:string) => FunctionalUnit} = {}

class FunctionalUnitBaseClass implements FunctionalUnit {
    protected readonly duration: number;
    protected result: number;
    protected instr: Instruction | null = null;

    private issuedTime: number = -1;
    private endTime: number;

    constructor(readonly kind: FuKind, readonly name: string) {}

    getInstr(): Instruction | null {
        return this.instr;
    }

    tryIssue(clockTime: number, instr: Instruction): boolean {
        if (this.kind !== instr.kind() || this.isBusy())
            return false;
        this.instr = instr;
        this.issuedTime = clockTime;
        return true;
    }

    /* Returns rowid (pc) when exec start, -1 otherwise */
    execute(clockTime: number): number {
        if (
            this.isBusy() && this.isReady()
            && (!this.endTime || this.endTime < clockTime)
            && (clockTime >= (this.issuedTime + Number(ISSUE_EXEC_DELAY)))
        ) {
            this.endTime = clockTime + this.duration + Number(EXEC_WRITE_DELAY);
            return this.instr!.pc
        }
        return -1;
    }

    computeValue(): void {
        throw new Error('Implement in child');
    }

    /* Return rowid (pc) when it writes a result, -1 otherwise. */
    writeResult(clockTime: number, cdb: Queue<CdbMessage>): number {
        if (this.isBusy && this.endTime === clockTime) {
            this.computeValue();
            cdb.push(new CdbMessage(this.name, this.result, this.instr!.dst));
            let pc = this.instr!.pc;
            this.instr = null;
            return pc;
        }
        return -1;
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
class Graphics {

    clk: HTMLElement = document.getElementById('clock')!;
    src: HTMLElement = document.getElementById('sourcecode')!;
    rs: HTMLElement = document.getElementById('rs')!;
    regh: HTMLElement = document.getElementById('reg_head')!;
    regb: HTMLElement = document.getElementById('reg_body')!;

    constructor(private emu: Emulator) {}

    paint(): void {
        this.clk.innerHTML = String(this.emu.clock);
        this.src.innerHTML = this.renderSrc();
    }

    renderSrc(): string {
        let rowid = 0;

        let html:string[][] = [];
        for (let i of this.emu.program) {
            html.push([
                '<tr',
                    (this.emu.pc === rowid ? ' class="current"' : ''),
                    '>',
                    '<td>', String(rowid++), '</td>',
                    '<td>', i.toString(), '</td>',
                    '<td', (i.issued === this.emu.clock ? ' class="new-val"': '') ,'>',
                        String(i.issued >= 0 ? i.issued : ''), '</td>',
                    '<td', (i.executed === this.emu.clock ? ' class="new-val"': '') ,'>',
                        String(i.executed >= 0 ? i.executed : ''), '</td>',
                    '<td', (i.written === this.emu.clock ? ' class="new-val"': '') ,'>',
                        String(i.written >= 0 ? i.written : ''), '</td>',
                '</tr>',
            ]);
        }
        return Array.prototype.concat.apply([], html).join('');
    }
}

 class RawInstruction {
    public issued:number = -1;
    public executed:number = -1;
    public written:number = -1;


    constructor(
        public op: Op,
        public src0: string,
        public src1: string,
        public dst: string
    ){}

    toString(): string {
        return `${OpString[this.op]} ${this.src0},${this.src1},${this.dst}`;
    }
}

 type Program = RawInstruction[];

 class Instruction {
    constructor(
        public op: Op,                     // Operation
        public dst: string,                // destination register (only REG)
        public pc: number,

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

let OpString: {[index:number]: string} = {}
OpString[Op.ADD] = "ADD";
OpString[Op.SUB] = "SUB";
OpString[Op.MUL] = "MUL";
OpString[Op.DIV] = "DIV";
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

// ---------------------------------------------------------------------------
// Settings from GUI
const ISSUE_EXEC_DELAY = true;
const EXEC_WRITE_DELAY = true;

// ---------------------------------------------------------------------------
// Testing main

function sleep(s:number) {
    return new Promise(x => setTimeout(x, s * 1000));
}

async function main(){
    console.log("In main");
    let emu = new Emulator(
        [[FuKind.ADDER, 'ADDR', 3], [FuKind.MULTIPLIER, 'MULT', 3] ],
        {ints:8, floats:8},
        program
    )

    let speed: HTMLInputElement = <HTMLInputElement>document.getElementById('speed')!;

    let g = new Graphics(emu);
    g.paint();
    await sleep(10/Number(speed.value));
    while(emu.step()) {
        g.paint();
        await sleep(10/Number(speed.value));
    }
    g.paint();

    console.log("End of main");
}

main();
