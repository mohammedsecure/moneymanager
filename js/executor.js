// js/executor.js
import { recordTransaction, recordDebt, settleDebt, setLiveFXRate, getLiveFXRate } from './ledger.js';

export async function executeAiOperations(payload) {
  if (!payload || !Array.isArray(payload.operations)) {
    throw new Error('هيكل البيانات البرمجية غير صالح للتنفيذ');
  }

  const currentFx = payload.fx_rate_used || await getLiveFXRate();
  if (payload.fx_rate_used) {
    await setLiveFXRate(payload.fx_rate_used);
  }

  const results = [];

  for (const op of payload.operations) {
    if (op.action === 'TRANSACTION') {
      const txId = await recordTransaction({
        type: op.type, // 'INCOME', 'EXPENSE', 'MANUAL_ADJUST'
        account: op.account || op.storage || 'كاش عام',
        project: op.project || 'عام',
        amount: op.amount,
        currency: op.currency || 'SYP',
        description: op.description || payload.summary_ar,
        customFxRate: currentFx
      });
      results.push({ action: 'TRANSACTION', id: txId });

    } else if (op.action === 'DEBT') {
      const personName = op.person || op.name || op.party || 'جهة غير محددة';
      const debtId = await recordDebt({
        person: personName,
        amount: op.amount,
        currency: op.currency || 'USD',
        direction: op.direction, // 'TO_PAY' أو 'TO_RECEIVE'
        project: op.project || 'عام',
        note: op.note || ''
      });
      results.push({ action: 'DEBT', id: debtId });

    } else if (op.action === 'SETTLE_DEBT') {
      await settleDebt(op.debtId, op.note || 'تسوية');
      results.push({ action: 'SETTLE_DEBT', id: op.debtId });
    }
  }

  return results;
}