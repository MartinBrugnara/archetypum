class Graphics {

    clk: HTMLElement = document.getElementById('clock')!;
    src: HTMLElement = document.getElementById('sourcecode')!;
    rs: HTMLElement = document.getElementById('rs')!;
    regh: HTMLElement = document.getElementById('reg_head')!;
    regb: HTMLElement = document.getElementById('reg_body')!;

    constructor(private emu: Emulator) {}

    paint(): void {
        this.clk.innerHTML = String(this.emu.clock);
        this.src.innerHTML = this.renderSrc();
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
}
