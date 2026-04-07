/**
 * ActionDispatcher — maps action name strings to handler functions.
 * Used by GraphRunner to execute action nodes.
 */
export class ActionDispatcher {
    /**
     * @param {object} scene - GameScene reference (context for handlers)
     */
    constructor(scene) {
        this.scene = scene;
        this._handlers = new Map();
    }

    /**
     * Register a named action.
     * @param {string} actionName
     * @param {function} handlerFn - receives (params, eventPayload, scene)
     */
    register(actionName, handlerFn) {
        this._handlers.set(actionName, handlerFn);
    }

    /**
     * Dispatch a named action.
     * @param {string} actionName
     * @param {object} params   - action node's own data (from editor)
     * @param {object} payload  - event payload that triggered the graph
     * @returns {*} handler return value, or undefined if not found
     */
    dispatch(actionName, params = {}, payload = {}) {
        const handler = this._handlers.get(actionName);
        if (!handler) {
            console.warn(`[ActionDispatcher] Unknown action: "${actionName}"`);
            return undefined;
        }
        return handler(params, payload, this.scene);
    }

    /**
     * Check if an action is registered.
     */
    has(actionName) {
        return this._handlers.has(actionName);
    }

    /**
     * List all registered action names.
     */
    getActionNames() {
        return [...this._handlers.keys()];
    }

    /**
     * Remove all handlers (cleanup on scene shutdown).
     */
    removeAll() {
        this._handlers.clear();
    }
}
