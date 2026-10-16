// The agent's tools, as a small MCP server over stdio (JSON-RPC 2.0, one
// message per line). Each tool reads agent/.build/engine.mjs, the same engine
// the page runs. No tool returns a participant's name.

import { createInterface } from 'node:readline';
import * as engine from './.build/engine.js';

const TOOLS = [
  {
    name: 'list_metrics',
    description: 'Every count the report engine can produce from the records: id, label, kind, plain-words definition and formula.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    run: () => engine.listMetrics(),
  },
  {
    name: 'describe_records',
    description: 'What the organization records: tables, fields, row counts, groups and the reporting periods available.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    run: () => engine.describeRecords(),
  },
  {
    name: 'get_metric',
    description: 'One metric for one period, as the funder copy would show it, with the working.',
    inputSchema: {
      type: 'object',
      properties: { metric: { type: 'string', enum: engine.METRIC_IDS }, period: { type: 'string', enum: engine.PERIOD_IDS } },
      required: ['metric', 'period'],
      additionalProperties: false,
    },
    run: (a) => engine.getMetric(a.metric, a.period),
  },
  {
    name: 'count_by_age',
    description: 'Participants served in a period by the age ranges the records hold, and the bands funder copy uses.',
    inputSchema: { type: 'object', properties: { period: { type: 'string', enum: engine.PERIOD_IDS } }, required: ['period'], additionalProperties: false },
    run: (a) => engine.countByAge(a.period),
  },
];

const send = (msg) => process.stdout.write(JSON.stringify(msg) + '\n');
const rl = createInterface({ input: process.stdin });
rl.on('line', (line) => {
  if (!line.trim()) return;
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return;
  }
  const { id, method, params } = msg;
  if (id === undefined) return; // notifications
  if (method === 'initialize') {
    send({ jsonrpc: '2.0', id, result: { protocolVersion: params?.protocolVersion ?? '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'records', version: '1.0.0' } } });
  } else if (method === 'tools/list') {
    send({ jsonrpc: '2.0', id, result: { tools: TOOLS.map(({ run, ...t }) => t) } });
  } else if (method === 'tools/call') {
    const tool = TOOLS.find((t) => t.name === params?.name);
    try {
      if (!tool) throw new Error(`no tool ${params?.name}`);
      const out = tool.run(params.arguments ?? {});
      send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: JSON.stringify(out, null, 1) }] } });
    } catch (e) {
      send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: String(e.message ?? e) }], isError: true } });
    }
  } else if (method === 'ping') {
    send({ jsonrpc: '2.0', id, result: {} });
  } else {
    send({ jsonrpc: '2.0', id, error: { code: -32601, message: `no method ${method}` } });
  }
});
