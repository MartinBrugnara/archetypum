class Graphics {

    clk: HTMLElement = document.getElementById('clock')!;
    src: HTMLElement = document.getElementById('sourcecode')!;
    rs: HTMLElement = document.getElementById('rs')!;
    reg: HTMLElement = document.getElementById('reg')!;

    constructor(private emu: Emulator) {}

    paint(): void {
        this.clk.innerHTML = String(this.emu.clock);
        this.src.innerHTML = this.renderSrc();
        this.rs.innerHTML = this.renderRS();
        this.reg.innerHTML = this.renderREG();
    }

    renderSrc(): string {
        let rowid = 0;

        let html:string[][] = [];
        for (let i of this.emu.program) {
            html.push([
                '<tr',
                    (this.emu.pc === rowid ? ' class="current"' : ''),
                    '>',
                    '<td>', String(rowid++), '</td>',
                    '<td>', i.toString(), '</td>',
                    '<td', (i.issued === this.emu.clock ? ' class="new-val"': '') ,'>',
                        String(i.issued >= 0 ? i.issued : ''), '</td>',
                    '<td', (i.executed === this.emu.clock ? ' class="new-val"': '') ,'>',
                        String(i.executed >= 0 ? i.executed : ''), '</td>',
                    '<td', (i.written === this.emu.clock ? ' class="new-val"': '') ,'>',
                        String(i.written >= 0 ? i.written : ''), '</td>',
                '</tr>',
            ]);
        }
        return Array.prototype.concat.apply([], html).join('');
    }

    renderRS(): string {
        let html:string[][] = [];
        for (let f of this.emu.FUs) {
            let instr = f.getInstr();
            html.push(
                [
                    '<tr>',
                    '<td>', f.name, '</td>',
                    '<td',  (f.isBusy() ? ' class="busy"' : ''), '></td>',
                ], (instr !== null ? [
                    '<td>', instr.op.toString(), '</td>',
                    '<td>', (instr.qj === null ? String(instr.vj) : ''), '</td>',
                    '<td>', (instr.qk === null ? String(instr.vk) : ''), '</td>',
                    '<td>', (instr.qj !== null ? instr.qj : ''), '</td>',
                    '<td>', (instr.qk !== null ? instr.qk : '') , '</td>',
                ] : [
                    '<td></td><td></td><td></td><td></td><td></td>',
                ]),
                ['</tr>'],
            );
        }
        return Array.prototype.concat.apply([], html).join('');
    }

    renderREG(): string {
        let html:string[][] = [];
        var body:string[][] = [];
        html.push(
            ['<caption>Register Status (Q<sub>i</sub>)</caption>'],
            ['<thead><tr>'],
        );
        for (let key in this.emu.REG.regs) {
            html.push(['<th>', key, '</th>']);
            body.push([
                '<td>',
                (this.emu.REG.qi[key] === null ?  String(this.emu.REG.regs[key]) : this.emu.REG.qi[key]!),
                '</td>'
            ]);
            if (!(body.length % 8)) {
                html.push(
                    ['</tr></thead><tbody class="tech"><tr>'],
                    Array.prototype.concat.apply([], body),
                    ['</tr></tbody>'],
                    ['<thead><tr>'],
                );
                body = [];
            }
        }
        html.push(
            ['</tr></thead><tbody class="tech"><tr>'],
            Array.prototype.concat.apply([], body),
            ['</tr></tbody>'],
        );
        if (!body.length) html.splice(-4, 4);
        return Array.prototype.concat.apply([], html).join('');
    }
}
