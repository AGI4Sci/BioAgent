import { spawn, type ChildProcess } from 'node:child_process';
import { connect } from 'node:net';

const WORKSPACE_PORT = Number(process.env.BIOAGENT_WORKSPACE_PORT || 5174);
const UI_PORT = Number(process.env.BIOAGENT_UI_PORT || 5173);
const children: ChildProcess[] = [];
let shuttingDown = false;

if (await isListening(WORKSPACE_PORT)) {
  console.log(`BioAgent workspace writer already running: http://127.0.0.1:${WORKSPACE_PORT}`);
} else {
  children.push(start('workspace', ['run', 'workspace:server']));
}

if (await isListening(UI_PORT)) {
  console.log(`BioAgent UI already running: http://127.0.0.1:${UI_PORT}`);
} else {
  children.push(start('ui', ['run', 'dev:ui']));
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);

function start(label: string, args: string[]) {
  const child = spawn('npm', args, {
    stdio: 'inherit',
    env: process.env,
  });
  child.once('exit', (code, signal) => {
    if (shuttingDown) return;
    if (code === 0 || signal === 'SIGTERM' || signal === 'SIGINT') return;
    console.error(`${label} dev process exited with ${signal || `code ${code}`}`);
    shutdown();
  });
  return child;
}

function shutdown() {
  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) child.kill('SIGTERM');
  }
}

function isListening(port: number) {
  return new Promise<boolean>((resolve) => {
    const socket = connect({ host: '127.0.0.1', port });
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
  });
}
