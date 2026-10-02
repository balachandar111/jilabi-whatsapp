const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const c = require('./config');
const Admin = require('./models/Admin');
const Product = require('./models/Product');
const Branch = require('./models/Branch');

// SAMPLE DATA for testing — edit real addresses / phone numbers / coordinates / prices in the admin app afterwards.
// Coordinates are approximate area centres, good enough to test "nearest outlet" routing.
const branches = [
  { code: 'KDB', name: 'Kodambakkam', address: 'Kodambakkam, Chennai (update exact address)', lat: 13.0512, lng: 80.2246 },
  { code: 'NGB', name: 'Nungambakkam', address: 'Nungambakkam, Chennai (update exact address)', lat: 13.0604, lng: 80.2426 },
  { code: 'SLG', name: 'Saligramam', address: 'Saligramam, Chennai (update exact address)', lat: 13.0508, lng: 80.2027 },
];
const sizes = (a, b, c2) => [{ label: '250g', price: a }, { label: '500g', price: b }, { label: '1kg', price: c2 }];
const products = [
  { code: 'SW001', name: 'Mysore Pak', category: 'sweet', variants: sizes(120, 230, 450) },
  { code: 'SW002', name: 'Jalebi', category: 'sweet', variants: sizes(90, 170, 330) },
  { code: 'SW003', name: 'Laddu', category: 'sweet', variants: sizes(100, 190, 370) },
  { code: 'SW004', name: 'Halwa', category: 'sweet', variants: sizes(110, 210, 410) },
  { code: 'SW005', name: 'Assorted Sweet Box', category: 'sweet', variants: [{ label: '500g box', price: 280 }, { label: '1kg box', price: 540 }] },
  { code: 'GH001', name: 'Guava Mysurpa', category: 'ghee', variants: sizes(140, 270, 520) },
  { code: 'GH002', name: 'Ghee Mysore Pak', category: 'ghee', variants: sizes(160, 310, 600) },
  { code: 'KA001', name: 'Mixture', category: 'kaaram', variants: sizes(80, 150, 290) },
  { code: 'KA002', name: 'Murukku', category: 'kaaram', variants: sizes(85, 160, 310) },
  { code: 'KA003', name: 'Ribbon Pakoda', category: 'kaaram', variants: sizes(80, 150, 290) },
  { code: 'KA004', name: 'Thattai', category: 'kaaram', variants: sizes(75, 140, 270) },
].map(p => ({ ...p, price: p.variants[0].price, unit: p.variants[0].label, available: true }));

(async () => {
  await mongoose.connect(c.MONGO_URI);
  const hash = await bcrypt.hash(c.ADMIN_PASSWORD, 10);
  await Admin.findOneAndUpdate({ username: c.ADMIN_USER }, { username: c.ADMIN_USER, passwordHash: hash }, { upsert: true });
  console.log(`Admin ready -> username: ${c.ADMIN_USER}`);

  if (!(await Branch.countDocuments())) { await Branch.insertMany(branches); console.log('Sample outlets added (Kodambakkam, Nungambakkam, Saligramam)'); }

  if (process.argv.includes('--refresh-products')) {           // DESTRUCTIVE: replaces ALL products with the sample set
    await Product.deleteMany({}); await Product.insertMany(products); console.log('Products replaced with sample set (with 250g/500g/1kg sizes)');
  } else if (!(await Product.countDocuments())) { await Product.insertMany(products); console.log('Sample products added'); }
  else console.log('Products already exist — left untouched (use: npm run seed -- --refresh-products to replace with the sample set)');

  await mongoose.disconnect();
})().catch(e => { console.error(e); process.exit(1); });
