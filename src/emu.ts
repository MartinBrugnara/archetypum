 class Emulator {
    public clock:number = 0;
    public pc:number = 0;

    REG:Register;
    FUs:FunctionalUnit[];
    CDB:Queue<CdbMessage>;

    constructor(fuConf: FuConfig, regConf: RegConfig, public readonly program:Program) {
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
            let inst = this.REG.patch(rawInst, this.pc);

            let issued:boolean = false;
            for (let fu of this.FUs) {
                if (fu.tryIssue(this.clock, inst)) {
                    this.program[this.pc].issued = this.clock;
                    this.REG.setProducer(inst, fu.name);
                    this.pc++;
                    break;
                }
            }
        }

        for (let fu of this.FUs) {
            let rowid = fu.execute(this.clock);
            if (rowid >= 0) this.program[rowid].executed = this.clock;
        }

        for (let fu of this.FUs) {
            let rowid = fu.writeResult(this.clock, this.CDB);
            if (rowid >= 0) this.program[rowid].written = this.clock;
        }

        // TODO: add opt for yield (4 graphics)
        for (let fu of this.FUs) fu.readCDB(this.CDB);
        this.REG.readCDB(this.CDB);

        // if all fu are not busy end
        for (let fu of this.FUs) if (fu.isBusy()) return true;
        return this.pc < this.program.length;
    }
}
