
// ---------------------------------------------------------------------------
// TEST DATA
// ---------------------------------------------------------------------------

let program = [
    new RawInstruction(Op.ADD,  '3', '5', 'R0'),
    new RawInstruction(Op.SUB, 'R0', '2', 'R0'),
    new RawInstruction(Op.MUL, 'R0', '1', 'R1'),
    new RawInstruction(Op.DIV, 'R1', '3', 'R3'),
]

function main(){
    console.log("In main");
    let emu = new Emulator(
        [[FuKind.ADDER, 'ADDR', 3], [FuKind.MULTIPLIER, 'MULT', 3] ],
        {ints:8, floats:8},
        program
    )

    while(emu.step()) {
        console.log(emu);
        console.log(JSON.stringify(emu.REG, null, '\t'));
    }

    console.log("End of main");
}

main();
