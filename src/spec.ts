class Spec {
    speculative: boolean = false;

    nextPc(instr: RawInstruction, flags: boolean[]): number {
        return Number(instr.src0);
    }

    real (instr: RawInstruction, flags: boolean[]): number {
        if ((instr.op === Op.JZ && flags[Flag.ZF]) || (instr.op === Op.JNZ && !flags[Flag.ZF]))
            return Number(instr.src0);
        else if (instr.op === Op.JMP)
            return Number(instr.src0);
        else
            return instr.rowid + 1;
    }

    validateChoice(head: RobEntry, flags: boolean[]): number {
        let correct = this.real(head.instr, flags);
        return correct !== head.value ? correct : -1;
    }
}


class NoSpec extends Spec {
    nextPc(instr: RawInstruction, flags: boolean[]): number {
        return this.real(instr, flags);
    }
}

class TrueSpec extends Spec {
    speculative = true;

    nextPc(instr: RawInstruction, flags: boolean[]): number {
        return Number(instr.src0);
    }
}

class FalseSpec extends Spec {
    speculative = true;

    nextPc(instr: RawInstruction, flags: boolean[]): number {
        return instr.rowid + 1;
    }
}
