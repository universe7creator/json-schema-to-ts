export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-License-Key');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { schema, action, options } = req.body;
  const licenseKey = req.headers['x-license-key'];

  if (!licenseKey && action !== 'preview') {
    return res.status(401).json({
      error: 'License required',
      message: 'Please provide a valid license key'
    });
  }

  try {
    let result;

    switch (action) {
      case 'convert':
        result = await convertSchema(schema, options);
        break;
      case 'validate':
        result = await validateSchema(schema);
        break;
      case 'preview':
        result = await generatePreview(schema);
        break;
      default:
        return res.status(400).json({
          error: 'Invalid action',
          validActions: ['convert', 'validate', 'preview']
        });
    }

    return res.status(200).json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('[JSON Schema to TS] Error:', error);
    return res.status(500).json({
      error: 'Conversion failed',
      message: error.message
    });
  }
}

async function convertSchema(schema, options = {}) {
  const parsedSchema = typeof schema === 'string' ? JSON.parse(schema) : schema;
  const { interfaceType = 'interface', strict = true } = options;

  let ts = '';
  const interfaces = [];

  function toPascalCase(str) {
    return str.replace(/(^.|-)([a-z])/g, (_, prefix, char) => char.toUpperCase());
  }

  function getType(prop, name = '') {
    if (!prop) return 'any';

    if (prop.$ref) {
      const refName = prop.$ref.split('/').pop();
      return toPascalCase(refName);
    }

    switch (prop.type) {
      case 'string':
        if (prop.enum) {
          return `'${prop.enum.join("' | '")}'`;
        }
        if (prop.format === 'date-time' || prop.format === 'date') {
          return strict ? 'Date | string' : 'string';
        }
        return 'string';
      case 'integer':
      case 'number':
        return 'number';
      case 'boolean':
        return 'boolean';
      case 'array':
        if (prop.items) {
          return `${getType(prop.items, name)}[]`;
        }
        return 'any[]';
      case 'object':
        if (prop.properties) {
          return generateInlineType(prop, name);
        }
        return 'Record<string, any>';
      default:
        if (prop.anyOf) {
          return prop.anyOf.map(t => getType(t, name)).join(' | ');
        }
        if (prop.oneOf) {
          return prop.oneOf.map(t => getType(t, name)).join(' | ');
        }
        return 'any';
    }
  }

  function generateInlineType(obj, name) {
    if (!obj.properties) return 'any';

    const props = Object.entries(obj.properties).map(([key, prop]) => {
      const optional = obj.required?.includes(key) ? '' : '?';
      const desc = prop.description ? `\n  /** ${prop.description} */\n` : '';
      return `${desc}  ${key}${optional}: ${getType(prop, key)};`;
    });

    return `{\n${props.join('\n')}\n}`;
  }

  function generateInterface(name, obj) {
    if (!obj.properties) return '';

    const interfaceName = toPascalCase(name);
    const props = Object.entries(obj.properties).map(([key, prop]) => {
      const optional = obj.required?.includes(key) ? '' : '?';
      const desc = prop.description ? `\n  /** ${prop.description} */` : '';
      return `${desc}\n  ${key}${optional}: ${getType(prop, key)};`;
    });

    return `${interfaceType} ${interfaceName} {${props.join('')}\n}`;
  }

  // Handle definitions/components
  const defs = parsedSchema.$defs || parsedSchema.definitions;
  if (defs) {
    for (const [name, def] of Object.entries(defs)) {
      if (def.type === 'object' && def.properties) {
        interfaces.push(generateInterface(name, def));
      }
    }
  }

  // Main type
  if (parsedSchema.type === 'object' && parsedSchema.properties) {
    const mainName = parsedSchema.title || 'Main';
    interfaces.push(generateInterface(mainName, parsedSchema));
  }

  ts = interfaces.join('\n\n');

  if (!ts) {
    ts = '// Could not generate TypeScript from this schema';
  }

  return {
    action: 'convert',
    typescript: ts,
    lines: ts.split('\n').length,
    interfaces: interfaces.length
  };
}

async function validateSchema(schema) {
  try {
    const parsed = typeof schema === 'string' ? JSON.parse(schema) : schema;
    return {
      action: 'validate',
      valid: true,
      type: parsed.type || 'unknown',
      properties: parsed.properties ? Object.keys(parsed.properties) : [],
      message: 'Valid JSON Schema'
    };
  } catch (e) {
    return {
      action: 'validate',
      valid: false,
      message: e.message
    };
  }
}

async function generatePreview(schema) {
  const result = await convertSchema(schema, { interfaceType: 'interface' });
  return {
    action: 'preview',
    typescript: result.typescript.substring(0, 2000) + (result.typescript.length > 2000 ? '\n\n// ... (truncated)' : ''),
    lines: result.lines,
    interfaces: result.interfaces,
    preview: true,
    message: 'Full conversion requires license'
  };
}
