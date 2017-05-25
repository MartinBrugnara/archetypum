class Spec {
    speculative: boolean = false;

    nextPc(instr: RawInstruction, flags: boolean[]): number {
        return Number(instr.src0);
    }

    real (instr: RawInstruction, flags: boolean[]): number {
        if ((Op.JZ && flags[Flag.ZF]) || (Op.JNZ && !flags[Flag.ZF]))
            return Number(instr.src0);
        else
            return instr.rowid + 1;
    }

    validateChoice(head: RobEntry, flags: boolean[]): number {
        let correct = this.real(head.instr, flags);
        if (correct !== head.value)
            return correct
        else
            return -1;
    }

}


class NoSpec extends Spec {
    nextPc(instr: RawInstruction, flags: boolean[]): number {
        return this.real(instr, flags);
    }
}

class YesSpec extends Spec {
    speculative = true;

    nextPc(instr: RawInstruction, flags: boolean[]): number {
        return Number(instr.src0);
    }
}
