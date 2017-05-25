// some spaghetti code from 2AM:w
var ISSUE_EXEC_DELAY:boolean = true;
var EXEC_WRITE_DELAY:boolean = true;

let ex_1_src = `ADD   3,5,R0
SUB  R0,2,R0
MUL  R0,1,R1
DIV  R1,3,R3
`
let ex_2_src = `ADD   3,5,R0
STR  42,R0
LDR  R0,0,R1
ADD  1,R1,R2
`

let menu_load: HTMLElement = document.getElementById('menu-load')!;
let menu_conf: HTMLElement = document.getElementById('menu-conf')!;
let ex_1: HTMLElement = document.getElementById('ex-1')!;
let ex_2: HTMLElement = document.getElementById('ex-2')!;
let rdy: HTMLElement = document.getElementById('rdy')!;
let apply_conf: HTMLElement = document.getElementById('apply_conf')!;
let raw_src: HTMLInputElement = <HTMLInputElement>document.getElementById('raw-src')!;

let iaddr: HTMLInputElement = <HTMLInputElement>document.getElementById('iaddr')!;
let iaddrd: HTMLInputElement = <HTMLInputElement>document.getElementById('iaddrd')!;
let imult: HTMLInputElement = <HTMLInputElement>document.getElementById('imult')!;
let imultd: HTMLInputElement = <HTMLInputElement>document.getElementById('imultd')!;
let ireg: HTMLInputElement  = <HTMLInputElement>document.getElementById('ri')!;
let freg: HTMLInputElement  = <HTMLInputElement>document.getElementById('rf')!;
let ied: HTMLInputElement   = <HTMLInputElement>document.getElementById('ied')!;
let ewd: HTMLInputElement   = <HTMLInputElement>document.getElementById('ewd')!;
let rl: HTMLInputElement   = <HTMLInputElement>document.getElementById('rl')!;
let wl: HTMLInputElement   = <HTMLInputElement>document.getElementById('wl')!;
let ca: HTMLSelectElement   = <HTMLSelectElement>document.getElementById('cache_alg')!;
let crl: HTMLInputElement   = <HTMLInputElement>document.getElementById('crl')!;
let cwl: HTMLInputElement   = <HTMLInputElement>document.getElementById('cwl')!;
let nways: HTMLInputElement   = <HTMLInputElement>document.getElementById('nways')!;
let csize: HTMLInputElement   = <HTMLInputElement>document.getElementById('csize')!;
let rsize: HTMLInputElement   = <HTMLInputElement>document.getElementById('rsize')!;

let rst: HTMLElement = document.getElementById('reset')!;
let conf: HTMLElement = document.getElementById('conf')!;
let load: HTMLElement = document.getElementById('load')!;
let play: HTMLElement = document.getElementById('play')!;
let pausebtn: HTMLElement = document.getElementById('pause')!;
let one_step: HTMLElement = document.getElementById('step')!;
let speed: HTMLInputElement   = <HTMLInputElement>document.getElementById('speed')!;

function main():void {
    ex_1.onclick = () => raw_src.value = ex_1_src;
    ex_2.onclick = () => raw_src.value = ex_2_src;

    rdy.onclick = () => {
        setup();
        menu_load.classList.add('hide');
    }

    apply_conf.onclick = () => {
        pause();
        setup();
        menu_conf.classList.add('hide');
    }

    rst.onclick = () => {
        pause();
        setup();
    }

    load.onclick = () => {
        pause();
        menu_load.classList.remove('hide')
    }

    conf.onclick = () => {
        pause();
        menu_conf.classList.remove('hide')
    }

    play.onclick = playloop;
    pausebtn.onclick = pause;
    one_step.onclick = () => {
        pause();
        STEP()
    };
}

function playloop() {
    if(STEP()) LOOP = setTimeout(playloop, (10/Number(speed.value) * 1000));
}

function pause() {
    if (LOOP) clearTimeout(LOOP);
}


let safeInt = (s:string, fallback=0) => isNaN(parseInt(s, 10)) ? fallback : parseInt(s, 10);

var STEP: () => boolean;
var LOOP: number;

function setup() {
    ISSUE_EXEC_DELAY = ied.checked;
    EXEC_WRITE_DELAY = ewd.checked;

    let MEM:Memory = new Memory(new MemConf(safeInt(rl.value,1), safeInt(wl.value,2)));
    let ca_val = (<HTMLOptionElement>ca.options[ca.selectedIndex]).value;
    let CACHE:XCache = XCacheFactory(ca_val.split('_')[0], {
        'mem': MEM,
        'n': safeInt(nways.value, 2),
        'size': safeInt(csize.value, 4),
        'readLatency': safeInt(crl.value, 0),
        'writeLatency': safeInt(cwl.value, 0),
        'iswriteback' : ca_val.split('_')[1] === 'wb',
    });

    let memMgm = new MemoryMGM(CACHE, safeInt(rsize.value, 0) > 0);

    let emu = new Emulator(
        [
            [FuKind.ADDER, 'ADDR', safeInt(iaddr.value, 3), {duration: safeInt(iaddrd.value, 2)}],
            [FuKind.MULTIPLIER, 'MULT', safeInt(imult.value, 3), {duration: safeInt(imultd.value, 4)}],
            [FuKind.MEMORY, 'MEM', 1, {'memMgm': memMgm, duration: safeInt(iaddrd.value, 2)}],
        ],
        {ints: safeInt(ireg.value), floats: safeInt(freg.value)},
        safeInt(rsize.value, 0),
        CACHE,
        memMgm,
        parse(raw_src.value)
    )

    let g = new Graphics(emu);
    g.paint();

    STEP = ():boolean => {
        var notEof = emu.step()
        g.paint();
        return notEof
    }
}

main();
