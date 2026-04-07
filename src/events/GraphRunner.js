/**
 * GraphRunner — runtime interpreter for node-based action graphs.
 * Loads graph JSON from the editor, listens for events, walks nodes, dispatches actions.
 */
export class GraphRunner {
    /**
     * @param {import('./EventBus.js').EventBus} eventBus
     * @param {import('./ActionDispatcher.js').ActionDispatcher} actionDispatcher
     */
    constructor(eventBus, actionDispatcher) {
        this.eventBus = eventBus;
        this.actionDispatcher = actionDispatcher;
        this.scene = null; // Set from GameScene after creation
        this._graphs = [];
        this._listeners = []; // { eventName, callback } for cleanup
    }

    /**
     * Load an array of graph objects and register event listeners.
     * @param {Array} graphArray — each: { id, name, enabled, nodes, connections }
     */
    loadGraphs(graphArray) {
        if (!Array.isArray(graphArray)) return;
        for (const graph of graphArray) {
            if (!graph || graph.enabled === false) continue;
            if (!Array.isArray(graph.nodes) || !Array.isArray(graph.connections)) continue;
            this._graphs.push(graph);
            // Find all event entry-point nodes
            const eventNodes = graph.nodes.filter(n => n.type === 'event' && n.data?.eventName);
            for (const eventNode of eventNodes) {
                const callback = (payload) => this._executeFrom(graph, eventNode, payload);
                this.eventBus.on(eventNode.data.eventName, callback);
                this._listeners.push({ eventName: eventNode.data.eventName, callback });
            }
        }
    }

    /**
     * Execute graph starting from a specific event node.
     */
    _executeFrom(graph, startNode, payload) {
        // BFS walk from the start node
        const visited = new Set();
        const queue = [startNode.id];
        visited.add(startNode.id);
        const resolvedValues = new Map(); // nodeId → resolved getter value

        while (queue.length > 0) {
            const currentId = queue.shift();
            const current = graph.nodes.find(n => n.id === currentId);
            if (!current) continue;

            // --- Getter node: resolve value from scene and store ---
            if (current.type === 'getter') {
                resolvedValues.set(current.id, this._resolveGetter(current.data));
                // Fall through to enqueue outgoing connections
            }

            // --- Condition node: dual-output branching ---
            if (current.type === 'condition') {
                const getterValue = this._findIncomingGetterValue(graph, currentId, resolvedValues);
                const passed = this._evaluateCondition(current.data, payload, getterValue);
                const port = passed ? 'true' : 'false';
                const outgoing = this._getOutgoing(graph, currentId, port);
                for (const nextId of outgoing) {
                    if (!visited.has(nextId)) {
                        visited.add(nextId);
                        queue.push(nextId);
                    }
                }
                continue; // Condition handles its own outgoing connections
            }

            if (current.type === 'action') {
                this._executeAction(current.data, payload);
            }

            if (current.type === 'delay') {
                const delayMs = Number(current.data?.delayMs) || 1000;
                const downstream = this._getOutgoing(graph, currentId);
                // Capture resolvedValues snapshot for the delayed chain
                const snapshot = new Map(resolvedValues);
                setTimeout(() => {
                    for (const nextId of downstream) {
                        this._executeChain(graph, nextId, payload, snapshot);
                    }
                }, delayMs);
                continue; // Don't follow connections synchronously
            }

            // Follow outgoing connections (event, getter, action, etc.)
            const outgoing = this._getOutgoing(graph, currentId);
            for (const nextId of outgoing) {
                if (!visited.has(nextId)) {
                    visited.add(nextId);
                    queue.push(nextId);
                }
            }
        }
    }

    /**
     * Execute a chain from a specific node (used after delays).
     * @param {Map} [inheritedValues] — resolved getter values from prior BFS
     */
    _executeChain(graph, nodeId, payload, inheritedValues) {
        const visited = new Set();
        const queue = [nodeId];
        visited.add(nodeId);
        const resolvedValues = inheritedValues ? new Map(inheritedValues) : new Map();

        while (queue.length > 0) {
            const currentId = queue.shift();
            const current = graph.nodes.find(n => n.id === currentId);
            if (!current) continue;

            // --- Getter node ---
            if (current.type === 'getter') {
                resolvedValues.set(current.id, this._resolveGetter(current.data));
            }

            // --- Condition node: dual-output branching ---
            if (current.type === 'condition') {
                const getterValue = this._findIncomingGetterValue(graph, currentId, resolvedValues);
                const passed = this._evaluateCondition(current.data, payload, getterValue);
                const port = passed ? 'true' : 'false';
                const outgoing = this._getOutgoing(graph, currentId, port);
                for (const nextId of outgoing) {
                    if (!visited.has(nextId)) {
                        visited.add(nextId);
                        queue.push(nextId);
                    }
                }
                continue;
            }

            if (current.type === 'action') {
                this._executeAction(current.data, payload);
            }
            if (current.type === 'delay') {
                const delayMs = Number(current.data?.delayMs) || 1000;
                const downstream = this._getOutgoing(graph, currentId);
                const snapshot = new Map(resolvedValues);
                setTimeout(() => {
                    for (const nextId of downstream) {
                        this._executeChain(graph, nextId, payload, snapshot);
                    }
                }, delayMs);
                continue;
            }

            const outgoing = this._getOutgoing(graph, currentId);
            for (const nextId of outgoing) {
                if (!visited.has(nextId)) {
                    visited.add(nextId);
                    queue.push(nextId);
                }
            }
        }
    }

    /**
     * Get node IDs connected from a given node's output.
     * @param {string} [fromPort] — if provided, filter connections by fromPort.
     *   For 'true': include connections with fromPort 'true' or undefined (backward compat).
     *   For 'false': include only connections with fromPort 'false'.
     *   If omitted: return all outgoing connections (no port filtering).
     */
    _getOutgoing(graph, nodeId, fromPort) {
        return graph.connections
            .filter(c => {
                if (c.fromNode !== nodeId) return false;
                if (fromPort === undefined) return true; // No port filtering
                if (fromPort === 'true') return !c.fromPort || c.fromPort === 'true';
                if (fromPort === 'false') return c.fromPort === 'false';
                return true;
            })
            .map(c => c.toNode);
    }

    /**
     * Evaluate a condition node against the event payload.
     * data: { check, operator, value }
     * check is a dot-path into the payload (e.g., "enemy.type", "damage")
     * @param {*} [getterValue] — if provided, use this as the actual value instead of
     *   resolving from the payload via data.check. The getter IS the value source.
     */
    _evaluateCondition(data, payload, getterValue) {
        if (!data) return true;
        // If no getter value and no check path, pass through
        if (getterValue === undefined && !data.check) return true;

        const actual = getterValue !== undefined ? getterValue : this._resolveDotPath(payload, data.check);
        const expected = data.value;
        const op = data.operator || '==';

        // Try numeric comparison first
        const actualNum = Number(actual);
        const expectedNum = Number(expected);
        const bothNumeric = Number.isFinite(actualNum) && Number.isFinite(expectedNum);

        switch (op) {
            case '>=': return bothNumeric ? actualNum >= expectedNum : String(actual) >= String(expected);
            case '<=': return bothNumeric ? actualNum <= expectedNum : String(actual) <= String(expected);
            case '>':  return bothNumeric ? actualNum > expectedNum : String(actual) > String(expected);
            case '<':  return bothNumeric ? actualNum < expectedNum : String(actual) < String(expected);
            case '==': return String(actual) === String(expected);
            case '!=': return String(actual) !== String(expected);
            case 'contains':
                if (Array.isArray(actual)) return actual.includes(expected);
                return String(actual).includes(String(expected));
            default: return String(actual) === String(expected);
        }
    }

    /**
     * Resolve a dot-path like "enemy.type" from a payload object.
     */
    _resolveDotPath(obj, path) {
        if (!obj || !path) return undefined;
        const parts = String(path).split('.');
        let current = obj;
        for (const part of parts) {
            if (current == null || typeof current !== 'object') return undefined;
            current = current[part];
        }
        return current;
    }

    /**
     * Execute an action node.
     */
    _executeAction(data, payload) {
        if (!data || !data.actionType) return;
        this.actionDispatcher.dispatch(data.actionType, data, payload);
    }

    /**
     * Resolve a getter node's value from live scene state.
     * @param {object} data — getter node data with `source` field
     * @returns {*} the resolved value
     */
    _resolveGetter(data) {
        if (!data?.source || !this.scene) return undefined;
        const scene = this.scene;
        switch (data.source) {
            case 'leader.health':
                return scene.leader?.health;
            case 'leader.healthPct':
                return (scene.leader?.health || 0) / (scene.leader?.maxHealth || 100);
            case 'leader.x':
                return scene.leader?.x || 0;
            case 'leader.y':
                return scene.leader?.y || 0;
            case 'aliveEnemies':
                return scene.enemyManager?.enemies?.filter(e => e.active && !e.isDying).length || 0;
            case 'currentWave':
                return scene.stageFlow?.currentWave || 1;
            case 'totalWaves':
                return scene.stageFlow?.totalWaves || 1;
            case 'pressure':
                return scene.combatDirector?.pressure || 0;
            case 'directorState':
                return scene.combatDirector?.state || 'build';
            case 'totalKills':
                return scene.enemyManager?.killCount || 0;
            case 'stageState':
                return scene.stageFlow?.state || 'idle';
            case 'followerCount':
                return scene.squadSystem?.followers?.length || 0;
            case 'activeFollowerCount':
                return scene.squadSystem?.followers?.filter(f => f.alive && f.active).length || 0;
            default:
                return undefined;
        }
    }

    /**
     * Check if any incoming connection to a node comes from a getter node
     * that has a resolved value, and return that value.
     * @param {object} graph
     * @param {string} nodeId — the target node to check incoming connections for
     * @param {Map} resolvedValues — getter node ID → resolved value
     * @returns {*} the getter value if found, otherwise undefined
     */
    _findIncomingGetterValue(graph, nodeId, resolvedValues) {
        for (const conn of graph.connections) {
            if (conn.toNode === nodeId && resolvedValues.has(conn.fromNode)) {
                return resolvedValues.get(conn.fromNode);
            }
        }
        return undefined;
    }

    /**
     * Remove all event listeners and clear graphs.
     */
    unloadAll() {
        for (const { eventName, callback } of this._listeners) {
            this.eventBus.off(eventName, callback);
        }
        this._listeners = [];
        this._graphs = [];
    }
}
