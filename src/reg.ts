import {RawInstruction, Instruction} from './ins'
import {Queue} from './queue'
import {CdbMessage} from './cdb'


export type RegConfig = {ints:number, floats:number};

export class Register {
    private regs: {[key:string]: number} = {};
    private qi: {[key:string]: string | null} = {};

    constructor(conf:RegConfig){
        for(let i=0; i<conf.ints; i++) {
            this.regs[`R${i}`] = 0;
            this.qi[`R${i}`] = null;
        }
        for(let f=0; f<conf.floats; f++) {
            this.regs[`F${f}`] = 0;
            this.qi[`F${f}`] = null;
        }
    }

    patch(ri: RawInstruction):Instruction {
        let ins = new Instruction(ri.op, ri.dst);

        ins.vj = parseInt(ri.src0, 10);
        if (isNaN(ins.vj)) {                        // then src0 is a reg name
            ins.vj = this.regs[ri.src0]
            if (isNaN(ins.vj)) {                    // then we wait for RS
                ins.vj = null;
                ins.qj = this.qi[ri.src0];
            }
        }

        if (ri.src1 !== null) {
            ins.vk = parseInt(ri.src1, 10);
            if (isNaN(ins.vk)) {                     // then src1 is a reg name
                ins.vk = this.regs[ri.src1]
                if (isNaN(ins.vk)) {                 // then we wait for RS
                    ins.vk = null;
                    ins.qk = this.qi[ri.src1];
                }
            }
        }

        return ins
    }

    setProducer(inst: Instruction, rs: string) {
        this.regs[inst.dst] = 0;
        this.qi[inst.dst] = rs;
    }

    readCDB(cdb: Queue<CdbMessage>): void {
        for (let msg of cdb) {
            if (this.qi[msg.dst] === msg.rsName) { // if were still waiting for it
                this.regs[msg.dst] = msg.result;
                this.qi[msg.dst] = null;
            }
        }
    }
}
