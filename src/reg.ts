export type RegConfig = {ints:number, floats:number};

export class Register {
    [key:string]: number;

    constructor(conf:RegConfig){
        for(let i=0; i<conf.ints; i++) this[`R${i}`]=0;
        for(let f=0; f<conf.floats; f++) this[`F${f}`]=0;
    }
}
