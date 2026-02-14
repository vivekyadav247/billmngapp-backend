const roundToTwo = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

const normalizeBillItems = (items) => {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('At least one billing item is required');
  }

  return items.map((rawItem, index) => {
    const name = String(rawItem.name || '').trim();
    const qty = Number(rawItem.qty);
    const rate = Number(rawItem.rate);

    if (!name) {
      throw new Error(`Item ${index + 1}: name is required`);
    }

    if (!/[a-zA-Z]/.test(name)) {
      throw new Error(`Item ${index + 1}: name must contain at least one letter`);
    }

    if (!Number.isFinite(qty) || qty <= 0) {
      throw new Error(`Item ${index + 1}: qty must be greater than 0`);
    }

    if (!Number.isFinite(rate) || rate <= 0) {
      throw new Error(`Item ${index + 1}: rate must be greater than 0`);
    }

    const subtotal = roundToTwo(qty * rate);
    return { name, qty, rate, subtotal };
  });
};

const resolvePaymentMode = ({ cash, online, udhar, total }) => {
  if (cash === total) return 'FULL_CASH';
  if (online === total) return 'FULL_ONLINE';
  if (udhar === total) return 'FULL_UDHAR';
  return 'HYBRID';
};

const validatePaymentSplit = (total, payment = {}) => {
  const cash = roundToTwo(Number(payment.cash || 0));
  const online = roundToTwo(Number(payment.online || 0));
  const udhar = roundToTwo(Number(payment.udhar || 0));

  if ([cash, online, udhar].some((amount) => !Number.isFinite(amount) || amount < 0)) {
    throw new Error('Invalid payment split values');
  }

  const splitTotal = roundToTwo(cash + online + udhar);
  const roundedTotal = roundToTwo(total);

  if (splitTotal !== roundedTotal) {
    throw new Error('Payment split must sum exactly to bill total');
  }

  return {
    cash,
    online,
    udhar,
    mode: resolvePaymentMode({ cash, online, udhar, total: roundedTotal }),
  };
};

const generateBillNumber = () => `BILL-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

module.exports = {
  roundToTwo,
  normalizeBillItems,
  validatePaymentSplit,
  generateBillNumber,
};
