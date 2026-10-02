export const inr = (n) => '₹' + Number(n || 0).toLocaleString('en-IN');
export const fmtDate = (d) =>
  new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

const COLORS = {
  paid: 'green', pending: 'orange', expired: 'gray',
  new: 'blue', packed: 'purple', ready: 'teal', contacted: 'purple', quoted: 'orange', confirmed: 'green', closed: 'gray', delivery: 'blue', pickup: 'purple', dispatched: 'teal', delivered: 'green', cancelled: 'red',
};
export const Badge = ({ value }) => <span className={`badge ${COLORS[value] || 'gray'}`}>{value}</span>;
