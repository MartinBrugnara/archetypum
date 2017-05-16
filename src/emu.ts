import {FuConfig, assembleFunctionalUnits as FuFactory} from './fu'
import {RegConfig, Register} from './reg'

export class Emulator {
    constructor(fuConf: FuConfig, regConf: RegConfig) {
        let REG = new Register(regConf);
        let FUs = FuFactory(fuConf)
    }
}
