function clone<T>(obj: T): T {
    const copy = new (obj.constructor as { new (): T})();
    Object.assign(copy, obj);
    return copy;
}
