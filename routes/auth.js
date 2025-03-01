const express = require('express');
const router = express.Router();
const { registerUser, loginUser, verify, logout } = require('../controllers/authController.js');

router.post('/register', registerUser);
router.post('/login', loginUser);
router.get('/verify', verify);
router.delete('/logout', logout);

module.exports = router;
