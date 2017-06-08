abstract class BranchPredictor {
    speculative: boolean = true;

    constructor(readonly N:number=0, readonly K:number=0) {}

    abstract nextPc(instr: RawInstruction, flags: boolean[]): number;


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

let BpMap: {[key:string]: (n:number, k:number ) => BranchPredictor} = {}

// Static predictors
class NonSpeculative extends BranchPredictor {
    speculative: boolean = false;

    nextPc(instr: RawInstruction, flags: boolean[]): number {
        return this.real(instr, flags);
    }
}
BpMap['non'] = (n:number, k:number ) => new NonSpeculative(n,k);

class AlwaysTaken extends BranchPredictor {
    nextPc(instr: RawInstruction, flags: boolean[]): number {
        return Number(instr.src0);
    }
}
BpMap['at'] = (n:number, k:number ) => new AlwaysTaken (n,k);

class AlwaysNotTaken extends BranchPredictor {
    nextPc(instr: RawInstruction, flags: boolean[]): number {
        return instr.rowid + 1;
    }
}
BpMap['ant'] = (n:number, k:number ) => new AlwaysNotTaken (n,k);

class BTFNT extends BranchPredictor {
    nextPc(instr: RawInstruction, flags: boolean[]): number {
        let jaddr = Number(instr.src0);
        return jaddr < instr.rowid ? jaddr : instr.rowid + 1;
    }
}
BpMap['btfnt'] = (n:number, k:number ) => new BTFNT(n,k);

// Dynamic predictors
class NBit extends BranchPredictor  {
    BHT:number[] = [];
    LastPred:boolean[] = [];
    AddrTag:number[] = [];

    reset(idx: number) {
        this.BHT[idx] = this.N/2;
        this.LastPred[idx] = false;
        this.AddrTag[idx] = -1;
    }

    constructor(readonly N:number, readonly K:number) {
        super(N, K);
        for (let k=0; k<K; k++) {
            this.BHT.push(N/2);
            this.LastPred.push(false);
            this.AddrTag.push(-1);
        }
    }

    nextPc(instr: RawInstruction, flags: boolean[]): number {
        let idx = instr.rowid % this.K;

        if (this.AddrTag[idx] !== instr.rowid) {
            this.reset(idx);
            this.AddrTag[idx] = instr.rowid;
        }

        let pval = this.BHT[idx];
        this.LastPred[idx] = pval > this.N/2 || (pval === this.N/2 && this.LastPred[idx]);
        return this.LastPred[idx] ?  Number(instr.src0) : instr.rowid + 1;
    }

    validateChoice(head: RobEntry, flags: boolean[]): number {
        let ret = super.validateChoice(head, flags);


        // Update local stats
        let idx = head.instr.rowid % this.K;

        if (this.AddrTag[idx] === head.instr.rowid) {
            this.BHT[idx] += this.real(head.instr, flags) === Number(head.instr.src0) ? 1 : -1;
            this.BHT[idx] = Math.max(0, Math.min(this.BHT[idx], this.N));
        }

        return ret;
    }
}
BpMap['nbit'] = (n:number, k:number ) => new NBit(n,k);
