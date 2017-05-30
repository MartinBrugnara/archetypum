class Emulator {
    public clock:number = 0;
    public pc:number = 0;
    public uid:number = 0;

    REG:Register;
    FUs:FunctionalUnit[];
    CDB:Queue<CdbMessage>;
    ROB:Rob;
    useRob:boolean = false;

    public hist:Program = [];

    constructor(
        fuConf: FuConfig,
        regConf: RegConfig,
        robSize: number, // if 0 then disable
        public cache:XCache,
        public memMgm:MemoryMGM,
        public IU:BranchPredictor,
        public readonly program:Program
    ) {
        this.REG = new Register(regConf);
        this.FUs = FuFactory(fuConf)
        if (robSize) {
            this.ROB = new Rob(robSize, memMgm, IU);
            this.useRob = true;
        }
    }

    step():boolean {
        this.CDB = new Queue<CdbMessage>();
        this.clock += 1;

        if (this.pc < this.program.length) {       // If code then issue
            let rawInst = this.program[this.pc];
            let re = new RobEntry(rawInst, rawInst.dst, this.uid);
            let inst = this.REG.patch(rawInst, this.useRob ? this.ROB.patcher : this.REG.patcher, this.uid);

            if (!this.useRob || !this.ROB.isFull()) {
                if (this.useRob) inst.tag = this.ROB.nextTag();
                let issued = false;
                let name = '';

                // TODO: check me
                if (OpKindMap[inst.op] === FuKind.IU) {
                    if (
                            this.IU.speculative ||
                            (!this.IU.speculative && this.ROB.isEmpty()) ||
                            inst.op === Op.JMP
                    ) {
                        this.pc = this.IU.nextPc(rawInst, this.REG.FLAGS);
                        // TODO: reconsider +1
                        /* Not tech correct, but since we flush from top only is OK.
                         * It should be marked as ready only once the previous op has been completed
                         */
                        re.ready = this.clock;
                        re.value = this.pc; // (possibly wrongly speculated value)
                        issued = true;
                    }
                    name = 'IU';
                } else {
                    for (let fu of this.FUs) {             // find free FU
                        if (fu.tryIssue(this.clock, inst)) {
                            issued = true;
                            this.pc++;
                            name = fu.name;
                            break;
                        }
                    }
                }

                if (issued) {
                    this.hist.push(clone(rawInst));
                    this.hist[this.uid].issued = this.clock;
                    if (this.useRob) {
                        this.ROB.push(re);
                    } else {
                        this.REG.setProducer(inst, name);
                    }
                    this.uid++;
                }
            }
        }

        for (let fu of this.FUs) {
            let rowid = fu.execute(this.clock);
            if (rowid >= 0) this.hist[rowid].executed = this.clock;
        }

        for (let fu of this.FUs) {
            let rowid = fu.writeResult(this.clock, this.CDB);
            if (rowid >= 0) this.hist[rowid].written = this.clock;
        }

        for (let fu of this.FUs) fu.readCDB(this.CDB);
        if (this.useRob) {
            this.ROB.readCDB(this.clock, this.CDB);
            let res = this.ROB.commit(this.clock, this.REG);
            if (res.uid !== -1) this.hist[res.uid].committed = this.clock;
            if (res.flush !== -1) {
                for (let re of this.ROB.cb) this.hist[re[1].uid].flushed = true;
                this.ROB.flush();
                for (let fu of this.FUs) fu.flush();
                this.memMgm.flush();
                this.pc = res.flush;
            }
        } else {
            this.REG.readCDB(this.CDB);
        }

        // if all fu are not busy end
        for (let fu of this.FUs) if (fu.isBusy()) return true;
        if (this.useRob && !this.ROB.isEmpty()) return true;

        return this.pc < this.program.length;
    }
}
