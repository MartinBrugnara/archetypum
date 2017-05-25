class Spec {
    speculative: boolean = false;

    nextPc(instr: Instruction, flags: boolean[]): {
    }

    real (instr: Instruction, flags: boolean[]): {
        if ((Op.JZ && flages[Flag.ZF]) || (Op.JNZ && !flages[Flag.ZF]))
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
    nextPc(instr: Instruction, flags: boolean[]): number {
        return this.real(instr, flags);
    }
}

class YesSpec extends Spec {
    speculative = true;

    nextPc(instr: Instruction, flags: boolean[]): number {
        return Number(instr.src0);
    }
}
