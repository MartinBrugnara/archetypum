 class CdbMessage {
    constructor(public rsName: string, public result: number, public dst: string) {}
}
 class Emulator {
    public clock:number = 0;
    public pc:number = 0;

    REG:Register;
    FUs:FunctionalUnit[];
    CDB:Queue<CdbMessage>;
    MEM:XCache;

    constructor(fuConf: FuConfig, regConf: RegConfig, public readonly program:Program) {
        this.REG = new Register(regConf);
        this.FUs = FuFactory(fuConf)
        /* TODO: paramterize */
 //       this.MEM = new XCache(new Memory(1,2));
    }

    step():boolean {
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

enum FuKind {ADDER, MULTIPLIER, MEMORY}
let FuMap: {[key:number]: (name:string) => FunctionalUnit} = {}

class FunctionalUnitBaseClass implements FunctionalUnit {
    protected readonly duration: number;
    protected result: number;
    protected instr: Instruction | null = null;

    protected issuedTime: number = -1;
    protected endTime: number;

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
                this.result = this.instr!.vj + this.instr!.vk;
            break;
            case Op.SUB:
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



class MemoryMGM extends FunctionalUnitBaseClass {
    readonly duration = 0;
    private cache: XCache;
    private isComputing: boolean=false;

    constructor(name: string) {
        super(FuKind.MEMORY, name);
        // TODO: modify interface for varrags, and take memory as input
        this.cache = new XCache(new Memory(1,2));
    }

    computeValue() {
        console.error('I should never be invoked');
    }

    /* Returns rowid (pc) when exec start, -1 otherwise */
    execute(clockTime: number): number {
        if (this.isBusy() && this.isReady() && !this.isComputing &&
            (clockTime >= (this.issuedTime + Number(ISSUE_EXEC_DELAY)))) {

            this.isComputing = true;
            this.endTime = clockTime + this.duration + Number(EXEC_WRITE_DELAY);
            return this.instr!.pc
        }
        return -1;
    }

    /* Return rowid (pc) when it writes a result, -1 otherwise. */
    /* NOTE: endTime is considered as minEndTime (account for delays).
     * We relay on cache output to compute the actual exec time. */
    writeResult(clockTime: number, cdb: Queue<CdbMessage>): number {

        console.log("wr1");

        if (!this.isBusy() || !this.isReady() || clockTime < this.endTime) {
            return -1;
        }

        console.log("wr2");

        let done:boolean = false;
        switch (this.instr!.op) {
            case Op.LOAD:
                let value = this.cache.read(clockTime, this.instr!.vk + this.instr!.vj);
                if (value !== null) {
                    cdb.push(new CdbMessage(this.name, value, this.instr!.dst));
                    done = true;
                }
                break;
            case Op.STORE:
                done = this.cache.write(clockTime, this.instr!.vk, this.instr!.vj);
                break;
        }

        console.log("wr3");

        if (done) {
            let pc = this.instr!.pc;
            this.instr = null;
            this.isComputing = false;
            console.log("wr4");
            return pc;
        }

        console.log("wr5");
        return -1;
    }
}
FuMap[FuKind.MEMORY] = (name:string) => new MemoryMGM(name);
class Graphics {

    clk: HTMLElement = document.getElementById('clock')!;
    src: HTMLElement = document.getElementById('sourcecode')!;
    rs: HTMLElement = document.getElementById('rs')!;
    reg: HTMLElement = document.getElementById('reg')!;

    constructor(private emu: Emulator) {}

    paint(): void {
        this.clk.innerHTML = String(this.emu.clock);
        this.src.innerHTML = this.renderSrc();
        this.rs.innerHTML = this.renderRS();
        this.reg.innerHTML = this.renderREG();
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

    renderRS(): string {
        let html:string[][] = [];
        for (let f of this.emu.FUs) {
            let instr = f.getInstr();
            html.push(
                [
                    '<tr>',
                    '<td>', f.name, '</td>',
                    '<td',  (f.isBusy() ? ' class="busy"' : ''), '></td>',
                ], (instr !== null ? [
                    '<td>', instr.op.toString(), '</td>',
                    '<td>', (instr.qj === null ? String(instr.vj) : ''), '</td>',
                    '<td>', (instr.qk === null ? String(instr.vk) : ''), '</td>',
                    '<td>', (instr.qj !== null ? instr.qj : ''), '</td>',
                    '<td>', (instr.qk !== null ? instr.qk : '') , '</td>',
                ] : [
                    '<td></td><td></td><td></td><td></td><td></td>',
                ]),
                ['</tr>'],
            );
        }
        return Array.prototype.concat.apply([], html).join('');
    }

    renderREG(): string {
        let html:string[][] = [];
        var body:string[][] = [];
        html.push(
            ['<caption>Register Status (Q<sub>i</sub>)</caption>'],
            ['<thead><tr>'],
        );
        for (let key in this.emu.REG.regs) {
            html.push(['<th>', key, '</th>']);
            body.push([
                '<td>',
                (this.emu.REG.qi[key] === null ?  String(this.emu.REG.regs[key]) : this.emu.REG.qi[key]!),
                '</td>'
            ]);
            if (!(body.length % 8)) {
                html.push(
                    ['</tr></thead><tbody class="tech"><tr>'],
                    Array.prototype.concat.apply([], body),
                    ['</tr></tbody>'],
                    ['<thead><tr>'],
                );
                body = [];
            }
        }
        html.push(
            ['</tr></thead><tbody class="tech"><tr>'],
            Array.prototype.concat.apply([], body),
            ['</tr></tbody>'],
        );
        if (!body.length) html.splice(-4, 4);
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
        return `${OpString[this.op]} ${this.src0}` +
            `${this.src1 ? ',' : ''}${this.src1}` +
            `${this.dst  ? ',' : ''}${this.dst}`;
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


enum Op {ADD, SUB, MUL, DIV, LOAD, STORE}

let OpKindMap: {[index:number]: FuKind} = {}
OpKindMap[Op.ADD] = FuKind.ADDER;
OpKindMap[Op.SUB] = FuKind.ADDER;
OpKindMap[Op.MUL] = FuKind.MULTIPLIER;
OpKindMap[Op.DIV] = FuKind.MULTIPLIER;
OpKindMap[Op.LOAD] = FuKind.MEMORY;
OpKindMap[Op.STORE] = FuKind.MEMORY;


let OpString: {[index:number]: string} = {}
OpString[Op.ADD] = "ADD";
OpString[Op.SUB] = "SUB";
OpString[Op.MUL] = "MUL";
OpString[Op.DIV] = "DIV";
OpString[Op.LOAD] = "LDR";
OpString[Op.STORE] = "STR";

let StringOp: {[index:string]: Op} = {}
StringOp['ADD'] = Op.ADD;
StringOp['SUB'] = Op.SUB;
StringOp['MUL'] = Op.MUL;
StringOp['DIV'] = Op.DIV;
StringOp['LDR'] = Op.LOAD;
StringOp['STR'] = Op.STORE;


function parse(src: string): Program {
    let prg:Program = [];
    for (let row of src.split("\n")) {
        let crow = row.trim();
        if (!crow.length || crow.lastIndexOf(';', 0) === 0)     // is a comment
            continue;
        let rawcmd = crow.split(' ', 1)[0];
        let cmd = rawcmd.trim().toUpperCase();
        let args = crow.substring(rawcmd.length).replace(/\s+/g, '').split(',');
        prg.push(new RawInstruction(StringOp[cmd], args[0],
                                    args.length > 1 ? args[1] : "",
                                    args.length === 3 ? args[2] : ""));
    }
    return prg;
}
class Memory {
    mem: {[index:number]: number} = {}
    currentOpComplete:number = -1;

    constructor(private readLatency:number=0, private writeLatency:number=0) {}


    isBusy() {
        return this.currentOpComplete !== -1;
    }

    read(clock: number, loc:number): number | null {
        console.log("in read");
        if (this.currentOpComplete === -1) {
            console.log("set cop");
            this.currentOpComplete = clock + this.readLatency;
        } else if (clock >= this.currentOpComplete) {
            this.currentOpComplete = -1;
            console.log("set cop done, ret val");
            return this._read(loc);
        }
        console.log("retu null");
        return null
    }

    // return if the op has completed
    write(clock: number, loc:number, value:number): boolean {
        if (this.currentOpComplete === -1) {
            this.currentOpComplete = clock + this.writeLatency;
        } else if (clock === this.currentOpComplete) {
            this.currentOpComplete = -1;
            this._write(loc, value);
            return true;
        }
        return false;
    }


    _read(loc:number): number {
        if (this.mem[loc] === undefined) {
            this.mem[loc] = Math.round(Math.random() * 100);
        }
        return this.mem[loc];
    }

    _write(loc:number, value:number): void {
        this.mem[loc] = value;
    }
}

class XCache {
    /* Base cache implementation, a.k.a. ``no cache''.
     * Extend and override, read() and write() to implement the various
     * cache algorithms.
     */
    private _cache: {[index:number]: number} = {}

    constructor(private mem: Memory) {}

    read(clock: number, loc:number): number | null {
        return this.mem.read(clock, loc);
    }

    write(clock: number, loc:number, value:number): boolean {
        return this.mem.write(clock, loc, value);
    }
}
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
// some spaghetti code from 2AM:w
var ISSUE_EXEC_DELAY:boolean = true;
var EXEC_WRITE_DELAY:boolean = true;

let ex_1_src = `ADD   3,5,R0
SUB  R0,2,R0
MUL  R0,1,R1
DIV  R1,3,R3
`
let ex_2_src = `ADD   3,5,R0
STR  42,R0
LDR  R0,0,R1
ADD  1,R1,R2
`

let menu: HTMLElement = document.getElementById('menu')!;
let ex_1: HTMLElement = document.getElementById('ex-1')!;
let ex_2: HTMLElement = document.getElementById('ex-2')!;
let rdy: HTMLElement = document.getElementById('rdy')!;
let raw_src: HTMLInputElement = <HTMLInputElement>document.getElementById('raw-src')!;

let iaddr: HTMLInputElement = <HTMLInputElement>document.getElementById('iaddr')!;
let imult: HTMLInputElement = <HTMLInputElement>document.getElementById('imult')!;
let ireg: HTMLInputElement  = <HTMLInputElement>document.getElementById('ri')!;
let freg: HTMLInputElement  = <HTMLInputElement>document.getElementById('rf')!;
let ied: HTMLInputElement   = <HTMLInputElement>document.getElementById('ied')!;
let ewd: HTMLInputElement   = <HTMLInputElement>document.getElementById('ewd')!;

let rst: HTMLElement = document.getElementById('reset')!;
let load: HTMLElement = document.getElementById('load')!;
let play: HTMLElement = document.getElementById('play')!;
let pausebtn: HTMLElement = document.getElementById('pause')!;
let one_step: HTMLElement = document.getElementById('step')!;
let speed: HTMLInputElement   = <HTMLInputElement>document.getElementById('speed')!;

function main():void {
    ex_1.onclick = () => raw_src.value = ex_1_src;
    ex_2.onclick = () => raw_src.value = ex_2_src;
    rdy.onclick = setup;

    rst.onclick = () => {
        pause();
        setup();
    }

    load.onclick = () => {
        pause();
        menu.classList.remove('hide')
    }

    play.onclick = playloop;
    pausebtn.onclick = pause;
    one_step.onclick = () => {
        pause();
        STEP()
    };
}

function playloop() {
    if(STEP()) LOOP = setTimeout(playloop, (10/Number(speed.value) * 1000));
}

function pause() {
    if (LOOP) clearTimeout(LOOP);
}


let safeInt = (s:string, fallback=0) => isNaN(parseInt(s, 10)) ? fallback : parseInt(s, 10);

var STEP: () => boolean;
var LOOP: number;

function setup() {
    ISSUE_EXEC_DELAY = ied.checked;
    EXEC_WRITE_DELAY = ewd.checked;


    let emu = new Emulator(
        [
            [FuKind.ADDER, 'ADDR', safeInt(iaddr.value, 3)],
            [FuKind.MULTIPLIER, 'MULT', safeInt(imult.value, 3)],
            [FuKind.MEMORY, 'MEM', 2],
        ],
        {ints: safeInt(ireg.value), floats: safeInt(freg.value)},
        parse(raw_src.value)
    )

    let g = new Graphics(emu);
    g.paint();

    STEP = ():boolean => {
        var notEof = emu.step()
        g.paint();
        return notEof
    }

    menu.classList.add('hide');
}

main();
