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

let menu: HTMLElement = document.getElementById('menu')!;
let ex_1: HTMLElement = document.getElementById('ex-1')!;
let ex_2: HTMLElement = document.getElementById('ex-2')!;
let rdy: HTMLElement = document.getElementById('rdy')!;
let raw_src: HTMLInputElement = <HTMLInputElement>document.getElementById('raw-src')!;

let iaddr: HTMLInputElement = <HTMLInputElement>document.getElementById('iaddr')!;
let imult: HTMLInputElement = <HTMLInputElement>document.getElementById('imult')!;
let ireg: HTMLInputElement  = <HTMLInputElement>document.getElementById('ri')!;
let freg: HTMLInputElement  = <HTMLInputElement>document.getElementById('rf')!;
let ied: HTMLInputElement   = <HTMLInputElement>document.getElementById('ied')!;
let ewd: HTMLInputElement   = <HTMLInputElement>document.getElementById('ewd')!;

let rst: HTMLElement = document.getElementById('reset')!;
let load: HTMLElement = document.getElementById('load')!;
let play: HTMLElement = document.getElementById('play')!;
let pausebtn: HTMLElement = document.getElementById('pause')!;
let one_step: HTMLElement = document.getElementById('step')!;
let speed: HTMLInputElement   = <HTMLInputElement>document.getElementById('speed')!;

function main():void {
    ex_1.onclick = () => raw_src.value = ex_1_src;
    ex_2.onclick = () => raw_src.value = ex_2_src;
    rdy.onclick = setup;

    rst.onclick = () => {
        pause();
        setup();
    }

    load.onclick = () => {
        pause();
        menu.classList.remove('hide')
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


    let emu = new Emulator(
        [
            [FuKind.ADDER, 'ADDR', safeInt(iaddr.value, 3)],
            [FuKind.MULTIPLIER, 'MULT', safeInt(imult.value, 3)],
            [FuKind.MEMORY, 'MEM', 2],
        ],
        {ints: safeInt(ireg.value), floats: safeInt(freg.value)},
        parse(raw_src.value)
    )

    let g = new Graphics(emu);
    g.paint();

    STEP = ():boolean => {
        var notEof = emu.step()
        g.paint();
        return notEof
    }

    menu.classList.add('hide');
}

main();
