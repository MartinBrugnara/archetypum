import {FuKind} from './fu'

class RawInstruction {
    constructor(
        public op: Op,
        public src0: string,
        public src1: string | null = null,
        public dst: string | null = null
    ){}
}

export class Instruction {
    constructor(
        public op: Op,                     // Operation
        public vj: number | null = null,   // First source operand value
        public vk: number | null = null,   // Seconds source operand value
        public qj: string | null = null,                 // RS name producing first operand
        public qk: string | null = null,                 // RS name producing second operand
        public qi: string                  // destination register (only REG)
    ){}

    kind(): FuKind {
        return OpKindMap[this.op];
    }
}


export enum Op {ADD, SUB, MUL, DIV}

let OpKindMap: {[index:number] : FuKind} = {}
OpKindMap[Op.ADD] = FuKind.ADDER;
OpKindMap[Op.SUB] = FuKind.ADDER;
OpKindMap[Op.MUL] = FuKind.MULTIPLIER;
OpKindMap[Op.DIV] = FuKind.MULTIPLIER;
