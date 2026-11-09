
import React, { useEffect, useState } from 'react';
import {
  Alert,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SQLiteProvider, useSQLiteContext } from 'expo-sqlite';

const BLUE = '#0A1F44';
const GOLD = '#D4AF37';

const money = value =>
  `MK ${Number(value || 0).toLocaleString('en-US', {
    maximumFractionDigits: 2,
  })}`;

async function initializeDatabase(db) {
  await db.execAsync(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      price REAL NOT NULL,
      quantity INTEGER NOT NULL,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS sales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER,
      product_name TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      unit_price REAL NOT NULL,
      total REAL NOT NULL,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );
  `);

  // Insert demonstration products only when the database is empty.
  const existing = await db.getFirstAsync(
    'SELECT COUNT(*) AS total FROM products'
  );

  if (existing.total === 0) {
    await db.runAsync(
      'INSERT INTO products (name, price, quantity) VALUES (?, ?, ?)',
      'Sugar', 3500, 20
    );
    await db.runAsync(
      'INSERT INTO products (name, price, quantity) VALUES (?, ?, ?)',
      'Cooking Oil', 6500, 15
    );
    await db.runAsync(
      'INSERT INTO products (name, price, quantity) VALUES (?, ?, ?)',
      'Rice', 5000, 25
    );
    await db.runAsync(
      'INSERT INTO products (name, price, quantity) VALUES (?, ?, ?)',
      'Soap', 1800, 30
    );
  }
}

function ShopApp() {
  const db = useSQLiteContext();

  const [page, setPage] = useState('Dashboard');
  const [products, setProducts] = useState([]);
  const [sales, setSales] = useState([]);

  const [todaySales, setTodaySales] = useState(0);
  const [weeklySales, setWeeklySales] = useState(0);
  const [monthlySales, setMonthlySales] = useState(0);
  const [totalSales, setTotalSales] = useState(0);

  const [todayTransactions, setTodayTransactions] = useState(0);
  const [weeklyTransactions, setWeeklyTransactions] = useState(0);

  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [quantity, setQuantity] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [search, setSearch] = useState('');

  const [selectedProduct, setSelectedProduct] = useState(null);
  const [saleQuantity, setSaleQuantity] = useState('1');

  async function loadData() {
    const productRows = await db.getAllAsync(
      'SELECT * FROM products ORDER BY name ASC'
    );

    const saleRows = await db.getAllAsync(
      'SELECT * FROM sales ORDER BY id DESC'
    );

    const today = await db.getFirstAsync(`
      SELECT
        COALESCE(SUM(total),0) AS amount,
        COUNT(*) AS transactions
      FROM sales
      WHERE date(created_at) = date('now','localtime')
    `);

    const weekly = await db.getFirstAsync(`
      SELECT
        COALESCE(SUM(total),0) AS amount,
        COUNT(*) AS transactions
      FROM sales
      WHERE date(created_at) >= date('now','localtime','-6 days')
        AND date(created_at) <= date('now','localtime')
    `);

    const monthly = await db.getFirstAsync(`
      SELECT COALESCE(SUM(total),0) AS amount
      FROM sales
      WHERE strftime('%Y-%m',created_at) =
            strftime('%Y-%m','now','localtime')
    `);

    const allTime = await db.getFirstAsync(`
      SELECT COALESCE(SUM(total),0) AS amount
      FROM sales
    `);

    setProducts(productRows);
    setSales(saleRows);
    setTodaySales(today.amount);
    setWeeklySales(weekly.amount);
    setMonthlySales(monthly.amount);
    setTotalSales(allTime.amount);
    setTodayTransactions(today.transactions);
    setWeeklyTransactions(weekly.transactions);
  }

  useEffect(() => {
    loadData();
  }, []);

  function clearForm() {
    setName('');
    setPrice('');
    setQuantity('');
    setEditingId(null);
  }

  async function saveProduct() {
    const cleanName = name.trim();
    const productPrice = Number(price);
    const productQuantity = Number(quantity);

    if (!cleanName || price.trim() === '' || quantity.trim() === '') {
      Alert.alert('Missing information', 'Please complete all product fields.');
      return;
    }

    if (
      !Number.isFinite(productPrice) ||
      productPrice <= 0 ||
      !Number.isInteger(productQuantity) ||
      productQuantity < 0
    ) {
      Alert.alert(
        'Invalid information',
        'Price must be greater than zero and stock must be a whole number of zero or more.'
      );
      return;
    }

    try {
      if (editingId !== null) {
        await db.runAsync(
          'UPDATE products SET name=?, price=?, quantity=? WHERE id=?',
          cleanName,
          productPrice,
          productQuantity,
          editingId
        );
      } else {
        await db.runAsync(
          'INSERT INTO products (name, price, quantity) VALUES (?, ?, ?)',
          cleanName,
          productPrice,
          productQuantity
        );
      }

      clearForm();
      await loadData();
      setPage('Products');
      Alert.alert('Success', 'Product saved successfully.');
    } catch (error) {
      Alert.alert('Error', 'Unable to save the product.');
    }
  }

  function editProduct(product) {
    setEditingId(product.id);
    setName(product.name);
    setPrice(String(product.price));
    setQuantity(String(product.quantity));
    setPage('Add Product');
  }

  function deleteProduct(product) {
    Alert.alert(
      'Delete Product',
      `Delete ${product.name}? Existing sales history will be retained.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await db.runAsync(
              'DELETE FROM products WHERE id=?',
              product.id
            );
            await loadData();
            Alert.alert('Deleted', 'Product deleted successfully.');
          },
        },
      ]
    );
  }

  async function recordSale() {
    const amount = Number(saleQuantity);

    if (!selectedProduct) {
      Alert.alert('Select Product', 'Please select a product.');
      return;
    }

    if (!Number.isInteger(amount) || amount <= 0) {
      Alert.alert('Invalid Quantity', 'Enter a valid whole number.');
      return;
    }

    if (amount > selectedProduct.quantity) {
      Alert.alert('Insufficient Stock', 'The available stock is not enough.');
      return;
    }

    const total = selectedProduct.price * amount;

    try {
      await db.withTransactionAsync(async () => {
        const result = await db.runAsync(
          `UPDATE products
           SET quantity = quantity - ?
           WHERE id = ? AND quantity >= ?`,
          amount,
          selectedProduct.id,
          amount
        );

        if (result.changes !== 1) {
          throw new Error('Stock availability has changed. Try again.');
        }

        await db.runAsync(
          `INSERT INTO sales
           (product_id, product_name, quantity, unit_price, total)
           VALUES (?, ?, ?, ?, ?)`,
          selectedProduct.id,
          selectedProduct.name,
          amount,
          selectedProduct.price,
          total
        );
      });

      setSelectedProduct(null);
      setSaleQuantity('1');
      await loadData();
      setPage('Sales');

      Alert.alert(
        'Sale Successful',
        `${amount} × ${selectedProduct.name}\nTotal: ${money(total)}`
      );
    } catch (error) {
      await loadData();
      Alert.alert('Sale Failed', error.message);
    }
  }

  const filteredProducts = products.filter(product =>
    product.name.toLowerCase().includes(search.toLowerCase())
  );

  const stockUnits = products.reduce(
    (sum, product) => sum + product.quantity,
    0
  );

  const lowStock = products.filter(product => product.quantity <= 5);

  const today = new Date().toLocaleDateString();

  function goTo(nextPage) {
    if (nextPage === 'Add Product') clearForm();
    setPage(nextPage);
  }

  function NavButton({ label, symbol }) {
    const active = page === label;

    return (
      <TouchableOpacity
        style={[styles.navButton, active && styles.activeNav]}
        onPress={() => goTo(label)}
      >
        <Text style={styles.navSymbol}>{symbol}</Text>
        <Text style={[styles.navText, active && styles.activeNavText]}>
          {label}
        </Text>
      </TouchableOpacity>
    );
  }

  function StatCard({ label, value, symbol }) {
    return (
      <View style={styles.statCard}>
        <Text style={styles.statSymbol}>{symbol}</Text>
        <Text style={styles.statLabel}>{label}</Text>
        <Text style={styles.statValue}>{value}</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar backgroundColor={BLUE} barStyle="light-content" />

      <View style={styles.header}>
        <View>
          <Text style={styles.logo}>OFFLINE SHOP</Text>
          <Text style={styles.headerSubtitle}>
            SHOP MANAGEMENT SYSTEM
          </Text>
        </View>
        <View style={styles.headerBadge}>
          <Text style={styles.headerBadgeText}>OS</Text>
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.navigation}
        contentContainerStyle={styles.navigationContent}
      >
        <NavButton label="Dashboard" symbol="⌂" />
        <NavButton label="Products" symbol="▤" />
        <NavButton label="Add Product" symbol="＋" />
        <NavButton label="Sales" symbol="₵" />
        <NavButton label="Reports" symbol="▥" />
      </ScrollView>

      <ScrollView
        style={styles.content}
        contentContainerStyle={{ paddingBottom: 35 }}
      >
        {page === 'Dashboard' && (
          <View>
            <Text style={styles.heading}>Dashboard</Text>
            <Text style={styles.muted}>
              Welcome back. Here is your shop overview.
            </Text>

            <View style={styles.dateCard}>
              <Text style={styles.dateText}>TODAY</Text>
              <Text style={styles.dateValue}>{today}</Text>
            </View>

            <View style={styles.statsGrid}>
              <StatCard
                label="Today's Sales"
                value={money(todaySales)}
                symbol="↗"
              />
              <StatCard
                label="Weekly Sales"
                value={money(weeklySales)}
                symbol="▥"
              />
              <StatCard
                label="Total Products"
                value={products.length}
                symbol="▤"
              />
              <StatCard
                label="Stock Units"
                value={stockUnits}
                symbol="▦"
              />
            </View>

            <View style={styles.panel}>
              <Text style={styles.panelTitle}>Sales Overview</Text>
              <View style={styles.overviewRow}>
                <Text style={styles.muted}>Monthly Sales</Text>
                <Text style={styles.overviewValue}>{money(monthlySales)}</Text>
              </View>
              <View style={styles.overviewRow}>
                <Text style={styles.muted}>All-time Sales</Text>
                <Text style={styles.overviewValue}>{money(totalSales)}</Text>
              </View>
              <View style={styles.overviewRow}>
                <Text style={styles.muted}>Today's Transactions</Text>
                <Text style={styles.overviewValue}>{todayTransactions}</Text>
              </View>
            </View>

            <View style={styles.panel}>
              <View style={styles.panelHeader}>
                <Text style={styles.panelTitle}>Low Stock Alerts</Text>
                <View style={styles.alertBadge}>
                  <Text style={styles.alertBadgeText}>{lowStock.length}</Text>
                </View>
              </View>

              {lowStock.length === 0 ? (
                <Text style={styles.muted}>All products have sufficient stock.</Text>
              ) : (
                lowStock.map(product => (
                  <View key={product.id} style={styles.listRow}>
                    <Text style={styles.itemName}>{product.name}</Text>
                    <Text style={styles.warning}>
                      {product.quantity} remaining
                    </Text>
                  </View>
                ))
              )}
            </View>

            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => setPage('Sales')}
            >
              <Text style={styles.buttonText}>＋ RECORD A SALE</Text>
            </TouchableOpacity>
          </View>
        )}

        {page === 'Products' && (
          <View>
            <Text style={styles.heading}>Product Management</Text>
            <Text style={styles.muted}>
              Manage your shop inventory.
            </Text>

            <TextInput
              style={styles.input}
              placeholder="Search products..."
              value={search}
              onChangeText={setSearch}
            />

            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => goTo('Add Product')}
            >
              <Text style={styles.buttonText}>＋ ADD NEW PRODUCT</Text>
            </TouchableOpacity>

            <Text style={styles.sectionCount}>
              {filteredProducts.length} product(s)
            </Text>

            {filteredProducts.length === 0 ? (
              <Text style={styles.empty}>No matching products found.</Text>
            ) : (
              filteredProducts.map(product => (
                <View key={product.id} style={styles.productCard}>
                  <View style={styles.productTop}>
                    <View style={styles.productIcon}>
                      <Text style={styles.productIconText}>
                        {product.name.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.itemName}>{product.name}</Text>
                      <Text style={styles.muted}>
                        {money(product.price)}
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.stockBadge,
                        product.quantity <= 5 && styles.lowStockBadge,
                      ]}
                    >
                      <Text
                        style={[
                          styles.stockBadgeText,
                          product.quantity <= 5 && styles.lowStockText,
                        ]}
                      >
                        {product.quantity} in stock
                      </Text>
                    </View>
                  </View>

                  <View style={styles.actionRow}>
                    <TouchableOpacity
                      style={styles.editButton}
                      onPress={() => editProduct(product)}
                    >
                      <Text style={styles.buttonText}>EDIT</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.deleteButton}
                      onPress={() => deleteProduct(product)}
                    >
                      <Text style={styles.buttonText}>DELETE</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
          </View>
        )}

        {page === 'Add Product' && (
          <View>
            <Text style={styles.heading}>
              {editingId !== null ? 'Edit Product' : 'Add New Product'}
            </Text>
            <Text style={styles.muted}>
              Enter the product information below.
            </Text>

            <View style={styles.formCard}>
              <Text style={styles.label}>Product Name</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Sugar"
                value={name}
                onChangeText={setName}
              />

              <Text style={styles.label}>Selling Price (MWK)</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. 3500"
                keyboardType="decimal-pad"
                value={price}
                onChangeText={setPrice}
              />

              <Text style={styles.label}>Stock Quantity</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. 20"
                keyboardType="numeric"
                value={quantity}
                onChangeText={setQuantity}
              />

              <TouchableOpacity
                style={styles.primaryButton}
                onPress={saveProduct}
              >
                <Text style={styles.buttonText}>
                  {editingId !== null ? 'UPDATE PRODUCT' : 'SAVE PRODUCT'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => {
                  clearForm();
                  setPage('Products');
                }}
              >
                <Text style={styles.cancelText}>CANCEL</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {page === 'Sales' && (
          <View>
            <Text style={styles.heading}>Sales Management</Text>
            <Text style={styles.muted}>
              Select a product and enter the quantity sold.
            </Text>

            <TextInput
              style={styles.input}
              placeholder="Search products..."
              value={search}
              onChangeText={setSearch}
            />

            <Text style={styles.label}>Available Products</Text>

            {filteredProducts.length === 0 ? (
              <Text style={styles.empty}>No products available.</Text>
            ) : (
              filteredProducts.map(product => (
                <TouchableOpacity
                  key={product.id}
                  disabled={product.quantity === 0}
                  style={[
                    styles.selectProduct,
                    selectedProduct?.id === product.id &&
                      styles.selectedProduct,
                    product.quantity === 0 && { opacity: 0.45 },
                  ]}
                  onPress={() => setSelectedProduct(product)}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemName}>{product.name}</Text>
                    <Text style={styles.muted}>
                      {money(product.price)} · Stock: {product.quantity}
                    </Text>
                  </View>
                  <Text style={styles.selectIndicator}>
                    {selectedProduct?.id === product.id ? '✓' : '○'}
                  </Text>
                </TouchableOpacity>
              ))
            )}

            <View style={styles.formCard}>
              <Text style={styles.label}>Quantity Sold</Text>
              <TextInput
                style={styles.input}
                keyboardType="numeric"
                value={saleQuantity}
                onChangeText={setSaleQuantity}
              />

              <View style={styles.saleTotal}>
                <Text style={styles.muted}>TOTAL AMOUNT</Text>
                <Text style={styles.reportAmount}>
                  {money(
                    selectedProduct
                      ? selectedProduct.price * Number(saleQuantity || 0)
                      : 0
                  )}
                </Text>
              </View>

              <TouchableOpacity
                style={[
                  styles.primaryButton,
                  !selectedProduct && { opacity: 0.5 },
                ]}
                onPress={recordSale}
              >
                <Text style={styles.buttonText}>CONFIRM SALE</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.panelTitle}>Recent Transactions</Text>

            {sales.slice(0, 10).map(sale => (
              <View key={sale.id} style={styles.listRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemName}>{sale.product_name}</Text>
                  <Text style={styles.muted}>
                    Quantity sold: {sale.quantity}
                  </Text>
                </View>
                <Text style={styles.amount}>{money(sale.total)}</Text>
              </View>
            ))}
          </View>
        )}

        {page === 'Reports' && (
          <View>
            <Text style={styles.heading}>Sales Reports</Text>
            <Text style={styles.muted}>
              Monitor your business sales performance.
            </Text>

            <View style={styles.reportCard}>
              <Text style={styles.reportLabel}>TODAY'S SALES</Text>
              <Text style={styles.reportAmount}>{money(todaySales)}</Text>
              <Text style={styles.muted}>
                {todayTransactions} transaction(s)
              </Text>
            </View>

            <View style={styles.reportCard}>
              <Text style={styles.reportLabel}>LAST 7 DAYS</Text>
              <Text style={styles.reportAmount}>{money(weeklySales)}</Text>
              <Text style={styles.muted}>
                {weeklyTransactions} transaction(s)
              </Text>
            </View>

            <View style={styles.reportCard}>
              <Text style={styles.reportLabel}>THIS MONTH</Text>
              <Text style={styles.reportAmount}>{money(monthlySales)}</Text>
            </View>

            <View style={styles.reportCard}>
              <Text style={styles.reportLabel}>ALL-TIME SALES</Text>
              <Text style={styles.reportAmount}>{money(totalSales)}</Text>
              <Text style={styles.muted}>
                {sales.length} recorded transaction(s)
              </Text>
            </View>

            <Text style={styles.panelTitle}>Complete Sales History</Text>

            {sales.length === 0 ? (
              <Text style={styles.empty}>No sales have been recorded.</Text>
            ) : (
              sales.map(sale => (
                <View key={sale.id} style={styles.productCard}>
                  <View style={styles.overviewRow}>
                    <Text style={styles.itemName}>{sale.product_name}</Text>
                    <Text style={styles.amount}>{money(sale.total)}</Text>
                  </View>
                  <Text style={styles.muted}>
                    {sale.quantity} × {money(sale.unit_price)}
                  </Text>
                  <Text style={styles.muted}>
                    Date: {sale.created_at}
                  </Text>
                </View>
              ))
            )}
          </View>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <Text style={styles.footerTitle}>OFFLINE SHOP MANAGEMENT</Text>
        <Text style={styles.footerText}>
          Local Database · Offline Access · Version 1.0
        </Text>
      </View>
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <SQLiteProvider
      databaseName="offline_shop.db"
      onInit={initializeDatabase}
    >
      <ShopApp />
    </SQLiteProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F6FB',
  },
  header: {
    backgroundColor: BLUE,
    paddingHorizontal: 20,
    paddingVertical: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  logo: {
    color: '#FFFFFF',
    fontSize: 23,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  headerSubtitle: {
    color: GOLD,
    fontSize: 10,
    marginTop: 5,
    letterSpacing: 2,
  },
  headerBadge: {
    width: 45,
    height: 45,
    borderWidth: 2,
    borderColor: GOLD,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerBadgeText: {
    color: GOLD,
    fontWeight: 'bold',
    fontSize: 19,
  },
  navigation: {
    backgroundColor: '#FFFFFF',
    maxHeight: 65,
  },
  navigationContent: {
    paddingHorizontal: 7,
    alignItems: 'center',
  },
  navButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginHorizontal: 3,
    borderRadius: 9,
    minWidth: 66,
  },
  activeNav: {
    backgroundColor: BLUE,
  },
  navSymbol: {
    fontSize: 18,
    color: GOLD,
    marginBottom: 2,
  },
  navText: {
    color: BLUE,
    fontSize: 10,
    fontWeight: '600',
  },
  activeNavText: {
    color: '#FFFFFF',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  heading: {
    fontSize: 25,
    fontWeight: 'bold',
    color: BLUE,
    marginBottom: 6,
  },
  muted: {
    color: '#718096',
    fontSize: 12,
    marginTop: 4,
  },
  dateCard: {
    backgroundColor: BLUE,
    borderRadius: 12,
    padding: 15,
    marginTop: 17,
  },
  dateText: {
    color: GOLD,
    fontWeight: 'bold',
    fontSize: 10,
    letterSpacing: 2,
  },
  dateValue: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: 'bold',
    marginTop: 5,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginTop: 14,
  },
  statCard: {
    width: '48%',
    backgroundColor: '#FFFFFF',
    padding: 14,
    borderRadius: 12,
    marginBottom: 12,
    elevation: 2,
  },
  statSymbol: {
    color: GOLD,
    fontSize: 21,
    fontWeight: 'bold',
  },
  statLabel: {
    color: '#718096',
    fontSize: 12,
    marginTop: 7,
  },
  statValue: {
    color: BLUE,
    fontSize: 17,
    fontWeight: 'bold',
    marginTop: 6,
  },
  panel: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 12,
    marginTop: 14,
  },
  panelTitle: {
    fontSize: 17,
    fontWeight: 'bold',
    color: BLUE,
    marginTop: 15,
    marginBottom: 10,
  },
  panelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  alertBadge: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  alertBadgeText: {
    color: '#B45309',
    fontWeight: 'bold',
  },
  overviewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 9,
  },
  overviewValue: {
    color: BLUE,
    fontWeight: 'bold',
    fontSize: 13,
  },
  primaryButton: {
    backgroundColor: BLUE,
    padding: 15,
    borderRadius: 9,
    alignItems: 'center',
    marginTop: 15,
  },
  buttonText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 12,
  },
  productCard: {
    backgroundColor: '#FFFFFF',
    padding: 15,
    borderRadius: 11,
    marginTop: 12,
    elevation: 1,
  },
  productTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  productIcon: {
    width: 42,
    height: 42,
    backgroundColor: '#E9EEF7',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  productIconText: {
    color: BLUE,
    fontWeight: 'bold',
    fontSize: 18,
  },
  itemName: {
    color: BLUE,
    fontSize: 14,
    fontWeight: 'bold',
  },
  stockBadge: {
    backgroundColor: '#DCFCE7',
    padding: 7,
    borderRadius: 7,
  },
  stockBadgeText: {
    color: '#15803D',
    fontSize: 10,
    fontWeight: 'bold',
  },
  lowStockBadge: {
    backgroundColor: '#FEF3C7',
  },
  lowStockText: {
    color: '#B45309',
  },
  actionRow: {
    flexDirection: 'row',
    marginTop: 13,
    gap: 10,
  },
  editButton: {
    backgroundColor: '#2563EB',
    padding: 11,
    borderRadius: 7,
    flex: 1,
    alignItems: 'center',
  },
  deleteButton: {
    backgroundColor: '#DC2626',
    padding: 11,
    borderRadius: 7,
    flex: 1,
    alignItems: 'center',
  },
  label: {
    color: BLUE,
    fontWeight: 'bold',
    fontSize: 13,
    marginTop: 17,
    marginBottom: 7,
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DCE3ED',
    padding: 13,
    borderRadius: 8,
    fontSize: 14,
    color: BLUE,
    marginTop: 12,
  },
  formCard: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 12,
    marginTop: 16,
  },
  cancelButton: {
    padding: 13,
    alignItems: 'center',
    marginTop: 7,
  },
  cancelText: {
    color: BLUE,
    fontWeight: 'bold',
  },
  empty: {
    color: '#718096',
    textAlign: 'center',
    padding: 25,
  },
  sectionCount: {
    color: BLUE,
    fontWeight: 'bold',
    marginTop: 18,
  },
  warning: {
    color: '#B45309',
    fontWeight: 'bold',
    fontSize: 12,
  },
  listRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#EDF0F5',
  },
  amount: {
    color: '#15803D',
    fontWeight: 'bold',
    fontSize: 13,
  },
  selectProduct: {
    backgroundColor: '#FFFFFF',
    padding: 14,
    borderRadius: 9,
    marginTop: 9,
    borderWidth: 1,
    borderColor: '#DCE3ED',
    flexDirection: 'row',
    alignItems: 'center',
  },
  selectedProduct: {
    borderColor: '#2563EB',
    borderWidth: 2,
    backgroundColor: '#EFF6FF',
  },
  selectIndicator: {
    color: '#2563EB',
    fontSize: 22,
    marginLeft: 10,
  },
  saleTotal: {
    backgroundColor: '#F3F6FB',
    padding: 14,
    borderRadius: 9,
    marginTop: 15,
  },
  reportCard: {
    backgroundColor: '#FFFFFF',
    padding: 17,
    borderRadius: 12,
    marginTop: 13,
    elevation: 1,
  },
  reportLabel: {
    color: '#718096',
    fontSize: 11,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  reportAmount: {
    color: BLUE,
    fontSize: 24,
    fontWeight: 'bold',
    marginTop: 8,
  },
  footer: {
    backgroundColor: BLUE,
    padding: 11,
    alignItems: 'center',
  },
  footerTitle: {
    color: GOLD,
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  footerText: {
    color: '#FFFFFF',
    fontSize: 9,
    marginTop: 4,
  },
});
