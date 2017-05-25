class CircularBuffer<T> {
    buffer:T[];
    head:number = 0;
    tail:number = 0;
    availableData:number = 0;

    constructor(size:number) {
        this.buffer = new Array(size);
    }

    isEmpty():boolean {return this.availableData === 0;}

    isFull():boolean {return this.availableData === this.buffer.length;}

    // Returns buffer index if success -1 otherwise.
    push(data:T): number {
        if (this.isFull()) return -1;
        let idx = this.tail % this.buffer.length;
        this.buffer[idx] = data;
        this.tail = (this.tail + 1) % this.buffer.length;
        this.availableData++;
        return idx;
    }

    nextTag = ():number => this.tail;

    // Returns value or null if not available.
    pop():T | null {
        if (this.isEmpty()) return null;
        let data = this.buffer[this.head % this.buffer.length];
        this.head = (this.head + 1) % this.buffer.length;
        this.availableData--;
        return data;
    }

    [Symbol.iterator] = function(me: CircularBuffer<T>) {
        return function* ():IterableIterator<[number, T]> {
            for(let idx=0; idx<me.availableData; idx++) {
                let  i = (me.head + idx) % me.buffer.length;
                yield [i, me.buffer[i]];
            }
        }
    }(this);

    reverse = function(me: CircularBuffer<T>) {
        return function* ():IterableIterator<[number, T]>  {
            for(let idx=me.availableData-1; idx>=0; idx--) {
                let  i = (me.head + idx) % me.buffer.length;
                yield [i, me.buffer[i]];
            }
        }
    }(this);
}
