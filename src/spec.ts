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
        console.log("valdiate choice");
        let correct = this.real(head.instr, flags);
        if (correct !== head.value) {
            console.log('validate WRONG', head, flags);
            return correct;
        }
        else {
            console.log('validate correct', head, flags);
            return -1;
        }
    }

}


class NoSpec extends Spec {
    nextPc(instr: RawInstruction, flags: boolean[]): number {
        console.log('noSpec nextPc', instr, flags, this.real(instr, flags))
        return this.real(instr, flags);
    }
}

class YesSpec extends Spec {
    speculative = true;

    nextPc(instr: RawInstruction, flags: boolean[]): number {
        return Number(instr.src0);
    }
}
