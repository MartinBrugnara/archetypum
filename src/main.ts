enum FuKind {
    ADDER,
    MULTIPLIER
}

enum Op {
    ADD,
    SUB,
    MUL,
    DIV
}

class CdbMessage {
    constructor(rsName: string, result: number) {}
}

class FunctionalUnit {
    readonly duration: number;
    protected result: number;
    protected instr: Instruction | null = null;
    private endTime: number;

    constructor(readonly kind: FuKind, readonly name: string) {}

    // TODO: in main loop remember to register accepting FU to REG
    tryIssue(clockTime: number, instr: Instruction): boolean {
        if (this.kind !== instr.kind || this.isBusy())
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
            cdb.push(new CdbMessage(this.name, this.result));
            this.instr = null;
        }
    }

    isBusy(): boolean {
        return !!this.instr;
    }

    readCDB(): void {
        throw new Error('Not implemented yet');
    }
}

class Queue<T> {
    _store: T[] = [];
    push(val: T) {
        this._store.push(val);
    }
    pop(): T | undefined {
        return this._store.shift();
    }
}

class Instruction {
    kind: FuKind;
    op: Op;                // Operation
    vj: number | null = null;     // First source operand value
    vk: number | null = null;     // Seconds source operand value
    qj: string;             // Reservation Station name producing first operand
    qk: string;             // Reservation Station name producing second operand
}

class Adder extends FunctionalUnit {
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

class Multiplier extends FunctionalUnit {
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

