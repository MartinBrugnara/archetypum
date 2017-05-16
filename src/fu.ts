import {Instruction, Op} from './ins'
import {Queue} from './queue'
import {CdbMessage} from './cdb'

interface FunctionalUnit {
    tryIssue(clockTime: number, instr: Instruction): boolean;
    execute(clockTime: number): void;
    writeResult(clockTime: number, cdb: Queue<CdbMessage>): void;
    readCDB(): void;
}

export enum FuKind {ADDER, MULTIPLIER}
let FuMap: {[key:number]: (name:string) => FunctionalUnit} = {}

class FunctionalUnitBaseClass implements FunctionalUnit {
    protected readonly duration: number;
    protected result: number;
    protected instr: Instruction | null = null;
    private endTime: number;

    constructor(readonly kind: FuKind, readonly name: string) {}

    // TODO: in main loop remember to register accepting FU to REG
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
            cdb.push(new CdbMessage(this.name, this.result));
            this.instr = null;
        }
    }

    isBusy(): boolean {
        return !!this.instr;
    }

    readCDB(): void {
        // TODO: implement me here
        throw new Error('Not implemented yet');
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


export type FuConfig = [[FuKind, string, number]];
export function assembleFunctionalUnits(conf: FuConfig): FunctionalUnit[] {
    let fus:FunctionalUnit[] = [];
    for (let fuc of conf) {
        for (let i=0; i<fuc[2]; i++) {
            fus.push(FuMap[fuc[0]](`${fuc[1]}${i}`));
        }
    }
    return fus;
}
