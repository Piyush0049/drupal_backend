const express = require('express');
const router = express.Router();
const { registerUser, loginUser, verify, logout, otpVerification, resentOtp } = require('../controllers/authController.js');

router.post('/register', registerUser);
router.post('/login', loginUser);
router.get('/verify', verify);
router.post('/verifyOTP', otpVerification)
router.post('/resentOtp', resentOtp)
router.delete('/logout', logout);

module.exports = router;
