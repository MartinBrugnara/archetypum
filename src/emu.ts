 class Emulator {
    public clock:number = 0;
    public pc:number = 0;

    REG:Register;
    FUs:FunctionalUnit[];
    CDB:Queue<CdbMessage>;
    ROB:Rob;
    useRob:boolean = false;

    constructor(
            fuConf: FuConfig,
            regConf: RegConfig,
            robSize: number, // if 0 then disable
            public cache:XCache,
            public readonly program:Program
    ) {
        this.REG = new Register(regConf);
        this.FUs = FuFactory(fuConf)
        if (robSize) {
            this.ROB = new Rob(robSize);
            this.useRob = true;
        }
    }

    step():boolean {
        this.CDB = new Queue<CdbMessage>();
        this.clock += 1;

        if (this.pc < this.program.length) {       // If code then issue
            let rawInst = this.program[this.pc];

            let inst = this.REG.patch(rawInst, this.pc,
                this.useRob ? this.ROB.patcher : this.REG.patcher);

            let issued:boolean = false;
            if (!this.useRob || !this.ROB.isFull()) {
                inst.tag = this.ROB.nextTag();
                for (let fu of this.FUs) {             // find free FU
                    if (fu.tryIssue(this.clock, inst)) {
                        this.program[this.pc].issued = this.clock;
                        if (this.useRob) {
                            this.ROB.push(new RobEntry(rawInst, rawInst.dst));
                        } else {
                            this.REG.setProducer(inst, fu.name);
                        }
                        this.pc++;
                        break;
                    }
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

        // ROB: rob.readCDB(this.CDB);
        // ROB: rob.commit() & handle spec

        // TODO: add opt for yield (4 graphics)
        // ROB: comment out
        for (let fu of this.FUs) fu.readCDB(this.CDB);
        this.REG.readCDB(this.CDB);

        // if all fu are not busy end
        for (let fu of this.FUs) if (fu.isBusy()) return true;
        // ROB: && rob.isEmpty();
        return this.pc < this.program.length;
    }
}
