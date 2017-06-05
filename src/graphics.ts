class Graphics {

    clk: HTMLElement = document.getElementById('clock')!;
    pc: HTMLElement = document.getElementById('pc')!;
    src: HTMLElement = document.getElementById('sourcecode')!;
    scexec: HTMLElement = document.getElementById('scexec')!;
    rs: HTMLElement = document.getElementById('rs')!;
    reg: HTMLElement = document.getElementById('reg')!;
    cache: HTMLElement = document.getElementById('cache')!;
    rob: HTMLElement = document.getElementById('rob')!;

    constructor(private emu: Emulator) {}

    paint(): void {
        this.clk.innerHTML = String(this.emu.clock);
        this.pc.innerHTML = String(this.emu.pc);
        this.src.innerHTML = this.renderSrc();
        this.scexec.innerHTML = this.renderExec();
        this.rs.innerHTML = this.renderRS();
        this.reg.innerHTML = this.renderREG();
        this.cache.innerHTML = this.renderCache();
        this.rob.innerHTML = this.renderRob();
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
            ]);
        }

        html.push([
            '<tr',
                (this.emu.pc === this.emu.program.length ? ' class="current"' : ''),
                '>',
                '<td>', String(this.emu.program.length), '</td>',
                '<td>', 'EOF', '</td>',
            ]);

        return Array.prototype.concat.apply([], html).join('');
    }

    renderExec(): string {
        let rowid = 0;

        let html:string[][] = [];
        for (let i of this.emu.hist) {
            html.push([
                '<tr',
                    i.flushed ? ' class="flushed"' : '',
                    '>',
                    '<td>', String(rowid++), '</td>',
                    '<td>', i.toString(), '</td>',
                    '<td', (i.issued === this.emu.clock ? ' class="new-val"': '') ,'>',
                        String(i.issued >= 0 ? i.issued : ''), '</td>',
                    '<td', (i.executed === this.emu.clock ? ' class="new-val"': '') ,'>',
                        String(i.executed >= 0 ? i.executed : ''), '</td>',
                    '<td', (i.written === this.emu.clock ? ' class="new-val"': '') ,'>',
                        String(i.written >= 0 ? i.written : ''), '</td>',
                    '<td', (i.committed === this.emu.clock ? ' class="new-val"': '') ,'>',
                        String(i.committed >= 0 ? i.committed : ''), '</td>',
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
                    '<td>', (instr.tag !== null ? instr.tag : ''), '</td>',
                    '<td>', f.kind !== FuKind.MEMORY ? f.getDue(this.emu.clock): '', '</td>'
                ] : [
                    '<td></td><td></td><td></td><td></td><td></td><td></td><td></td>',
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

    renderCache(): string {
        if (this.emu.cache.size === 0) return "";

        let html:string[][] = [];
        html.push([
            '<caption>cache | hit&nbsp;',
            String(Math.round(this.emu.cache.readHit / (this.emu.cache.readHit + this.emu.cache.readMiss) * 100)),
            '% - evictions ', String(this.emu.cache.evictions),
            '</caption><thead><tr><th></th>'
        ]);
        for(let j=0; j<this.emu.cache.n;j++)
            html.push(['<th colspan="3">N:', String(j), '</th>']);
        html.push(['</tr><tr><th></th>']);
        for(let j=0; j<this.emu.cache.n;j++)
            html.push(['<th>addr</th><th>val</th><th>dirty</th>']);
        html.push(['</tr></thead>']);

        html.push(['<tbody>']);
        for(let i=0; i<this.emu.cache.size / this.emu.cache.n;i++) {
            html.push(['<tr><td>', String(i), '</td>']);
            for(let j=0; j<this.emu.cache.n;j++) {
                let entry = this.emu.cache._cache[i][j];
                // index, value, dirty
                if (entry[0])
                    html.push([
                        '<td>', String(entry[1]), '</td>',
                        '<td>', String(entry[2]), '</td>',
                        '<td', entry[3] ? ' class="busy">' : '>', '</td>'
                    ]);
                else
                    html.push(['<td></td><td></td><td></td>'])
            }
            html.push(['</tr>']);
        }
        html.push(['</tbody>']);

        return Array.prototype.concat.apply([], html).join('');
    }

    renderRob(): string {
        if (!this.emu.useRob) return '';

        let html:string[][] = [];
        html.push(['<caption>reorder buffer</caption><thead><tr><th>tag</th><th>Instruction</th><th>dst</th><th>val</th><th>rdy</th><th>row</th></tr></thead><tbody>']);

        for (let row of this.emu.ROB.cb) {
            html.push([
                '<tr>',
                '<td>', String(row[0]), '</td>',
                '<td>', String(row[1].instr), '</td>',
                '<td>', row[1].dst, '</td>',
                '<td>', String(row[1].value), '</td>',
                '<td', row[1].ready !== null ? ' class="busy">' : '>', '</td>',
                '<td>',String(row[1].instr.rowid), '</td>',
                '</tr>',
            ]);
        }

        for (let i=0; i<this.emu.ROB.cb.buffer.length - this.emu.ROB.cb.availableData; i++) {
            let tag = (this.emu.ROB.cb.tail + i) % this.emu.ROB.cb.buffer.length;
            html.push([
                '<tr><td>',
                String(tag),
                '</td><td></td><td></td><td></td><td></td><td></td></tr>',
            ])
        }

        html.push(['</tbody>']);
        return Array.prototype.concat.apply([], html).join('');
    }
}
