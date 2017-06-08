
let EXAMPLES: {[key:string]: string} = {
    'Arithmetic speculation':
`MUL 1,5,R0
MUL 2,5,R1
ADD 1,R5,R5
MUL 4,5,R3
SUB R5,5,R6
JNZ 0
`,

    'Cache':
`; INIT VALUES
STR 0,0
STR 1,1

; FLUSH CACHE (4LOC)
STR 0,2
STR 0,3
STR 0,4
STR 0,5

; MAIN
LDR 0,R0
LDR 1,R1
ADD R0,R1,R2
ADD R5,1,R5
MUL R0,R1,R3
SUB R5,4,R6
STR R3,1
STR R2,0
JNZ 6
`,


};


function displayExamples() {
    let lst: HTMLElement = document.getElementById('exlist')!;
    let html:string[][] = [];
    for (let ex in EXAMPLES) {
        html.push([
            '<li><a data-action="load-example" data-value="', ex, '">', ex, '</a></li>'
        ]);
    }
    lst.innerHTML = Array.prototype.concat.apply([], html).join('');

    for (let btn of document.querySelectorAll('[data-action="load-example"]')) {
        btn.addEventListener('click', function(e){
            e.preventDefault();
            e.stopPropagation();
            let example_id = (<string>(<HTMLElement>e.target).dataset.value);
            raw_src.value = EXAMPLES[example_id];
        });
    }

    for (let ex in EXAMPLES) {
        raw_src.value = EXAMPLES[ex];
        break;
    }

}

function setActiveTab(id: string): void {
    let next = document.getElementById(id);
    if (!next) return;
    let tabs = document.getElementsByClassName('active');
    if (tabs.length)
        tabs[0].classList.remove('active');
    next.classList.add('active');
}

function initTabs() {
    // URL to tab
    let tab = window.location.hash.substr(1);
    setActiveTab(tab);

    for (let link of document.querySelectorAll('.tab-link')) {
        link.addEventListener('click', function(e){
            e.preventDefault();
            e.stopPropagation();
            let tabId = (<string>(<HTMLElement>e.target).getAttribute('href')).replace('#','');
            setActiveTab(tabId);
        });
    }
}


// TODO: GLOBAL VARIABLES (get the rid of them)
var ISSUE_EXEC_DELAY:boolean = true;
var EXEC_WRITE_DELAY:boolean = true;


let rdy: HTMLElement = document.getElementById('rdy')!;
let apply_conf: HTMLElement = document.getElementById('apply_conf')!;
let raw_src: HTMLInputElement = <HTMLInputElement>document.getElementById('raw-src')!;

let iaddr: HTMLInputElement = <HTMLInputElement>document.getElementById('iaddr')!;
let iaddrd: HTMLInputElement = <HTMLInputElement>document.getElementById('iaddrd')!;
let imult: HTMLInputElement = <HTMLInputElement>document.getElementById('imult')!;
let imultd: HTMLInputElement = <HTMLInputElement>document.getElementById('imultd')!;
let idiv: HTMLInputElement = <HTMLInputElement>document.getElementById('idiv')!;
let idivd: HTMLInputElement = <HTMLInputElement>document.getElementById('idivd')!;
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

let bp: HTMLSelectElement   = <HTMLSelectElement>document.getElementById('bp')!;
let nbit_n: HTMLInputElement   = <HTMLInputElement>document.getElementById('nbit_n')!;
let nbit_k: HTMLInputElement   = <HTMLInputElement>document.getElementById('nbit_k')!;

let rst: HTMLElement = document.getElementById('reset')!;
let conf: HTMLElement = document.getElementById('conf')!;
let play: HTMLElement = document.getElementById('play')!;
let pausebtn: HTMLElement = document.getElementById('pause')!;
let one_step: HTMLElement = document.getElementById('step')!;
let speed: HTMLInputElement   = <HTMLInputElement>document.getElementById('speed')!;

function main():void {
    displayExamples();
    initTabs();

    let resetFunc = (e: Event) => {
        e.preventDefault();
        e.stopPropagation();
        pause();
        setup();
    }

    rdy.onclick = apply_conf.onclick = rst.onclick = resetFunc;

    play.onclick = playloop;
    pausebtn.onclick = pause;
    one_step.onclick = () => {
        pause();
        if (STEP) STEP();
        else alert('Please load a valid program first.');
    };

    setup();
}

function playloop() {
    document.body.classList.add('playing');
    if(STEP) {
        if (STEP())
            LOOP = setTimeout(playloop, (10/Number(speed.value) * 1000));
    } else {
        alert('Please load a valid program first.');
    }
}

function pause() {
    document.body.classList.remove('playing');
    if (LOOP) clearTimeout(LOOP);
}


let safeInt = (s:string, fallback=0) => isNaN(parseInt(s, 10)) ? fallback : parseInt(s, 10);

var STEP: (() => boolean) | null = null;
var LOOP: number;

function setup() {
    STEP = null;
    let program:Program;
    try {
        program = parse(raw_src.value, safeInt(ireg.value, 0));
    } catch (err) {
        alert(err.message);
        return;
    }

    document.body.classList.remove('playing');

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

    let bp_val = (<HTMLOptionElement>bp.options[bp.selectedIndex]).value;

    let emu = new Emulator(
        [
            [FuKind.ADDER, 'ADDR', safeInt(iaddr.value, 3), {duration: safeInt(iaddrd.value, 2)}],
            [FuKind.MULTIPLIER, 'MULT', safeInt(imult.value, 3), {duration: safeInt(imultd.value, 4)}],
            [FuKind.DIVIDER, 'DIV', safeInt(idiv.value, 3), {duration: safeInt(idivd.value, 6)}],
            [FuKind.MEMORY, 'MEM', 1, {'memMgm': memMgm, duration: safeInt(iaddrd.value, 2)}],
        ],
        {ints: safeInt(ireg.value), floats: safeInt(freg.value)},
        safeInt(rsize.value, 0),
        CACHE,
        memMgm,
        BpMap[bp_val](safeInt(nbit_n.value, 2), safeInt(nbit_k.value, 4)),
        program
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
