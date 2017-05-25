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

    computeValue(): boolean {
        throw new Error('Implement in child');
    }

    /* Return rowid (pc) when it writes a result, -1 otherwise. */
    writeResult(clockTime: number, cdb: Queue<CdbMessage>): number {
        if (this.isBusy && this.endTime === clockTime) {
            this.computeValue();
            cdb.push(new CdbMessage(this.instr!.tag || this.name, this.result, this.instr!.dst));
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

class MemoryFU extends FunctionalUnitBaseClass {
    /* MemoryFU is responsible for:
     * - computing actual address (and simulate latency here)
     * - read / write to memory manager (external component)
     *   and wait until completes.
     */

    // Duration iif to compute addr & offset
    duration = 1; // TODO: get from config
    startTime: number | null = null;

    /* Returns rowid (pc) when exec start, -1 otherwise */
    execute(clockTime: number): number {
        if (
            this.isBusy() && this.isReady() &&
            (!this.endTime || this.endTime < clockTime) &&
            (clockTime >= (this.issuedTime + Number(ISSUE_EXEC_DELAY))) &&
            !this.waiting
        ) {
            // Start execution
            this.waiting = true;
            return this.instr!.pc
        }

        if (this.waiting && (clockTime >= (
                this.issuedTime + Number(ISSUE_EXEC_DELAY)) +
                // If offset, pay "addition" time
                (this.instr!.vk !== 0 ? this.duration : 0)
            )
        ) {
            let done=false;
            switch (this.instr!.op) {
                case Op.LOAD:
                    let value = this.memMgm.read(this.name, clockTime, this.instr!.vj + this.instr!.vk);
                    if (value !== null) { // done
                        this.result = value;
                        done = true;
                    }
                    break
                case Op.STORE:
                    done = this.memMgm.write(this.name, clockTime, this.instr!.vj, this.instr!.vk))
                    this.instr!.dst = this.instr!.vk;
                    this.result = this.instr!.vj;
                    break
            }

            if (done) {
                this.endTime = clockTime + Number(EXEC_WRITE_DELAY);
                this.waiting = false;
            }
        }

        return -1;
    }

    computeValue() {
        /* If any value has been read is already in results.
         * In case of STORE, nothing has to be returned.
         * --> do nothing.
         */
    }
}
FuMap[FuKind.MEMORY] = (name:string, kwargs: KwArgs) => new MemoryFU(name, kwargs);
