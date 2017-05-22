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
