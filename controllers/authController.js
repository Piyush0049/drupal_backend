const jwt = require("jsonwebtoken")
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const { generateOTP } = require('../utils/generateOTP');
const { sendMail } = require('../utils/sendMail');
const drupalBaseUrl = process.env.DRUPAL_BASE_URL;
const drupalAuthUsersNodeId = process.env.DRUPAL_AUTH_NODE_ID;
const drupalAuthOTPNodeId = process.env.DRUPAL_OTP_NODE_ID;


const fetchDrupalData = async () => {
  const response = await axios.get(`${drupalBaseUrl}/jsonapi/node/mydata/${drupalAuthUsersNodeId}`, {
    headers: { 'Content-Type': 'application/vnd.api+json' }
  });
  return response.data.data;
};


const fetchDrupalOTPData = async () => {
  const response = await axios.get(`${drupalBaseUrl}/jsonapi/node/mydata/${drupalAuthOTPNodeId}`, {
    headers: { 'Content-Type': 'application/vnd.api+json' }
  });
  return response.data.data;
};


exports.registerUser = async (req, res, next) => {
  try {
    const { username, email, password } = req.body;

    const nodeData = await fetchDrupalData();
    let table = nodeData.attributes.field_mydata.value || {};

    for (const key in table) {
      if (key === "0") continue;
      const row = table[key];
      if (row["1"] === username || row["2"] === email) {
        return res.status(400).json({ message: 'User already exists', success: false });
      }
    }

    const nodeOTPData = await fetchDrupalOTPData();
    let otpTable = nodeOTPData.attributes.field_mydata.value || {};

    const OTP = generateOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const createdAt = new Date().toISOString();

    let otpKey = null;

    for (const key in otpTable) {
      if (key === "0") continue;
      const row = otpTable[key];
      if (row["1"] === username || row["2"] === email) {
        otpKey = key;
        break;
      }
    }

    if (otpKey) {
      otpTable[otpKey]["4"] = OTP;
      otpTable[otpKey]["5"] = createdAt; 
      otpTable[otpKey]["6"] = expiresAt;
    } else {
      const newOtpKey = Date.now().toString();
      otpTable[newOtpKey] = {
        "0": newOtpKey,
        "1": username,
        "2": email,
        "3": password,
        "4": OTP,
        "5": createdAt,
        "6": expiresAt,
        "weight": 0
      };
    }

    const templatePath = path.join(__dirname, '..', 'utils', 'templates', 'emailTemplate.html');
    let emailContent = fs.readFileSync(templatePath, 'utf-8');
    emailContent = emailContent.replace('{{name}}', username);
    emailContent = emailContent.replace('{{otp_code}}', OTP);

    await sendMail({
      email,
      subject: 'OTP Verification',
      message: emailContent,
      tag: 'otp',
    });

    const otpPayload = {
      data: {
        type: "node--mydata",
        id: drupalAuthOTPNodeId,
        attributes: {
          field_mydata: { value: otpTable }
        }
      }
    };

    await axios.patch(`${drupalBaseUrl}/jsonapi/node/mydata/${drupalAuthOTPNodeId}`, otpPayload, {
      headers: { 'Content-Type': 'application/vnd.api+json' }
    });

    res.status(200).json({ message: 'OTP sent successfully', success: true });

  } catch (error) {
    next(error);
  }
};



exports.otpVerification = async (req, res, next) => {
  try {
    const { otp, email } = req.body;
    const nodeOTPData = await fetchDrupalOTPData();
    let otpTable = nodeOTPData.attributes.field_mydata.value || {};

    let otpKey = null;
    let otpData = null;

    for (const key in otpTable) {
      if (key === "0") continue;
      const row = otpTable[key];
      if (row["2"] === email) {
        otpKey = key;
        otpData = row;
        break;
      }
    }

    if (!otpData) {
      return res.status(404).json({
        success: false,
        message: "OTP not found",
      });    
    }
    console.log(otp)

    if (otp === otpData["4"]) {
      console.log("yes yeah");
    }

    if (otp !== otpData["4"] || new Date(otpData["6"]) < new Date()) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired OTP",
      });
    }

    const nodeData = await fetchDrupalData();
    let table = nodeData.attributes.field_mydata.value || {};

    const newRowKey = Date.now().toString();
    const newRow = {
      "0": newRowKey,
      "1": otpData["1"], // Username
      "2": otpData["2"], // Email
      "3": otpData["3"],
      "4": new Date().toISOString(),
      "weight": 0
    };

    table[newRowKey] = newRow;

    const userPayload = {
      data: {
        type: "node--mydata",
        id: drupalAuthUsersNodeId,
        attributes: {
          field_mydata: { value: table }
        }
      }
    };

    await axios.patch(`${drupalBaseUrl}/jsonapi/node/mydata/${drupalAuthUsersNodeId}`, userPayload, {
      headers: { 'Content-Type': 'application/vnd.api+json' }
    });

    delete otpTable[otpKey];

    const otpPayload = {
      data: {
        type: "node--mydata",
        id: drupalAuthOTPNodeId,
        attributes: {
          field_mydata: { value: otpTable }
        }
      }
    };

    await axios.patch(`${drupalBaseUrl}/jsonapi/node/mydata/${drupalAuthOTPNodeId}`, otpPayload, {
      headers: { 'Content-Type': 'application/vnd.api+json' }
    });
    return res.status(200).json({ message: 'Registered Successfully!', success: true });
  } catch (error) {
    console.log(error)
    return res.status(500).json({
      success: false,
      message: "Internet server error",
    });
  }
};



exports.loginUser = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const nodeData = await fetchDrupalData();
    let table = nodeData.attributes.field_mydata.value || {};

    let foundUser = null;
    for (const key in table) {
      if (key === "0") continue;
      const row = table[key];
      if (row["2"] === email) {
        foundUser = row;
        break;
      }
    }

    if (!foundUser) {
      return res.status(400).json({ message: 'Invalid credentials', success: false });
    }
    if (foundUser["3"] !== password) {
      return res.status(400).json({ message: 'Invalid credentials', success: false });
    }

    const payload = { userId: foundUser["0"] };
    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' });
    console.log("foundUser", foundUser)

    res.cookie('token', token, {
      httpOnly: true,
      sameSite: "none",
      secure: true,
      maxAge: 3600000,
    });

    res.json({ message: 'Logged in successfully', success: true });
  } catch (error) {
    next(error);
  }
};



exports.verify = async (req, res, next) => {
  try {
    const token = req.cookies.token;
    if (!token) {
      return res.status(401).json({ valid: false, message: 'No token provided' });
    }
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      console.log(decoded)
      const userId = decoded.userId;
      const nodeData = await fetchDrupalData();
      let table = nodeData.attributes.field_mydata.value || {};
      console.log(table)
      let foundUser = false;
      for (const key in table) {
        if (key === userId) {
          foundUser = true;
        }
      }
      if (!foundUser) {
        res.clearCookie('token', { httpOnly: true, secure: true, sameSite: 'strict' });
        console.log("2")
        return res.status(400).json({ message: 'Invalid credentials', success: false });
      }
      return res.status(200).json({ valid: true, user: decoded });
    } catch (error) {
      res.clearCookie('token', { httpOnly: true, secure: true, sameSite: 'strict' });
      console.log("3")
      console.log(error)
      return res.status(401).json({ valid: false, message: 'Invalid token. Token deleted.' });
    }
  } catch (error) {
    console.error('Error verifying user:', error);
    next(error);
  }
};



exports.resentOtp = async (req, res, next) => {
  try {
    const { email } = req.body;

    const nodeOTPData = await fetchDrupalOTPData();
    let otpTable = nodeOTPData.attributes.field_mydata.value || {};

    const OTP = generateOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const createdAt = new Date().toISOString();

    let otpKey = null;

    for (const key in otpTable) {
      if (key === "0") continue;
      const row = otpTable[key];
      if (row["1"] === username || row["2"] === email) {
        otpKey = key;
        break;
      }
    }

    if (otpKey) {
      otpTable[otpKey]["4"] = OTP;
      otpTable[otpKey]["5"] = createdAt; 
      otpTable[otpKey]["6"] = expiresAt;
    }

    const otpPayload = {
      data: {
        type: "node--mydata",
        id: drupalAuthOTPNodeId,
        attributes: {
          field_mydata: { value: otpTable }
        }
      }
    };

    await axios.patch(`${drupalBaseUrl}/jsonapi/node/mydata/${drupalAuthOTPNodeId}`, otpPayload, {
      headers: { 'Content-Type': 'application/vnd.api+json' }
    });


    const templatePath = path.join(__dirname, '..', 'utils', 'templates', 'emailTemplate.html');
    let emailContent = fs.readFileSync(templatePath, 'utf-8');
    emailContent = emailContent.replace('{{name}}', username);
    emailContent = emailContent.replace('{{otp_code}}', OTP);

    await sendMail({
      email,
      subject: 'New OTP for Verification',
      message: emailContent,
      tag: 'otp',
    });

    res.status(200).json({
      success: true,
      message: `OTP resent successfully to ${email}`,
    });
  } catch (error) {
    console.log(error);
  }
};



exports.logout = async (req, res, next) => {
  try {
    const token = req.cookies.token;
    if (!token) {
      return res.status(401).json({ valid: false, message: 'No token provided' });
    }
    try {
      res.clearCookie('token', { httpOnly: true, secure: true, sameSite: 'strict' });
      return res.status(200).json({ valid: false, success: true, message: "Logout successfully!" });
    } catch (error) {
      res.clearCookie('token', { httpOnly: true, secure: true, sameSite: 'strict' });
      console.log("3")
      console.log(error)
      return res.status(401).json({ valid: false, message: 'Invalid token. Token deleted.' });
    }
  } catch (error) {
    console.error('Error verifying user:', error);
    next(error);
  }
};
