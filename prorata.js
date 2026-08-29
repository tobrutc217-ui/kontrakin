/**
 * Prorata is ONLY for changing the billing day.
 * Normal monthly billing is always the full room rate.
 * Example agreed rounding: 26,667 -> 25,000, so round down to Rp5,000.
 */
function floorTo5000(value) {
  const n = Math.max(0, Number(value) || 0);
  return Math.floor(n / 5000) * 5000;
}

function computeProrata(rate, oldDay, newDay) {
  const monthlyRate = Number(rate) || 0;
  const from = Number(oldDay);
  const to = Number(newDay);
  if (!Number.isInteger(from) || from < 1 || from > 31) throw new Error('oldDay must be 1..31');
  if (!Number.isInteger(to) || to < 1 || to > 31) throw new Error('newDay must be 1..31');

  const shiftDays = to - from;
  const days = Math.abs(shiftDays);
  const raw = (monthlyRate / 30) * days;
  const rounded = floorTo5000(raw);

  return {
    oldDay: from,
    newDay: to,
    shiftDays,
    days,
    raw,
    rounded,
    amount: shiftDays > 0 ? rounded : shiftDays < 0 ? -rounded : 0,
  };
}

module.exports = { computeProrata, floorTo5000 };
