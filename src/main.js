var __extends = (this && this.__extends) || (function () {
    var extendStatics = Object.setPrototypeOf ||
        ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
        function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
    return function (d, b) {
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
var FuKind;
(function (FuKind) {
    FuKind[FuKind["ADDER"] = 0] = "ADDER";
    FuKind[FuKind["MUTLIPLIER"] = 1] = "MUTLIPLIER";
})(FuKind || (FuKind = {}));
var Op;
(function (Op) {
    Op[Op["ADD"] = 0] = "ADD";
    Op[Op["SUB"] = 1] = "SUB";
    Op[Op["MUL"] = 2] = "MUL";
    Op[Op["DIV"] = 3] = "DIV";
})(Op || (Op = {}));
var FunctionalUnit = (function () {
    function FunctionalUnit(kind, name) {
        this.kind = kind;
        this.name = name;
    }
    // TODO: in main loop remember to register accepting FU to REG
    FunctionalUnit.prototype.tryIssue = function (clockTime, instr) {
        if (this.kind != instr.kind || this.isBusy())
            return false;
        this.instr = instr;
        return true;
    };
    FunctionalUnit.prototype.execute = function (clockTime) {
        if (!this.isBusy() || this.instr.vj === null || this.instr.vk === null)
            return; // not ready yet
        this.endTime = clockTime + this.duration;
        // TODO: force execute cycle <> writeResult with +1
    };
    FunctionalUnit.prototype.computeValue = function () {
        throw new Error("Implement in child");
    };
    FunctionalUnit.prototype.writeResult = function (clockTime, cdb) {
        throw new Error("Not implemented yet");
        if (this.endTime = clockTime) {
            this.computeValue();
            cdb.push(new CdbMessage(this.rs.name, this.result));
            this.instr = null;
        }
    };
    FunctionalUnit.prototype.isBusy = function () {
        return !!this.instr;
    };
    FunctionalUnit.prototype.readCDB = function () {
        throw new Error("Not implemented yet");
    };
    return FunctionalUnit;
}());
var CdbMessage = (function () {
    function CdbMessage(rsName, result) {
    }
    return CdbMessage;
}());
var Queue = (function () {
    function Queue() {
        this._store = [];
    }
    Queue.prototype.push = function (val) {
        this._store.push(val);
    };
    Queue.prototype.pop = function () {
        return this._store.shift();
    };
    return Queue;
}());
var Instruction = (function () {
    function Instruction() {
        this.vj = null; // First source operand value
        this.vk = null; // Seconds source operand value
    }
    return Instruction;
}());
var Adder = (function (_super) {
    __extends(Adder, _super);
    function Adder(name) {
        return _super.call(this, FuKind.ADDER, name) || this;
    }
    Adder.prototype.computeValue = function () {
        switch (this.instr.op) {
            case Op.ADD:
                this.result = this.vj + this.vk;
                break;
            case Op.SUB:
                this.result = this.vj - this.vk;
                break;
        }
    };
    return Adder;
}(FunctionalUnit));
var Multiplier = (function (_super) {
    __extends(Multiplier, _super);
    function Multiplier(name) {
        return _super.call(this, FuKind.MULTIPLIER, name) || this;
    }
    Multiplier.prototype.computeValue = function () {
        switch (this.instr.op) {
            case Op.MUL:
                this.result = this.vj * this.vk;
                break;
            case Op.DIV:
                this.result = this.vj / this.vk;
                break;
        }
    };
    return Multiplier;
}(FunctionalUnit));
