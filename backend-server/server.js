const express = require('express');
const morgan  = require('morgan');
const bodyParser = require('body-parser');
const cors = require('cors');


const app = express();
app.use(cors());

// Server port and bind address
// The API is reached by the browser through the Vite proxy on 127.0.0.1:3333.
// It still binds to every interface so the API also answers direct LAN calls.
const HTTP_PORT = Number(process.env.PORT) || 3333;
const HTTP_HOST = process.env.HOST || '0.0.0.0';

// Start server
app.listen(HTTP_PORT, HTTP_HOST, () => {
    console.log(`Server running on http://${HTTP_HOST}:${HTTP_PORT}`);
});

// Logging
app.use(morgan('tiny'));

// Body parser
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// Root endpoint
app.get('/', (req, res, next) => {
    res.json({'status': 'Alive'});
});

// Other API endpoints: Links go here...
// You can uncomment the below three lines as you implement the functionality - we'll discuss this structure in week three.
require('./app/routes/user.server.routes')(app);
require('./app/routes/core.server.routes')(app);
require('./app/routes/question.server.routes')(app);


// Default response for any other request
app.use((req, res) => {
    res.sendStatus(404);
});