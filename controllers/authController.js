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
      "4": new Date().toISOString()
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

    // Update the node with the new user table.
    await axios.patch(nodeUrl, payload, {
      headers: { 'Content-Type': 'application/vnd.api+json' }
    });

    res.status(201).json({ message: 'User created successfully', success: true });
  } catch (error) {
    next(error);
  }
};

/**
 * Log in a user by checking Drupal data for matching email and password.
 */
exports.loginUser = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    // Fetch current Drupal node data.
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

    // Check if passwords match (in production, compare hashed passwords)
    if (foundUser["3"] !== password) {
      return res.status(400).json({ message: 'Invalid credentials', success: false });
    }

    // Create JWT token payload using the user ID from row["0"]
    const payload = { userId: foundUser["0"] };
    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' });

    // Set token as an HTTP-only cookie.
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 3600000, // 1 hour
    });

    res.json({ message: 'Logged in successfully', success: true });
  } catch (error) {
    next(error);
  }
};
