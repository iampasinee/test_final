
// ====== model & seed file ====

const express = require('express');
const Sequelize = require('sequelize');
const app = express();
const seed_data = require('./seed.json');

app.use(express.json());

// create database
const sequelize = new Sequelize("database","usersname","password", {
    host: 'localhost',
    dialect: 'sqlite',
    storage: './database/SQcar.sqlite'
});

// create table customers
const Customers = sequelize.define('customers', {
    id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
    name: {
        type: Sequelize.STRING,
        allowNull: false
    },
    phone: {
        type: Sequelize.STRING,
        allowNull: false
    }
});

// create table cars
const Cars = sequelize.define('cars', {
    id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
    brand: {
        type: Sequelize.STRING,
        allowNull: false
    },
    model: {
        type: Sequelize.STRING,
        allowNull: false
    },
    price: {
        type: Sequelize.DOUBLE,
        allowNull: false
    },
    stock: {
        type: Sequelize.INTEGER,
        defaultValue: 0
    }
});

// create table sales
const Sales = sequelize.define('sales', {
    id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
    sale_price: {
        type: Sequelize.DOUBLE,
        allowNull: false
    },
    sale_date: {
        type: Sequelize.DATE,
        allowNull: false
    },
    car_id: {
        type: Sequelize.INTEGER,
        allowNull: false
    },
    customer_id: {
        type: Sequelize.INTEGER,
        allowNull: false
    }
});

// define associations
Customers.hasMany(Sales, {foreignKey: 'customer_id'});
Sales.belongsTo(Customers, {foreignKey: 'customer_id'});

Cars.hasMany(Sales, {foreignKey: 'car_id'});
Sales.belongsTo(Cars, {foreignKey: 'car_id'});

// function transform file JSON 
function transformData(data){
    return {
        customers: data.customers.map(cus => ({
            id: cus.id,
            name: cus.name,
            phone: cus.phone
        })),
        cars: data.cars.map(item => ({
            id: item.id,
            brand: item.brand,
            model: item.model,
            price: item.price,
            stock: item.stock
        })),
        sales: data.sales.map(item => ({
            id: item.id,
            sale_price: item.sale_price,
            sale_date: item.sale_date,
            car_id: item.car_id,
            customer_id: item.customer_id
        }))
    }
}

// function dump file to database
function seedData(data){
    const newData = transformData(data);
    return Promise.all([
        Customers.bulkCreate(newData.customers),
        Cars.bulkCreate(newData.cars),
        Sales.bulkCreate(newData.sales)
    ]);
}

// sync database
sequelize.sync().then(async () => {
    console.log('Database Create Success!')

    const cusCount = await Customers.count();
    const carCount = await Cars.count();
    const saleCount = await Sales.count();

    //dump seed file to database
    if(!cusCount && !carCount && !saleCount){
        await seedData(seed_data).then(() => {
            console.log('Database Seeds Success!');
        }).catch(err => {
            console.error('Failed to seeds database:', err);
        })
    }
}).catch(err => {
    console.error('Unable to connect database:', err);
});


// API main
app.get('/', (req, res) => {
    try{
        res.send('Wlcome to the car sale')
    } catch (err){
        res.status(500).json({error: 'Failed to retrieve data'});
    }
});


// === report api ====
// sold cars grouped by brand and model
app.get('/report/sold-cars', async (req, res) => {
    try {
        const [
            totalCarModels,
            totalStock,
            totalSoldCars,
            totalSalesAmount,
            reportRows
        ] = await Promise.all([
            Cars.count(),
            Cars.sum('stock'),
            Sales.count(),
            Sales.sum('sale_price'),
            sequelize.query(`
                SELECT c.brand, c.model, COUNT(s.id) AS sold_count
                FROM sales s
                INNER JOIN cars c ON c.id = s.car_id
                GROUP BY c.brand, c.model
                ORDER BY sold_count DESC, c.brand ASC, c.model ASC
            `, { type: Sequelize.QueryTypes.SELECT })
        ]);

        res.json({
            summary: {
                totalCarModels: totalCarModels || 0,
                totalStock: totalStock || 0,
                totalSoldCars: totalSoldCars || 0,
                totalSalesAmount: totalSalesAmount || 0
            },
            reports: reportRows
        });
    } catch (err) {
        res.status(500).json({error: 'Failed to generate sales report.'});
    }
});


// === manage api sale ====
// get all sales with customer and car details
app.get('/sale', async (req, res) => {
    try {
        const sales = await Sales.findAll({
            include: [
                {
                    model: Customers,
                    attributes: ['id', 'name', 'phone']
                },
                {
                    model: Cars,
                    attributes: ['id', 'brand', 'model', 'price']
                }
            ],
            order: [['sale_date', 'DESC']]
        });
        res.json(sales);
    } catch (err) {
        res.status(500).json({error: 'Failed to retrieve sales.'});
    }
});

// get sale by id
app.get('/sale/:id', async (req, res) => {
    try {
        const {id} = req.params;
        const sale = await Sales.findByPk(id, {
            include: [
                {
                    model: Customers,
                    attributes: ['id', 'name', 'phone']
                },
                {
                    model: Cars,
                    attributes: ['id', 'brand', 'model', 'price']
                }
            ]
        });

        if(sale){
            res.json(sale);
        }else {
            res.status(404).json({error: 'Sale not found.'});
        }
    } catch (err) {
        res.status(500).json({error: 'Failed to retrieve sale.'});
    }
});

// create sale and decrease car stock by 1
app.post('/sale/add', async (req, res) => {
    try {
        const {car_id, customer_id} = req.body;

        const createdSale = await sequelize.transaction(async (t) => {
            const car = await Cars.findByPk(car_id, {transaction: t});
            if(!car){
                throw new Error('CAR_NOT_FOUND');
            }

            if(car.stock <= 0){
                throw new Error('OUT_OF_STOCK');
            }

            const customer = await Customers.findByPk(customer_id, {transaction: t});
            if(!customer){
                throw new Error('CUSTOMER_NOT_FOUND');
            }

            car.stock = car.stock - 1;
            await car.save({transaction: t});

            const sale = await Sales.create({
                sale_price: car.price,
                sale_date: new Date(),
                car_id,
                customer_id
            }, {transaction: t});

            return sale;
        });

        res.status(201).json(createdSale);
    } catch (err) {
        if(err.message === 'CAR_NOT_FOUND'){
            return res.status(404).json({error: 'Car not found.'});
        }
        if(err.message === 'CUSTOMER_NOT_FOUND'){
            return res.status(404).json({error: 'Customer not found.'});
        }
        if(err.message === 'OUT_OF_STOCK'){
            return res.status(400).json({error: 'Selected car is out of stock.'});
        }
        res.status(500).json({error: 'Failed to create sale.'});
    }
});

// update only sale price
app.put('/sale/:id', async (req, res) => {
    try {
        const {id} = req.params;
        const {sale_price} = req.body;

        const sale = await Sales.findByPk(id);
        if(!sale){
            return res.status(404).json({error: 'Sale not found.'});
        }

        sale.sale_price = sale_price;
        await sale.save();

        res.json(sale);
    } catch (err) {
        res.status(500).json({error: 'Failed to update sale.'});
    }
});

// delete sale and restore car stock by 1
app.delete('/sale/:id', async (req, res) => {
    try {
        const {id} = req.params;

        await sequelize.transaction(async (t) => {
            const sale = await Sales.findByPk(id, {transaction: t});
            if(!sale){
                throw new Error('SALE_NOT_FOUND');
            }

            const car = await Cars.findByPk(sale.car_id, {transaction: t});
            if(car){
                car.stock = car.stock + 1;
                await car.save({transaction: t});
            }

            await sale.destroy({transaction: t});
        });

        res.json({message: 'Sale cancelled and stock restored successfully.'});
    } catch (err) {
        if(err.message === 'SALE_NOT_FOUND'){
            return res.status(404).json({error: 'Sale not found.'});
        }
        res.status(500).json({error: 'Failed to delete sale.'});
    }
});


// === manage api customer ====
// get all customer
app.get('/customer', async (req, res) => {
    try {
        const customers = await Customers.findAll();
        res.json(customers);
    } catch (err) {
        res.status(500).json({error: 'Failed to retrieve customer'});
    }
});

// get customer id
app.get('/customer/:id', async (req, res) => {
    try {
        const {id} = req.params;
        const customer = await Customers.findByPk(id);
        if(customer){
            res.json(customer);
        }else {
            res.status(404).json({error: 'Customer not found.'});
        }
    } catch (err) {
        res.status(500).json({error: 'Failed to retrieve customer.'});
    }
});

// post create customer
app.post('/customer/add', async (req, res) => {
    try {
        const {name, phone} = req.body;
        const customer = await Customers.create({name, phone});
        res.status(201).json(customer);
    } catch (err) {
        res.status(500).json({error: 'Failed to create customer.'});
    }
});

// put edit customer
app.put('/customer/:id', async (req, res) => {
    try {
        const {id} = req.params;
        const {name, phone} = req.body;
        const customer = await Customers.findByPk(id);
        if(customer){
            customer.name = name;
            customer.phone = phone;
            await customer.save();
            res.json(customer);
        }else {
            res.status(404).json({error: 'Customer not found.'});
        }
    } catch (err) {
        res.status(500).json({error: 'Failed to update customer.'});
    }
});

// delete customer
app.delete('/customer/:id', async (req, res) => {
    try {
        const {id} = req.params;
        const customer = await Customers.findByPk(id);
        if(customer){
            await sequelize.transaction(async (t) => {
                await Sales.destroy({
                    where: { customer_id: id },
                    transaction: t
                });
                await customer.destroy({ transaction: t });
            });
            res.json({message: 'Customer and related sales deleted successfully.'});
        }else {
            res.status(404).json({error: 'Customer not found.'});
        }
    } catch (err) {
        res.status(500).json({error: 'Failed to delete customer.'});
    }
});


// === manage api car ====
// get all car
app.get('/car', async (req, res) => {
    try {
        const cars = await Cars.findAll();
        res.json(cars);
    } catch (err) {
        res.status(500).json({error: 'Failed to retrieve car'});
    }
});

// get car id
app.get('/car/:id', async (req, res) => {
    try {
        const {id} = req.params;
        const car = await Cars.findByPk(id);
        if(car){
            res.json(car);
        }else {
            res.status(404).json({error: 'Car not found.'});
        }
    } catch (err) {
        res.status(500).json({error: 'Failed to retrieve car.'});
    }
});

// put edit car 
app.put('/car/:id', async (req, res) => {
    try {
        const {id} = req.params;
        const {brand, model, price, stock} = req.body
        const car = await Cars.findByPk(id);
        if(car){
            car.brand = brand;
            car.model = model;
            car.price = price;
            car.stock = stock;
            await car.save();
            res.json(car);
        }else {
            res.status(404).json({error: 'Car not found.'});
        }
    } catch (err) {
        res.status(500).json({error: 'Failed to update book.'});
    }
});

// post create car 
app.post('/car/add', async (req, res) => {
    try {
        const {brand, model, price, stock} = req.body
        const car = await Cars.create({brand, model, price, stock});
        res.status(201).json(car);
    } catch (err) {
        res.status(500).json({error: 'Failed to create book.'});
    }
});

// delete car
app.delete('/car/:id', async (req, res) => {
    try {
        const {id} = req.params;
        const car = await Cars.findByPk(id);
        if(car){
            await sequelize.transaction(async (t) => {
                await Sales.destroy({
                    where: { car_id: id },
                    transaction: t
                });
                await car.destroy({ transaction: t });
            });
            res.json({message: 'Car and related sales deleted successfully.'});
        }else {
            res.status(404).json({error: 'Car not found.'});
        }
    } catch (err) {
        res.status(500).json({error: 'Failed to delete car.'});
    }
});


// Begin server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server Backend is running on port http://localhost:${PORT}`);
});