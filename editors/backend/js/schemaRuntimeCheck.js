export function validateAgainstJsonSchema(value, schema, path = '$') {
    const errors = [];
    validateNode(value, schema, path, errors);
    return errors;
}

function validateNode(value, schema, path, errors) {
    if (!schema || typeof schema !== 'object') return;

    if (schema.const !== undefined && value !== schema.const) {
        errors.push(`${path}: expected const ${JSON.stringify(schema.const)}`);
        return;
    }
    if (Array.isArray(schema.enum) && !schema.enum.includes(value)) {
        errors.push(`${path}: expected one of ${schema.enum.map((v) => JSON.stringify(v)).join(', ')}`);
        return;
    }

    const type = schema.type;
    if (type) {
        const ok = isType(value, type);
        if (!ok) {
            errors.push(`${path}: expected type ${type}`);
            return;
        }
    }

    if (typeof value === 'number') {
        if (Number.isFinite(schema.minimum) && value < schema.minimum) {
            errors.push(`${path}: must be >= ${schema.minimum}`);
        }
        if (Number.isFinite(schema.maximum) && value > schema.maximum) {
            errors.push(`${path}: must be <= ${schema.maximum}`);
        }
    }

    if (typeof value === 'string') {
        if (Number.isFinite(schema.minLength) && value.length < schema.minLength) {
            errors.push(`${path}: string length must be >= ${schema.minLength}`);
        }
        if (Number.isFinite(schema.maxLength) && value.length > schema.maxLength) {
            errors.push(`${path}: string length must be <= ${schema.maxLength}`);
        }
        if (typeof schema.pattern === 'string') {
            try {
                const re = new RegExp(schema.pattern);
                if (!re.test(value)) errors.push(`${path}: string does not match pattern ${schema.pattern}`);
            } catch {
                errors.push(`${path}: invalid pattern in schema`);
            }
        }
    }

    if (Array.isArray(value)) {
        if (schema.items && typeof schema.items === 'object') {
            for (let i = 0; i < value.length; i++) {
                validateNode(value[i], schema.items, `${path}[${i}]`, errors);
            }
        }
        return;
    }

    if (!value || typeof value !== 'object') return;

    const required = Array.isArray(schema.required) ? schema.required : [];
    for (const key of required) {
        if (value[key] === undefined) errors.push(`${path}.${key}: required`);
    }

    const props = schema.properties && typeof schema.properties === 'object'
        ? schema.properties
        : {};
    for (const [key, childSchema] of Object.entries(props)) {
        if (value[key] === undefined) continue;
        validateNode(value[key], childSchema, `${path}.${key}`, errors);
    }

    if (schema.additionalProperties === false) {
        const allowed = new Set(Object.keys(props));
        for (const key of Object.keys(value)) {
            if (!allowed.has(key)) errors.push(`${path}.${key}: additional property not allowed`);
        }
    }
}

function isType(value, type) {
    if (type === 'object') return !!value && typeof value === 'object' && !Array.isArray(value);
    if (type === 'array') return Array.isArray(value);
    if (type === 'string') return typeof value === 'string';
    if (type === 'number') return typeof value === 'number' && Number.isFinite(value);
    if (type === 'integer') return typeof value === 'number' && Number.isInteger(value);
    if (type === 'boolean') return typeof value === 'boolean';
    return true;
}
