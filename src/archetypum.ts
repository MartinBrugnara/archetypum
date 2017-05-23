 class CdbMessage {
    constructor(public rsName: string, public result: number, public dst: string) {}
}
 class Emulator {
    public clock:number = 0;
    public pc:number = 0;

    REG:Register;
    FUs:FunctionalUnit[];
    CDB:Queue<CdbMessage>;

    constructor(
            fuConf: FuConfig,
            regConf: RegConfig,
            public cache:XCache,
            public readonly program:Program
    ) {
        this.REG = new Register(regConf);
        this.FUs = FuFactory(fuConf)
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
type KwArgs = {[key:string]: any}
let FuMap: {[key:number]: (name:string, kwargs: KwArgs) => FunctionalUnit} = {}

class FunctionalUnitBaseClass implements FunctionalUnit {
    protected readonly duration: number;
    protected result: number;
    protected instr: Instruction | null = null;

    protected issuedTime: number = -1;
    protected endTime: number = -1;

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

    constructor(name: string, kwargs: KwArgs) {
        super(FuKind.ADDER, name);
        if ('duration' in kwargs)
            this.duration = kwargs.duration;
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
FuMap[FuKind.ADDER] = (name:string, kwargs: KwArgs) => new Adder(name, kwargs);

class Multiplier extends FunctionalUnitBaseClass {
    readonly duration = 4;

    constructor(name: string, kwargs: KwArgs) {
        super(FuKind.MULTIPLIER, name);
        if ('duration' in kwargs)
            this.duration = kwargs.duration;
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
FuMap[FuKind.MULTIPLIER] = (name:string, kwargs: KwArgs) => new Multiplier(name, kwargs);


type FuConfig = [[FuKind, string, number, KwArgs]];
function FuFactory(conf: FuConfig): FunctionalUnit[] {
    let fus:FunctionalUnit[] = [];
    for (let fuc of conf) {
        for (let i=0; i<fuc[2]; i++) {
            fus.push(FuMap[fuc[0]](`${fuc[1]}${i}`, <KwArgs>fuc[3]));
        }
    }
    return fus;
}



class MemoryMGM extends FunctionalUnitBaseClass {
    readonly duration = 0;
    private cache: XCache;
    private isComputing: boolean=false;

    constructor(name: string, kwargs: KwArgs) {
        super(FuKind.MEMORY, name);
        this.cache = <XCache>kwargs['cache'];
    }

    computeValue() {
        console.error('I should never be invoked');
    }

    /* Returns rowid (pc) when exec start, -1 otherwise */
    execute(clockTime: number): number {
        if (this.isBusy() && this.isReady() &&
            (clockTime >= (this.issuedTime + Number(ISSUE_EXEC_DELAY)))) {

            if (this.endTime >= clockTime)
                return -1; // result already computed, waiting 2 write.

            let done:boolean = false;
            switch (this.instr!.op) {
                case Op.LOAD:
                    let value = this.cache.read(clockTime, this.instr!.vk + this.instr!.vj);
                    if (value !== null) {
                        this.result = value
                        done = true;
                    }
                    break;
                case Op.STORE:
                    done = this.cache.write(clockTime, this.instr!.vk, this.instr!.vj);
                    break;
            }

            if (done) this.endTime = clockTime + Number(EXEC_WRITE_DELAY);

            if (!this.isComputing) {
                this.isComputing = true;
                return this.instr!.pc
            }
        }
        return -1;
    }

    /* Return rowid (pc) when it writes a result, -1 otherwise. */
    /* NOTE: endTime is considered as minEndTime (account for delays).
     * We relay on cache output to compute the actual exec time. */
    writeResult(clockTime: number, cdb: Queue<CdbMessage>): number {
        if (this.endTime !== clockTime) return -1;

        if (this.instr!.op === Op.LOAD)
            cdb.push(new CdbMessage(this.name, this.result, this.instr!.dst));

        this.isComputing = false;
        this.endTime = -1;

        let pc = this.instr!.pc;
        this.instr = null;
        return pc;
    }
}
FuMap[FuKind.MEMORY] = (name:string, kwargs: KwArgs) => new MemoryMGM(name, kwargs);
class Graphics {

    clk: HTMLElement = document.getElementById('clock')!;
    src: HTMLElement = document.getElementById('sourcecode')!;
    rs: HTMLElement = document.getElementById('rs')!;
    reg: HTMLElement = document.getElementById('reg')!;
    cache: HTMLElement = document.getElementById('cache')!;

    constructor(private emu: Emulator) {}

    paint(): void {
        this.clk.innerHTML = String(this.emu.clock);
        this.src.innerHTML = this.renderSrc();
        this.rs.innerHTML = this.renderRS();
        this.reg.innerHTML = this.renderREG();
        this.cache.innerHTML = this.renderCache();
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

    renderCache(): string {
        if (this.emu.cache.size === 0) return "";

        let html:string[][] = [];
        html.push([
            '<caption>cache | hit&nbsp;',
            String(Math.round(this.emu.cache.readHit / (this.emu.cache.readHit + this.emu.cache.readMiss) * 100)),
            '% - evictions ', String(this.emu.cache.evictions),
            '</caption><thead><tr><th></th>'
        ]);
        for(let j=0; j<this.emu.cache.n;j++) html.push(['<th>', String(j), '</th>']);
        html.push(['</tr></thead>']);

        html.push(['<tbody>']);
        for(let i=0; i<this.emu.cache.size / this.emu.cache.n;i++) {
            html.push(['<tr><td>', String(i), '</td>']);
            for(let j=0; j<this.emu.cache.n;j++) {
                let entry = this.emu.cache._cache[i][j];
                html.push(['<td>',entry.join(','), '</td>']);
            }
            html.push(['</tr>']);
        }
        html.push(['</tbody>']);

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
class MemConf {
    constructor(
        public readonly readLatency:number,
        public readonly writeLatency:number,
    ){}
}

class Memory {
    mem: {[index:number]: number} = {}
    currentOpComplete:number = -1;

    private readLatency:number=0
    private writeLatency:number=0

    constructor(c: MemConf) {
        this.readLatency = c.readLatency;
        this.writeLatency = c.writeLatency;
    }

    isBusy() {
        return this.currentOpComplete !== -1;
    }

    read(clock: number, loc:number): number | null {
        if (this.currentOpComplete === -1) {
            this.currentOpComplete = clock + this.readLatency;
        } else if (clock >= this.currentOpComplete) {
            this.currentOpComplete = -1;
            return this._read(loc);
        }
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
            this.mem[loc] = Math.floor(Math.random() * 100);
        }
        return this.mem[loc];
    }

    _write(loc:number, value:number): void {
        this.mem[loc] = value;
    }
}

type CacheConf = {[key:string]: any}
let XCacheMap: {[key:string]: (c: CacheConf) => XCache} = {}

function XCacheFactory(name:string, c: CacheConf): XCache {
    if (name in XCacheMap)
        return XCacheMap[name](c);
    else
        return new XCache(c);
}
// (in_use, index, value, dirty)
type XCacheEntry = [boolean, number, number, boolean];

class XCache {
    /* Base cache implementation, a.k.a. ``no cache''.
     * Extend and override, read() and write() to implement the various
     * cache algorithms.
     */
    public _cache: {[index:number]: XCacheEntry[]} = {};
    public n: number;
    public size: number;

    public readMiss: number = 0;
    public readHit: number = 0;
    public evictions: number = 0;

    protected mem: Memory;

    constructor(c: CacheConf) {
        if (c['mem'] !== undefined)
            this.mem = <Memory>c.mem;
    }

    read(clock: number, loc:number): number | null {
        return this.mem.read(clock, loc);
    }

    write(clock: number, loc:number, value:number): boolean {
        return this.mem.write(clock, loc, value);
    }
}
XCacheMap["no-cache"] = (c: CacheConf) => new XCache(c);


class NWayCache extends XCache {
    private isWriteBack: boolean ; // if false, write through

    private readLatency: number;
    private writeLatency: number;

    private currentOpComplete:number = -1;
    private miss = false;
    private writing: XCacheEntry | null = null;

    private result: number | null;

    constructor(c: CacheConf) {
        super(c);
        this.n =  'n' in c ? c['n'] : 2;
        this.size = 'size' in c ? c['size'] : 4;
        this.isWriteBack = 'iswriteback' in c ? c['iswriteback'] : false;
        this.readLatency = 'readLatency' in c ? c['readLatency'] : 0;
        this.writeLatency = 'writeLatency' in c ? c['readLatency'] : 0;

        if (this.size % this.n !== 0)
            throw new Error("Invalid (N,Size) paraemters combination");

        for (let i=0; i<this.size/this.n; i++) {
            this._cache[i] = [];
            for (let j=0; j<this.n; j++)
                this._cache[i].push( [false, 0, 0, false] );
        }
    }

    isBusy() {
        return this.currentOpComplete !== -1;
    }

    findValue(loc:number): number | null {
        let i = loc % this.n;
        for (let j=0; j<this.n; j++) {
            let entry = this._cache[i][j]
            if (entry[0] && entry[1] === loc) {
                return entry[2]
            }
        }
        return null;
    }

    setValue(loc:number, value:number, dirty:boolean=false): XCacheEntry | null {
        let i = loc % this.n;

        // Try replace
        for (let j=0; j<this.n; j++) {
            let entry = this._cache[i][j]
            if (entry[0] && entry[1] === loc) {
                this._cache[i][j] = [true, loc, value, dirty];
                return null;
            }
        }

        // Try find empty
        for (let j=0; j<this.n; j++) {
            let entry = this._cache[i][j]
            if (!entry[0]) {
                this._cache[i][j] = [true, loc, value, dirty];
                return null;
            }
        }

        // Evict: random cache eviction protocol
        let j = Math.floor(Math.random() * this.n);
        let entry = this._cache[i][j];
        this._cache[i][j] = [true, loc, value, dirty];
        if (entry[3] === true) {
            this.evictions++;
            return entry;
        }
        return null;
    }


    read(clock: number, loc:number): number | null {
        /* look if in local cache */
        if (this.currentOpComplete === -1) {
            this.currentOpComplete = clock + this.readLatency;
        }

        if (clock === this.currentOpComplete)  {
            let value = this.findValue(loc);
            if (value !== null) { // cache hit
                this.currentOpComplete = -1;
                this.readHit++;
                return value;
            } else {
                this.readMiss++;
                this.miss = true;
            }
        }

        if (this.miss) {
            let value = this.mem.read(clock, loc);

            if (value !== null) {
                this.miss = false;

                let evicted = this.setValue(loc, value); // update cache
                if (evicted !== null && this.isWriteBack) {
                    this.result = value;
                    this.writing = evicted;
                } else {
                    this.currentOpComplete = -1;
                    return value;
                }
            }
        }

        if (this.writing !== null) {
            if (this.mem.write(clock, this.writing[1], this.writing[2])) {
                let retval = this.result;
                this.result = null;
                this.writing = null;
                this.currentOpComplete = -1;
                return retval;
            }
        }

        return null;
    }

    write(clock: number, loc:number, value:number): boolean {
        /* look if in local cache */
        if (this.currentOpComplete === -1)
            this.currentOpComplete = clock + this.writeLatency;

        if (clock < this.currentOpComplete) return false;

        if (clock === this.currentOpComplete)  {
            let evicted = this.setValue(loc, value, true);

            if (evicted !== null && this.isWriteBack) {
                this.writing = evicted;
            }

            if (!this.isWriteBack) { // writethrough
                this.writing = [true, loc, value, true];
            }
        }

        if (this.writing !== null) {
            if (this.mem.write(clock, this.writing[1], this.writing[2])) {
                this.writing = null;
            }
        }

        if (this.writing === null) {
            this.currentOpComplete = -1;
            return true;
        } else {
            return false;
        }
    }
}
XCacheMap["nwayset"] = (c: CacheConf) => new NWayCache(c);
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

let menu_load: HTMLElement = document.getElementById('menu-load')!;
let menu_conf: HTMLElement = document.getElementById('menu-conf')!;
let ex_1: HTMLElement = document.getElementById('ex-1')!;
let ex_2: HTMLElement = document.getElementById('ex-2')!;
let rdy: HTMLElement = document.getElementById('rdy')!;
let apply_conf: HTMLElement = document.getElementById('apply_conf')!;
let raw_src: HTMLInputElement = <HTMLInputElement>document.getElementById('raw-src')!;

let iaddr: HTMLInputElement = <HTMLInputElement>document.getElementById('iaddr')!;
let iaddrd: HTMLInputElement = <HTMLInputElement>document.getElementById('iaddrd')!;
let imult: HTMLInputElement = <HTMLInputElement>document.getElementById('imult')!;
let imultd: HTMLInputElement = <HTMLInputElement>document.getElementById('imultd')!;
let ireg: HTMLInputElement  = <HTMLInputElement>document.getElementById('ri')!;
let freg: HTMLInputElement  = <HTMLInputElement>document.getElementById('rf')!;
let ied: HTMLInputElement   = <HTMLInputElement>document.getElementById('ied')!;
let ewd: HTMLInputElement   = <HTMLInputElement>document.getElementById('ewd')!;
let rl: HTMLInputElement   = <HTMLInputElement>document.getElementById('rl')!;
let wl: HTMLInputElement   = <HTMLInputElement>document.getElementById('wl')!;
let ca: HTMLSelectElement   = <HTMLSelectElement>document.getElementById('cache_alg')!;
let crl: HTMLInputElement   = <HTMLInputElement>document.getElementById('crl')!;
let cwl: HTMLInputElement   = <HTMLInputElement>document.getElementById('cwl')!;
let nways: HTMLInputElement   = <HTMLInputElement>document.getElementById('nways')!;
let csize: HTMLInputElement   = <HTMLInputElement>document.getElementById('csize')!;

let rst: HTMLElement = document.getElementById('reset')!;
let conf: HTMLElement = document.getElementById('conf')!;
let load: HTMLElement = document.getElementById('load')!;
let play: HTMLElement = document.getElementById('play')!;
let pausebtn: HTMLElement = document.getElementById('pause')!;
let one_step: HTMLElement = document.getElementById('step')!;
let speed: HTMLInputElement   = <HTMLInputElement>document.getElementById('speed')!;

function main():void {
    ex_1.onclick = () => raw_src.value = ex_1_src;
    ex_2.onclick = () => raw_src.value = ex_2_src;

    rdy.onclick = () => {
        setup();
        menu_load.classList.add('hide');
    }

    apply_conf.onclick = () => {
        pause();
        setup();
        menu_conf.classList.add('hide');
    }

    rst.onclick = () => {
        pause();
        setup();
    }

    load.onclick = () => {
        pause();
        menu_load.classList.remove('hide')
    }

    conf.onclick = () => {
        pause();
        menu_conf.classList.remove('hide')
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

    let MEM:Memory = new Memory(new MemConf(safeInt(rl.value,1), safeInt(wl.value,2)));
    let ca_val = (<HTMLOptionElement>ca.options[ca.selectedIndex]).value;
    let CACHE:XCache = XCacheFactory(ca_val.split('_')[0], {
        'mem': MEM,
        'n': safeInt(nways.value, 2),
        'size': safeInt(csize.value, 4),
        'readLatency': safeInt(crl.value, 0),
        'writeLatency': safeInt(cwl.value, 0),
        'iswriteback' : ca_val.split('_')[1] === 'wb',
    });

    let emu = new Emulator(
        [
            [FuKind.ADDER, 'ADDR', safeInt(iaddr.value, 3), {duration: safeInt(iaddrd.value, 2)}],
            [FuKind.MULTIPLIER, 'MULT', safeInt(imult.value, 3), {duration: safeInt(imultd.value, 4)}],
            [FuKind.MEMORY, 'MEM', 1, {cache: CACHE}],
        ],
        {ints: safeInt(ireg.value), floats: safeInt(freg.value)},
        CACHE,
        parse(raw_src.value),
    )

    let g = new Graphics(emu);
    g.paint();

    STEP = ():boolean => {
        var notEof = emu.step()
        g.paint();
        return notEof
    }
}

main();
