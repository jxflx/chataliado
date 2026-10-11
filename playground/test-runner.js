/**
 * ChatAliado Playground - Unified Test Runner
 * Executes Milestone test suites (M1, M2, M3, M4, M5) sequentially, captures outputs,
 * and prints an aggregated test report summary table.
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEST_SUITES = [
  {
    id: 'M1',
    file: 'test-m1.js',
    name: 'Config, Reactive Store, CSS & HTML Scaffold',
  },
  {
    id: 'M2',
    file: 'test-m2.js',
    name: 'ApiClient, Chat UI & Webhook Simulator',
  },
  {
    id: 'M3',
    file: 'test-m3.js',
    name: 'Kitchen & Orders Dashboard, Financials & Comanda',
  },
  {
    id: 'M4',
    file: 'test-m4.js',
    name: 'LLM Tools Inspector, Markdown Memory & Debugger',
  },
  {
    id: 'M5',
    file: 'test-m5.js',
    name: 'App Wiring, Health Checks, Polling, Toasts & Settings',
  },
];

/**
 * Runs a single test script in a child process.
 * @param {{ id: string, file: string, name: string }} suite
 * @returns {Promise<{ id: string, file: string, name: string, passed: boolean, durationMs: number, output: string, error?: string }>}
 */
function runSuite(suite) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const filePath = path.resolve(__dirname, suite.file);

    const child = spawn(process.execPath, [filePath], {
      cwd: __dirname,
      env: { ...process.env, NODE_NO_WARNINGS: '1' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('close', (code) => {
      const durationMs = Date.now() - startTime;
      resolve({
        id: suite.id,
        file: suite.file,
        name: suite.name,
        passed: code === 0,
        durationMs,
        output: stdout,
        error: stderr,
      });
    });

    child.on('error', (err) => {
      const durationMs = Date.now() - startTime;
      resolve({
        id: suite.id,
        file: suite.file,
        name: suite.name,
        passed: false,
        durationMs,
        output: stdout,
        error: err.message,
      });
    });
  });
}

/**
 * Formats table row.
 */
function pad(str, len, align = 'left') {
  const text = String(str);
  if (text.length >= len) return text.slice(0, len);
  const diff = len - text.length;
  return align === 'right' ? ' '.repeat(diff) + text : text + ' '.repeat(diff);
}

async function main() {
  console.log('================================================================================');
  console.log('🍕 CHATALIADO PLAYGROUND — UNIFIED TEST RUNNER (M1 to M5)');
  console.log('================================================================================\n');

  const results = [];
  let totalTime = 0;

  for (const suite of TEST_SUITES) {
    process.stdout.write(`⏳ Running [${suite.id}] ${suite.name} (${suite.file})... `);
    const res = await runSuite(suite);
    results.push(res);
    totalTime += res.durationMs;

    if (res.passed) {
      console.log(`✅ PASS (${res.durationMs}ms)`);
    } else {
      console.log(`❌ FAIL (${res.durationMs}ms)`);
      if (res.error) {
        console.error('\n--- Error Details ---');
        console.error(res.error);
      }
      if (res.output && !res.error) {
        console.error('\n--- Output ---');
        console.error(res.output);
      }
    }
  }

  // Print Summary Table
  console.log('\n================================================================================');
  console.log('📊 AGGREGATED TEST EXECUTION REPORT');
  console.log('================================================================================');
  console.log(`| ${pad('Milestone', 18)} | ${pad('Test Suite Name', 46)} | ${pad('Status', 8)} | ${pad('Time', 8)} |`);
  console.log(`|${'-'.repeat(20)}|${'-'.repeat(48)}|${'-'.repeat(10)}|${'-'.repeat(10)}|`);

  let allPassed = true;
  for (const r of results) {
    const statusText = r.passed ? '✅ PASS' : '❌ FAIL';
    if (!r.passed) allPassed = false;
    console.log(
      `| ${pad(r.id + ' (' + r.file + ')', 18)} | ${pad(r.name, 46)} | ${pad(statusText, 8)} | ${pad(r.durationMs + 'ms', 8, 'right')} |`
    );
  }

  console.log('================================================================================');
  console.log(
    `Total Suites: ${results.length} | Passed: ${results.filter((r) => r.passed).length} | Failed: ${
      results.filter((r) => !r.passed).length
    } | Total Duration: ${totalTime}ms`
  );
  console.log('================================================================================');

  if (allPassed) {
    console.log('\n🎉 ALL MILESTONES (M1-M5) VERIFICATIONS PASSED WITH 100% SUCCESS!\n');
    process.exit(0);
  } else {
    console.error('\n💥 SOME MILESTONE TESTS FAILED! PLEASE REVIEW LOGS ABOVE.\n');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal runner error:', err);
  process.exit(1);
});
