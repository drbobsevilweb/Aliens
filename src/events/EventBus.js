/**
 * EventBus — lightweight pub/sub event emitter for the node-based action system.
 * Game systems emit events; GraphRunner listens and dispatches actions.
 */
export class EventBus {
    constructor() {
        this._listeners = new Map();
    }

    /**
     * Register a callback for an event.
     * @param {string} eventName
     * @param {function} callback - receives (payload)
     */
    on(eventName, callback) {
        if (!this._listeners.has(eventName)) {
            this._listeners.set(eventName, []);
        }
        this._listeners.get(eventName).push({ fn: callback, once: false });
    }

    /**
     * Register a one-shot callback (auto-removed after first fire).
     */
    once(eventName, callback) {
        if (!this._listeners.has(eventName)) {
            this._listeners.set(eventName, []);
        }
        this._listeners.get(eventName).push({ fn: callback, once: true });
    }

    /**
     * Remove a specific callback.
     */
    off(eventName, callback) {
        const list = this._listeners.get(eventName);
        if (!list) return;
        const idx = list.findIndex(entry => entry.fn === callback);
        if (idx !== -1) list.splice(idx, 1);
        if (list.length === 0) this._listeners.delete(eventName);
    }

    /**
     * Emit an event to all registered listeners.
     * @param {string} eventName
     * @param {object} payload
     */
    emit(eventName, payload) {
        const list = this._listeners.get(eventName);
        if (!list || list.length === 0) return;
        // Snapshot to allow listener removal during iteration
        const snapshot = list.slice();
        for (const entry of snapshot) {
            entry.fn(payload);
            if (entry.once) {
                const idx = list.indexOf(entry);
                if (idx !== -1) list.splice(idx, 1);
            }
        }
    }

    /**
     * Remove all listeners (cleanup on scene shutdown).
     */
    removeAll() {
        this._listeners.clear();
    }
}
