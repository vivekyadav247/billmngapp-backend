const pad = (n) => (n < 10 ? `0${n}` : `${n}`);

const format = (dateInput) => {
  const d = new Date(dateInput);
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mi = pad(d.getMinutes());
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
};

module.exports = {
  format,
};
