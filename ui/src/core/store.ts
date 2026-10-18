// The same shape as the service's store: one value, replaced rather than mutated, with everything
// else a pure function of it.
const createStore = <T extends object>(initial: T) => {
    let current = Object.freeze({ ...initial });
    const listeners = new Set<(state: T) => void>();

    const get = () => current;

    const update = (patch) => {
        const changes = typeof patch === 'function' ? patch(current) : patch;
        const next = Object.freeze({ ...current, ...changes });

        if (Object.keys(changes).every((key) => current[key] === next[key])) return current;

        current = next;
        listeners.forEach((listener) => listener(current));
        return current;
    };

    const subscribe = (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
    };

    return { get, update, subscribe };
};

export { createStore };
