class RawInstruction {
    public issued:number = -1;
    public executed:number = -1;
    public written:number = -1;
    public committed:number = -1;
    public flushed:boolean = false;


    constructor(
        public op: Op,
        public src0: string,
        public src1: string,
        public dst: string,
        public rowid:number
    ){}

    toString(): string {
        return `${OpString[this.op]} ${this.src0}` +
            `${this.src1 ? ',' : ''}${this.src1}` +
            `${this.dst  ? ',' : ''}${this.dst}`;
    }
}

type Program = RawInstruction[];

class Instruction {
    constructor(
        public op: Op,                     // Operation
        public dst: string,                // destination register (only REG)
        public pc: number,                 // Program counter
        public uid: number,                // uid, assigned when issued.

        public vj: number = 0,   // First source operand value
        public vk: number = 0,   // Seconds source operand value
        public qj: string | null = null,   // RS name producing first operand
        public qk: string | null = null,   // RS name producing second operand

        public tag: string | null = null
    ){}

    kind(): FuKind {
        return OpKindMap[this.op];
    }
}


enum Op {ADD, SUB, MUL, DIV, LOAD, STORE, JMP, JZ, JNZ}

let OpKindMap: {[index:number]: FuKind} = {}
OpKindMap[Op.ADD] = FuKind.ADDER;
OpKindMap[Op.SUB] = FuKind.ADDER;
OpKindMap[Op.MUL] = FuKind.MULTIPLIER;
OpKindMap[Op.DIV] = FuKind.MULTIPLIER;
OpKindMap[Op.LOAD]  = FuKind.MEMORY;
OpKindMap[Op.STORE] = FuKind.MEMORY;
OpKindMap[Op.JMP] = FuKind.IU;
OpKindMap[Op.JZ]  = FuKind.IU;
OpKindMap[Op.JNZ] = FuKind.IU;

let OpString: {[index:number]: string} = {}
OpString[Op.ADD] = "ADD";
OpString[Op.SUB] = "SUB";
OpString[Op.MUL] = "MUL";
OpString[Op.DIV] = "DIV";
OpString[Op.LOAD] = "LDR";
OpString[Op.STORE] = "STR";
OpString[Op.JMP] = "JMP";
OpString[Op.JZ]  = "JZ";
OpString[Op.JNZ] = "JNZ";

let StringOp: {[index:string]: Op} = {}
StringOp['ADD'] = Op.ADD;
StringOp['SUB'] = Op.SUB;
StringOp['MUL'] = Op.MUL;
StringOp['DIV'] = Op.DIV;
StringOp['LDR'] = Op.LOAD;
StringOp['STR'] = Op.STORE;
StringOp['JMP'] = Op.JMP;
StringOp['JZ']  = Op.JZ;
StringOp['JNZ'] = Op.JNZ;

let InstrLen: {[index:string]: number} = {}
InstrLen['LDR'] = 2;
InstrLen['STR'] = 2;
InstrLen['JMP'] = 0;
InstrLen['JZ']  = 0;
InstrLen['JNZ'] = 0;


function parse(src: string): Program {
    let prg:Program = [];
    let rowid:number = 0;
    for (let row of src.split("\n")) {
        let crow = row.trim();
        if (!crow.length || crow.lastIndexOf(';', 0) === 0) // skip comments
            continue;
        let rawcmd = crow.split(' ', 1)[0];
        let cmd = rawcmd.trim().toUpperCase();

        if (!(cmd in StringOp)) // not valid instr
            throw new Error(`${cmd} is not a valid instruction`);

        let args = crow.substring(rawcmd.length).replace(/\s+/g, '').split(',');

        if (cmd in InstrLen && InstrLen[cmd] !== args.length) // wrong # of args
            throw new Error(`${cmd} expects ${InstrLen[cmd]} operands, got ${args.length}`);
        if (!(cmd in InstrLen) && args.length !== 3)
            throw new Error(`${cmd} expects 3 operands, got ${args.length}`);

        prg.push(new RawInstruction(StringOp[cmd], args[0],
                                    args.length > 1 ? args[1] : "",
                                    args.length === 3 ? args[2] : "",
                                    rowid++));
    }
    return prg;
}
