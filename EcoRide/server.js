const express = require('express');
const mysql = require('mysql2');
const bodyParser = require('body-parser');
const dotenv = require('dotenv');
var bcrypt = require('bcrypt');
const path = require('path');
const { kMaxLength } = require('buffer');


dotenv.config();


const app = express();
app.set('view engine', 'ejs');

app.set('views', path.join(__dirname, 'views'));

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static('public'));

const connection = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});
  
connection.connect((err) => {
  if (err) {
    console.error("Database connection failed:", err.stack);
    return;
  }
  console.log("Connected to GCP SQL database.");
});

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.render('index'); 
});

app.get('/login', (req, res) => {
  res.render('login')
});

app.get('/register', (req, res) => {
  res.render('register')
});

app.post('/register', function(req, res) {
    const { name, email, contact, password } = req.body;

    bcrypt.hash(password, 10, function(err, hash) {
        if (err) {
            res.status(500).send({ message: 'Error hashing password' });
            return;
        }

        const sql = 'SELECT MAX(userId) AS lastUserId FROM User';
        connection.query(sql, function(err, result) {
            if (err) {
                res.status(500).send({ message: 'Error fetching last user_id', error: err });
                return;
            }

            const lastUserId = result[0].lastUserId || 0;
            const newUserId = lastUserId + 1;

            const insertSql = `INSERT INTO User (userId, name, email, contact, password) VALUES (?, ?, ?, ?, ?)`;
            connection.query(insertSql, [newUserId, name, email,contact, hash], function(err, result) {
                if (err) {
                    res.status(500).send({ message: 'Error registering user', error: err });
                    return;
                }
                res.redirect(`/${name}/manage`);
            });
        });
    });
});


app.post('/login', function (req, res) {
    const { username, password } = req.body;

    const sql = 'SELECT * FROM User WHERE name = ?';
    connection.query(sql, [username], function (err, results) {
        if (err) {
            res.status(500).send({ message: 'Error fetching user data', error: err });
            return;
        }

        if (results.length === 0) {
            res.status(401).send({ message: 'Invalid username or password' });
            return;
        }

        const user = results[0];
        bcrypt.compare(password, user.password, function (err, isMatch) {
            if (err) {
                res.status(500).send({ message: 'Error comparing passwords' });
                return;
            }

            if (!isMatch) {
                res.status(401).send({ message: 'Invalid username or password' });
                return;
            }

            res.redirect(`/${username}/checkRole`);
        });
    });
});

app.get('/:username/checkRole', (req, res) => {
  const username = req.params.username;

  const getUserIdQuery = 'SELECT userId FROM User WHERE name = ?';

  connection.query(getUserIdQuery, [username], (err, results) => {
    if (err) {
      console.error('Error fetching user ID:', err);
      return res.status(500).send('Error fetching user ID');
    }

    if (results.length === 0) {
      return res.status(404).send('User not found');
    }

    const userId = results[0].userId; 

    const checkUserRoleQuery = 'SELECT role FROM UserRoles WHERE userId = ?';

    connection.query(checkUserRoleQuery, [userId], (err, roleResults) => {
      if (err) {
        console.error('Error checking user role:', err);
        return res.status(500).send('Error checking user role');
      }
      console.log(roleResults)
      console.log(roleResults.length)
      if (roleResults.length > 0) {
        // res.render('')
        res.redirect(`/${username}/${roleResults[0].role}/profile?param=${roleResults.length}`);
      }else{
        res.redirect(`/${username}/manage`)
      }
    });
  });
});


app.get("/:username/manage", (req,res)=>{
  const username = req.params
  res.render('manage',username)
})

// can be updated in future with the param value 
app.get('/:username/addRole', (req, res) => {
  console.log("Reached ADD role")
  const { username } = req.params;
  const { role } = req.query;  
  console.log(role)
  console.log(typeof(role))
  if (role !== 'buyer' && role !== 'seller') {
    return res.status(400).send('Invalid role');
  }
  const getUserIdQuery = 'SELECT userId FROM User WHERE name = ?';
  connection.query(getUserIdQuery, [username], (err, results) => {
    if (err) {
      console.error('Error fetching user ID:', err);
      return res.status(500).send('Error fetching user ID');
    }

    if (results.length === 0) {
      return res.status(404).send('User not found');
    }

    const userId = results[0].userId; 
    console.log("Inside add role",userId)
    
    const getLatestUserRoleIdQuery = 'SELECT MAX(userRoleId) AS latestUserRoleID FROM UserRoles';
    // connection.query(getUserIdQuery, [username], (err, results) => {
    

      connection.query(getLatestUserRoleIdQuery, (err, result) => {
        if (err) {
          console.error('Error fetching latest UserRoleID:', err);
          return res.status(500).send('Error fetching latest UserRoleID');
        }
  
        const latestUserRoleID = result[0].latestUserRoleID || 0; // Get the latest UserRoleID, default to 0 if empty
        const newUserRoleID = latestUserRoleID + 1; // Increment the UserRoleID
  
        // Query to insert or update the role in the UserRoles table with the new UserRoleID
        const updateRoleQuery = `
          INSERT INTO UserRoles (userRoleID, userId, role) 
          VALUES (?, ?, ?);
        `;
        connection.query(updateRoleQuery, [newUserRoleID , userId, role], function(err, result) {
          if (err) {
              res.status(500).send({ message: 'Error registering user', error: err });
              return;
          }
          console.log(username)
          console.log(role)
          res.redirect(`/${username}/${role}/profile`);
      });
  
      });
  });
});


app.get('/:username/cars/book', (req, res) => {
  const searchTerm = req.query.search || ''; 
  const sql = `
      SELECT * FROM Car 
      WHERE availability=true
      AND (carModel LIKE ? OR carCompany LIKE ?)
  `;

  connection.query(sql, [`%${searchTerm}%`, `%${searchTerm}%`], (err, results) => {
    if (err) {
      res.status(500).send({ message: 'Error fetching car data', error: err });
      return;
    }

    res.render('buyer', {
      username: req.params.username, 
      searchTerm: searchTerm,
      cars: results
    });
  });
});

app.get('/:username/car/:carId/book', (req, res) => {
  const { username, carId } = req.params;

  // Fetch car details based on carId
  const getCarQuery = 'SELECT * FROM Car WHERE carId = ?'; // Adjust table name as needed
  connection.query(getCarQuery, [carId], (err, result) => {
    if (err || result.length === 0) {
      res.status(500).send('Error fetching car details');
      return;
    }

    res.render('book-car', { username, car: result[0] });
  });
});

app.post('/:username/car/:carId/book/confirm', (req, res) => {
  const { hours } = req.body;
  const { username, carId } = req.params;
  const startTime = new Date();
  const endTime = new Date(startTime.getTime() + hours * 60 * 60 * 1000);
  console.log("Confirm TT",endTime)

  const getUserIdQuery = 'SELECT userId FROM User WHERE name = ?';

  const getMileageQuery = 'SELECT mileage FROM Car WHERE carId = ?';

  const getMaxBookingIdQuery = 'SELECT MAX(bookingId) AS maxId FROM Booking';

  connection.query(getUserIdQuery, [username], (err, userResult) => {
    if (err || userResult.length === 0) {
      return res.status(500).send({ message: 'Error fetching user ID or user not found', error: err });
    }
    const userId = userResult[0].userId;

    connection.query(getMileageQuery, [carId], (err, carResult) => {
      if (err || carResult.length === 0) {
        return res.status(500).send({ message: 'Error fetching car mileage or car not found', error: err });
      }

      const startMileage = carResult[0].mileage;

      connection.query(getMaxBookingIdQuery, (err, result) => {
        if (err) {
          return res.status(500).send({ message: 'Error fetching booking ID', error: err });
        }

      const nextBookingId = (result[0].maxId || 0) + 1;

      const insertQuery = `
        INSERT INTO Booking (bookingId, carId, userId, startDate, endDate, startMileage, endMileage)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `;

      connection.query(
        insertQuery,
        [nextBookingId, carId, userId, startTime, endTime, startMileage, startMileage, hours],
        (err, result) => {
          if (err) {
            return res.status(500).send({ message: 'Error inserting booking', error: err });
          }
          const updateAvailability = `UPDATE Car SET availability=false where carId = ?`
          connection.query(updateAvailability, [carId], (updateErr, updateResult) => {
            if (updateErr) {
              console.error("Error updating car availability:", updateErr);
              return res.status(500).send({ message: "Error updating car availability", error: updateErr });
            }
          });


          const checkUserRoleQuery = 'SELECT role FROM UserRoles WHERE userId = ?';

          connection.query(checkUserRoleQuery, [userId], (err, roleResults) => {
            if (err) {
              console.error('Error checking user role:', err);
              return res.status(500).send('Error checking user role');
            }
            if (roleResults.length > 0) {
              res.redirect(`/${username}/${roleResults[0].role}/profile?param=${roleResults.length}`);
            }
          });
        });
      });
    });
  });
});

  

app.get('/:username/seller/add-car', (req, res) => {
  const { username } = req.params;
  res.render('add-car', { username });
});
  
  
app.post('/:username/seller/add-car', (req, res) => {
  console.log("Seller has started adding car")
  const { carModel, mileage, price, availability, carCompany } = req.body; 
  const { username } = req.params; 
  var availabilityBool = availability.toLowerCase() === "true";
  const getLastCarId = 'SELECT MAX(carId) AS lastCarId FROM Car';
  
  const getUserId = 'SELECT userId FROM User WHERE name = ?';
  
  const insertCar = `
    INSERT INTO Car (carId, userId, price, mileage, availability, carCompany, carModel)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `;
  
    
  connection.query(getLastCarId, (err, result) => {
    if (err) {
      res.status(500).send({ message: 'Error fetching last carId', error: err });
      return;
    }

    const newCarId = (result[0].lastCarId || 0) + 1; 

    connection.query(getUserId, [username], (err, userResult) => {
      if (err) {
        res.status(500).send({ message: 'Error fetching userId', error: err });
        return;
      }

      if (userResult.length === 0) {
        res.status(400).send({ message: 'User not found' });
        return;
      }

      const userId = userResult[0].userId;

      connection.query(
        insertCar,
        [newCarId, userId, price, mileage, availabilityBool, carCompany, carModel],
        (err, insertResult) => {
          if (err) {
            res.status(500).send({ message: 'Error adding car to the database', error: err });
            return;
          }

          const checkUserRoleQuery = 'SELECT role FROM UserRoles WHERE userId = ?';

          connection.query(checkUserRoleQuery, [userId], (err, roleResults) => {
            if (err) {
              console.error('Error checking user role:', err);
              return res.status(500).send('Error checking user role');
            }
            
              if (roleResults.length > 0) {
              res.redirect(`/${username}/seller/profile?param=${roleResults.length}`);
              }
          });
        }
      );
    });
  });
});  


app.get('/:username/:role/profile', (req, res) => {
  const { username, role } = req.params; 
  const { param } = req.query;  
  const getUserDetails = 'SELECT userId, name, email FROM User WHERE name = ?';
  
  const getUserCars = 'SELECT * FROM Car WHERE userId = (SELECT userId FROM User WHERE name = ?)';

  connection.query(getUserDetails, [username], (err, userResult) => {
    if (err || userResult.length === 0) {
      res.status(500).send({ message: 'Error fetching user details or user not found', error: err });
      return;
    }
    const user = userResult[0];
    console.log(user)

    connection.query(getUserCars, [username], (err, carResults) => {
      if (err) {
        res.status(500).send({ message: 'Error fetching user cars', error: err });
        return;
      }
      console.log("HIIII", username)
      console.log("HIIII", user)
      console.log("HIIII", carResults)
      const getBookingsQuery = `
        SELECT b.startDate, b.endDate,b.endMileage, c.carModel, c.carCompany, c.price
        FROM Booking b
        INNER JOIN Car c ON b.carId = c.carId
        INNER JOIN User u ON b.userId = u.userId
        WHERE u.userId = ?
      `;

      connection.query(getBookingsQuery, [user.userId], (bookingErr, bookingResults) => {
        if (bookingErr) {
          res.status(500).send({ message: 'Error fetching bookings', error: bookingErr });
          return;
        }
        res.render('profile', { username, user, cars: carResults, role, param, bookingResults});
      });
    });
  });
});

      // const getBookingsQuery = `
      //   SELECT b.startDate, b.endDate,b.endMileage, c.carModel, c.carCompany, c.price
      //   FROM Booking b
      //   INNER JOIN Car c ON b.carId = c.carId
      //   INNER JOIN User u ON b.userId = u.userId
      //   WHERE u.userId = ?
      // `;

      // connection.query(getBookingsQuery, [user.userId], (bookingErr, bookingResults) => {
      //   if (bookingErr) {
      //     res.status(500).send({ message: 'Error fetching bookings', error: bookingErr });
      //     return;
      //   }
      //   console.log("Booking data",bookingResults)

        
      // });
      

  

app.post('/:username/seller/:carId/delete', (req, res) => {
  const { username, carId } = req.params;
  console.log("inside post request to delete",carId)
  // Query to delete the car based on carId
  const deleteCarQuery = 'DELETE FROM Car WHERE carId = ?';

  connection.query(deleteCarQuery, [carId], (err, result) => {
    if (err) {
      res.status(500).send({ message: 'Error deleting car', error: err });
      return;
    }
    const getUserIdQuery = 'SELECT userId FROM User WHERE name = ?';

    connection.query(getUserIdQuery, [username], (err, results) => {
      if (err) {
        console.error('Error fetching user ID:', err);
        return res.status(500).send('Error fetching user ID');
      }

      if (results.length === 0) {
        return res.status(404).send('User not found');
      }

      const userId = results[0].userId;

      const checkUserRoleQuery = 'SELECT role FROM UserRoles WHERE userId = ?';

      connection.query(checkUserRoleQuery, [userId], (err, roleResults) => {
        if (err) {
          console.error('Error checking user role:', err);
          return res.status(500).send('Error checking user role');
        }
      
        if (roleResults.length > 0) {
        res.redirect(`/${username}/seller/profile?param=${roleResults.length}`);
        }
      });
    });
  });
});
  
app.get('/:username/car/:carId/edit', (req, res) => {
  
  console.log("i'm inside edit car")
  const { username, carId } = req.params;

  const getCarQuery = 'SELECT carModel, carCompany, mileage, price, availability FROM Car WHERE carId = ?';

  connection.query(getCarQuery, [carId], (err, results) => {
    if (err) {
      res.status(500).send({ message: 'Error fetching car details', error: err });
      return;
    }
    if (results.length === 0) {
      res.status(404).send({ message: 'Car not found' });
      return;
    }
    const car = results[0]; 
    res.render('edit-car', { 
      username, 
      carId, 
      carModel: car.carModel, 
      carCompany: car.carCompany, 
      mileage: car.mileage, 
      price: car.price, 
      availability: car.availability 
    });
  });
});

app.post('/:username/car/:carId/edit', (req, res) => {
  const { username, carId } = req.params;
  const { carModel, carCompany, mileage, price, availability } = req.body;

  const updateCarQuery = `
    UPDATE Car
    SET carModel = ?, carCompany = ?, mileage = ?, price = ?, availability = ?
    WHERE carId = ?
  `;

  connection.query(
    updateCarQuery, 
    [carModel, carCompany, mileage, price, availability, carId],
    (err, results) => {
      if (err) {
        res.status(500).send({ message: 'Error updating car details', error: err });
        return;
      }

      if (results.affectedRows === 0) {
        res.status(404).send({ message: 'Car not found' });
        return;
      }

      const getUserIdQuery = 'SELECT userId FROM User WHERE name = ?';

      connection.query(getUserIdQuery, [username], (err, results) => {
        if (err) {
          console.error('Error fetching user ID:', err);
          return res.status(500).send('Error fetching user ID');
        }

        if (results.length === 0) {
          return res.status(404).send('User not found');
        }

        const userId = results[0].userId;

        const checkUserRoleQuery = 'SELECT role FROM UserRoles WHERE userId = ?';

        connection.query(checkUserRoleQuery, [userId], (err, roleResults) => {
          if (err) {
            console.error('Error checking user role:', err);
            return res.status(500).send('Error checking user role');
          }
        
          if (roleResults.length > 0) {
          res.redirect(`/${username}/seller/profile?param=${roleResults.length}`);
          }
        });
      });
    }
  );
});
  
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

