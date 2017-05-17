
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
