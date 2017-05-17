 class Emulator {
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
        if (this.clock > 20) { // DEBUG, safety stop
            console.error("Shiit 20 iteration?");
            return false;
        }


        this.CDB = new Queue<CdbMessage>();
        this.clock += 1;

        if (this.pc < this.program.length) {       // If code then issue
            let rawInst = this.program[this.pc];
            let inst = this.REG.patch(rawInst);

            let issued:boolean = false;
            for (let fu of this.FUs) {
                if (fu.tryIssue(this.clock, inst)) {
                    this.REG.setProducer(inst, fu.name);
                    this.pc++;
                    break;
                }
            }
        }

        for (let fu of this.FUs) fu.execute(this.clock);
        for (let fu of this.FUs) fu.writeResult(this.clock, this.CDB);

        // TODO: add opt for yield (4 graphics)
        for (let fu of this.FUs) fu.readCDB(this.CDB);
        this.REG.readCDB(this.CDB);

        // if all fu are not busy end
        for (let fu of this.FUs) if (fu.isBusy()) return true;
        return this.pc < this.program.length;
    }
}
