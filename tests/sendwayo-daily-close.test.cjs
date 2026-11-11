const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const script = path.join(__dirname, '..', 'scripts', 'sendwayo-daily-close.mjs');
const snapshot = {
  sendwayo_express_v2: {
    envios: {
      envio1: {
        status: 'APROBADO',
        createdAt: '2026-11-10T15:00:00.000Z',
        amount: 100,
        commissionTotal: 8,
        commissionAdmin: 4,
        commissionUser: 4
      }
    },
    pagos: {
      deposito1: {
        status: 'APROBADO',
        type: 'deposito',
        createdAt: '2026-11-10T15:00:00.000Z',
        amount: 2000
      }
    },
    ledger: {
      envios: { envio1: { recorded: true } },
      pagos: { deposito1: { recorded: true } }
    },
    users: {
      remitente1: { balance: 0, commission: 0, commissionAccrued: 0 }
    }
  }
};

// Firebase CLI may emit a successful JSON response followed by its status trailer.
const input = JSON.stringify(snapshot) + '\n' + JSON.stringify({ status: 'success' });
const result = spawnSync(process.execPath, [script], {
  input,
  encoding: 'utf8',
  env: { ...process.env, CLOSE_DATE: '2026-11-10' }
});

assert.equal(result.status, 0, result.stderr || 'daily close script must run under Node.js ES modules');
const report = JSON.parse(result.stdout);
assert.equal(report.closeDate, '2026-11-10');
assert.equal(report.status, 'CERRADO');
assert.equal(report.operationsApproved, 2);
assert.equal(report.totalAmount, 2100);
assert.equal(report.grossCommission, 8);
assert.equal(report.adminCommission, 4);
assert.equal(report.remitterCommission, 4);
assert.equal(report.agentCommission, 0);
assert.deepEqual(report.issues, []);
console.log('SENDWAYO daily close: ES modules, Firebase response trailer, deposits and commission split verified.');
