import {FuConfig, assembleFunctionalUnits as FuFactory, FunctionalUnit} from './fu'
import {RegConfig, Register} from './reg'
import {Queue} from './queue'
import {Program} from './ins'
import {CdbMessage} from './cdb'

export class Emulator {
    private clock:number = 0;
    private pc:number = 0;

    REG:Register;
    FUs:FunctionalUnit[];
    CDB:Queue<CdbMessage>;

    constructor(fuConf: FuConfig, regConf: RegConfig, private program:Program) {
        this.REG = new Register(regConf);
        this.FUs = FuFactory(fuConf)
    }

    step():boolean {
        if (this.pc == this.program.length) return false;

        this.CDB = new Queue<CdbMessage>();
        this.clock += 1;

        // Issue
        let rawInst = this.program[this.pc];
        let inst = this.REG.patch(rawInst);

        let issued:boolean = false;
        for (let fu of this.FUs) {
            issued = issued || fu.tryIssue(this.clock, inst);
            if (issued) {
                this.REG.setProducer(inst, fu.name);
                break;
            }
        }

        if (!issued) return true;                                  // stall
        this.pc++;
        for (let fu of this.FUs) fu.execute(this.clock);
        for (let fu of this.FUs) fu.writeResult(this.clock, this.CDB);

        // TODO: add opt for yield (4 graphics)
        for (let fu of this.FUs) fu.readCDB(this.CDB);
        this.REG.readCDB(this.CDB);
        return true;
    }
}
