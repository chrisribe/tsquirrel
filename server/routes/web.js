const express = require('express');
const router = express.Router();

const checkPageExists = require('../middleware/checkPageExists'); // Adjust the path as needed

// Events route with initial dummy data
// example only for now.
router.get('/events', (req, res) => {
    res.render('layout-main', { 
    pageName: 'events-page', 
    pageData: { 
      events: [{ 
        title: 'Event 1', 
        description: 'This is the first event', 
        date: '2021-01-01', 
        time: '12:00:00',
        location: 'Location 1',
        event_picture: 'https://picsum.photos/200',
      }] 
    } 
  });
});

// Use the checkPageExists function for all routes
// Example url name /about-us should have a corresponding 
// about-us-page.ejs file in the views folder
router.get('/*', checkPageExists);

module.exports = router;