export class Queue<T> {
    _store: T[] = [];

    [Symbol.iterator]() {
        return this._store[Symbol.iterator]()
    }

    push(val: T) {
        this._store.push(val);
    }
    pop(): T | undefined {
        return this._store.shift();
    }
}
