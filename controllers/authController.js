const axios = require('axios');
const jwt = require('jsonwebtoken');

const drupalBaseUrl = process.env.DRUPAL_BASE_URL; // e.g., http://localhost
const drupalNodeId = process.env.DRUPAL_NODE_ID;   // e.g., 9bf2afaa-f7ea-4e2f-a736-4f3ddec1f285
const nodeUrl = `${drupalBaseUrl}/jsonapi/node/mydata/${drupalNodeId}`;


const fetchDrupalData = async () => {
  const response = await axios.get(nodeUrl, {
    headers: { 'Content-Type': 'application/vnd.api+json' }
  });
  return response.data.data;
};

exports.registerUser = async (req, res, next) => {
  try {
    const { username, email, password } = req.body;
    const nodeData = await fetchDrupalData();
    let table = nodeData.attributes.field_mydata.value || {};
    let duplicateFound = false;
    for (const key in table) {
      if (key === "0") continue;
      const row = table[key];
      if (row["1"] === username || row["2"] === email) {
        duplicateFound = true;
        break;
      }
    }

    if (duplicateFound) {
      return res.status(400).json({ message: 'User already exists', success: false });
    }
    const newRowKey = Date.now().toString();
    const newRow = {
      "0": newRowKey,
      "1": username,
      "2": email,
      "3": password,
      "4": new Date().toISOString(),
      "weight": 0
    };

    table[newRowKey] = newRow;

    const payload = {
      data: {
        type: "node--mydata",
        id: drupalNodeId,
        attributes: {
          field_mydata: { value: table }
        }
      }
    };

    await axios.patch(nodeUrl, payload, {
      headers: { 'Content-Type': 'application/vnd.api+json' }
    });

    res.status(201).json({ message: 'User created successfully', success: true });
  } catch (error) {
    next(error);
  }
};

exports.loginUser = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const nodeData = await fetchDrupalData();
    let table = nodeData.attributes.field_mydata.value || {};

    let foundUser = null;
    for (const key in table) {
      if (key === "0") continue; // skip header
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
        if(key===userId){
          foundUser=true;
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
