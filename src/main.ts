
// ---------------------------------------------------------------------------
// TEST DATA
// ---------------------------------------------------------------------------

let program = [
    new RawInstruction(Op.ADD,  '3', '5', 'R0'),
    new RawInstruction(Op.SUB, 'R0', '2', 'R0'),
    new RawInstruction(Op.MUL, 'R0', '1', 'R1'),
    new RawInstruction(Op.DIV, 'R1', '3', 'R3'),
]

// ---------------------------------------------------------------------------
// Settings from GUI
const ISSUE_EXEC_DELAY = true;
const EXEC_WRITE_DELAY = true;

// ---------------------------------------------------------------------------
// Testing main

function sleep(s:number) {
    return new Promise(x => setTimeout(x, s * 1000));
}

async function main(){
    console.log("In main");
    let emu = new Emulator(
        [[FuKind.ADDER, 'ADDR', 3], [FuKind.MULTIPLIER, 'MULT', 3] ],
        {ints:8, floats:8},
        program
    )

    let speed: HTMLInputElement = <HTMLInputElement>document.getElementById('speed')!;

    let g = new Graphics(emu);
    g.paint();
    await sleep(10/Number(speed.value));
    while(emu.step()) {
        g.paint();
        await sleep(10/Number(speed.value));
    }
    g.paint();

    console.log("End of main");
}

main();
