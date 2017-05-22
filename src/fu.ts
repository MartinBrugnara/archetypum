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
