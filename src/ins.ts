
 class RawInstruction {
    public issued:number = -1;
    public executed:number = -1;
    public written:number = -1;


    constructor(
        public op: Op,
        public src0: string,
        public src1: string,
        public dst: string
    ){}

    toString(): string {
        return `${OpString[this.op]} ${this.src0},${this.src1},${this.dst}`;
    }
}

 type Program = RawInstruction[];

 class Instruction {
    constructor(
        public op: Op,                     // Operation
        public dst: string,                // destination register (only REG)
        public pc: number,

        public vj: number = 0,   // First source operand value
        public vk: number = 0,   // Seconds source operand value
        public qj: string | null = null,   // RS name producing first operand
        public qk: string | null = null    // RS name producing second operand
    ){}

    kind(): FuKind {
        return OpKindMap[this.op];
    }
}


enum Op {ADD, SUB, MUL, DIV}

let OpKindMap: {[index:number] : FuKind} = {}
OpKindMap[Op.ADD] = FuKind.ADDER;
OpKindMap[Op.SUB] = FuKind.ADDER;
OpKindMap[Op.MUL] = FuKind.MULTIPLIER;
OpKindMap[Op.DIV] = FuKind.MULTIPLIER;

let OpString: {[index:number]: string} = {}
OpString[Op.ADD] = "ADD";
OpString[Op.SUB] = "SUB";
OpString[Op.MUL] = "MUL";
OpString[Op.DIV] = "DIV";
