const express = require('express');
const axios = require('axios');
const app = express();
const backendURL = 'http://localhost:3000';

app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true}));

// api page main
app.get('/', (req, res) => {
    res.redirect('/car');
});

//======= API REPORT =======
app.get('/report', async (req, res) => {
    try {
        const response = await axios.get(`${backendURL}/report/sold-cars`);
        const reports = response.data.reports || [];
        const summary = response.data.summary || {
            totalCarModels: 0,
            totalStock: 0,
            totalSoldCars: 0,
            totalSalesAmount: 0
        };
        res.render('report/report', {
            reports,
            summary,
            activePage: 'report'
        });
    } catch (err){
        res.status(500).json({error: 'Failed to fetching report'});
    }
});

//======= API SALE =======
// get all sale history
app.get('/sale', async (req, res) => {
    try {
        const response = await axios.get(`${backendURL}/sale`);
        const sales = response.data;
        res.render('sale/sale', {
            sales,
            activePage: 'sale'
        });
    } catch (err){
        res.status(500).json({error: 'Failed to fetching sale history'});
    }
});

// api get add sale page
app.get('/sale/add', async (req, res) => {
    try {
        // ดึงข้อมูลลูกค้าและรถยนต์พร้อมกัน
        const [customerRes, carRes] = await Promise.all([ 
            axios.get(`${backendURL}/customer`),
            axios.get(`${backendURL}/car`)
        ]);

        const customers = customerRes.data; // ดึงข้อมูลลูกค้า
        const cars = carRes.data.filter(car => car.stock > 0); // ดึงข้อมูลรถยนต์ที่มี stock > 0 เท่านั้น
        const selectedCustomerId = req.query.customer_id || ''; // ดึง customer_id จาก query string (ถ้ามี)
        const selectedBrand = req.query.brand || ''; // ดึง brand ที่เลือกจาก query string (ถ้ามี)
        const selectedCarId = req.query.car_id || ''; // ดึง car_id ที่เลือกจาก query string (ถ้ามี)

        const brands = [...new Set(cars.map(car => car.brand))]; // สร้างรายการแบรนด์ที่ไม่ซ้ำกันจากรถยนต์ที่มี stock > 0
        const models = selectedBrand ? cars.filter(car => car.brand === selectedBrand) : cars; // ถ้าไม่เลือกแบรนด์ ให้แสดงรถทั้งหมดสำหรับการเลือกครั้งเดียว
        const selectedCar = selectedCarId  // ค้นหารถยนต์ที่ถูกเลือกจาก car_id (ถ้ามี)
            ? cars.find(car => String(car.id) === String(selectedCarId)) // เปรียบเทียบเป็น string เพื่อความแน่นอนในการเปรียบเทียบ ID
            : null;

        res.render('sale/add-sale', {
            customers,
            brands,
            models,
            selectedCustomerId,
            selectedBrand,
            selectedCarId,
            selectedCar,
            activePage: 'sale'
        });
    } catch (err){
        res.status(500).json({error: 'Error render add sale'});
    }
});

// api post add sale
app.post('/sale/add', async (req, res) => {
    try {
        const {car_id, customer_id} = req.body;

        if(!car_id || !customer_id){
            return res.status(400).json({error: 'Customer and model are required.'});
        }

        await axios.post(`${backendURL}/sale/add`, {car_id, customer_id});
        res.redirect('/sale');
    } catch (err){
        console.error('Error create sale:', err.response?.data || err.message);
        res.status(500).json({error: err.response?.data?.error || 'Error create sale'});
    }
});

// api get edit sale page
app.get('/sale/edit/:id', async (req, res) => {
    try {
        const saleID = req.params.id;
        const response = await axios.get(`${backendURL}/sale/${saleID}`);
        const sale = response.data;
        res.render('sale/edit-sale', {
            sale,
            activePage: 'sale'
        });
    } catch (err){
        res.status(500).json({error: 'Failed to fetching sale'});
    }
});

// api post edit sale price
app.post('/sale/edit/:id', async (req, res) => {
    try {
        const saleID = req.params.id;
        const {sale_price} = req.body;
        await axios.put(`${backendURL}/sale/${saleID}`, {sale_price});
        res.redirect('/sale');
    } catch (err){
        console.error('Error updating sale:', err.response?.data || err.message);
        res.status(500).json({error: err.response?.data?.error || 'Error updating sale'});
    }
});

// api delete sale and restore stock
app.get('/sale/delete/:id', async (req, res) => {
    try {
        const saleID = req.params.id;
        await axios.delete(`${backendURL}/sale/${saleID}`);
        res.redirect('/sale');
    } catch (err){
        console.error('Error deleting sale:', err.response?.data || err.message);
        res.status(500).json({error: err.response?.data?.error || 'Error deleting sale'});
    }
});

//======= API CAR =======
// get all car
app.get('/car', async (req, res) => {
    try {
        const response = await axios.get(`${backendURL}/car`);
        const cars = response.data
        res.render('car/cars', {
            cars,
            activePage: 'car'
        });
    } catch (err){
        res.status(500).json({error: 'Failed to fetching car'});
    }
});

// api get edit car
app.get('/car/edit/:id', async (req, res) => {
    try {
        const carID = req.params.id;
        const response = await axios.get(`${backendURL}/car/${carID}`);
        const car = response.data
        res.render('car/edit-car', {
            car,
            activePage: 'car'
        });
    } catch (err){
        res.status(500).json({error: 'Failed to fetching car'});
    }
});

// api post edit car
app.post('/car/edit/:id', async (req, res) => {
    try {
        const carID = req.params.id;
        const {brand, model, price, stock} = req.body
        const response = await axios.put(`${backendURL}/car/${carID}`, {brand, model, price, stock});
        res.redirect('/car');
    } catch (err){
        console.error('Error updating car:', err);
        res.status(500).json({error: 'Error updating car'});
    }
});

// api add car
app.get('/car/add', async (req, res) => {
    try {
        res.render('car/add-car',{
            activePage: 'car'
        });
    } catch (err){
        res.status(500).json({error: 'Error render add car'});
    }
});
app.post('/car/add', async (req, res) => {
    try {
        const {brand, model, price, stock} = req.body
        await axios.post(`${backendURL}/car/add`, {brand, model, price, stock});
        res.redirect('/car');
    } catch (err){
        console.error('Error create car:', err);
        res.status(500).json({error: 'Error create car'});
    }
});

// api delete car
app.get('/car/delete/:id', async (req, res) => {
    try {
        const carID = req.params.id;
        await axios.delete(`${backendURL}/car/${carID}`);
        res.redirect('/car');
    } catch (err){
        console.error('Error deleting car:', err);
        res.status(500).json({error: 'Error deleting car'});
    }
});


//======= API CUSTOMER =======
// get all customer
app.get('/customer', async (req, res) => {
    try {
        const response = await axios.get(`${backendURL}/customer`);
        const customers = response.data;
        res.render('customer/customer', {
            customers,
            activePage: 'customer'
        });
    } catch (err){
        res.status(500).json({error: 'Failed to fetching customer'});
    }
});

// api get add customer
app.get('/customer/add', async (req, res) => {
    try {
        res.render('customer/add-cus', {
            activePage: 'customer'
        });
    } catch (err){
        res.status(500).json({error: 'Error render add customer'});
    }
});

// api post add customer
app.post('/customer/add', async (req, res) => {
    try {
        const {name, phone} = req.body;
        await axios.post(`${backendURL}/customer/add`, {name, phone});
        res.redirect('/customer');
    } catch (err){
        console.error('Error create customer:', err);
        res.status(500).json({error: 'Error create customer'});
    }
});

// api get edit customer
app.get('/customer/edit/:id', async (req, res) => {
    try {
        const customerID = req.params.id;
        const response = await axios.get(`${backendURL}/customer/${customerID}`);
        const customer = response.data;
        res.render('customer/edit-cus', {
            customer,
            activePage: 'customer'
        });
    } catch (err){
        res.status(500).json({error: 'Failed to fetching customer'});
    }
});

// api post edit customer
app.post('/customer/edit/:id', async (req, res) => {
    try {
        const customerID = req.params.id;
        const {name, phone} = req.body;
        await axios.put(`${backendURL}/customer/${customerID}`, {name, phone});
        res.redirect('/customer');
    } catch (err){
        console.error('Error updating customer:', err);
        res.status(500).json({error: 'Error updating customer'});
    }
});

// api delete customer
app.get('/customer/delete/:id', async (req, res) => {
    try {
        const customerID = req.params.id;
        await axios.delete(`${backendURL}/customer/${customerID}`);
        res.redirect('/customer');
    } catch (err){
        console.error('Error deleting customer:', err);
        res.status(500).json({error: 'Error deleting customer'});
    }
});





// Begin server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server Frontend is running on port http://localhost:${PORT}`);
});