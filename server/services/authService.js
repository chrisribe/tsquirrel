'use strict';

const argon2 = require('argon2');
const UserDAO = require('../dao/UserDAO');

let userDAO;

function initialize(pool) {
  userDAO = new UserDAO(pool);
}

async function authenticateUser(usernameOrEmail, password) {
  // Try username first, then email
  let user = await userDAO.getUserByUsername(usernameOrEmail);
  if (!user) {
    user = await userDAO.getUserByEmail(usernameOrEmail);
  }

  // Constant-time comparison to prevent timing attacks / username enumeration
  if (!user) {
    await argon2.hash('dummy-password-to-maintain-timing');
    return null;
  }

  // Block inactive/suspended users
  if (user.status !== 'active') {
    return null;
  }

  if (await argon2.verify(user.password, password)) {
    return user;
  }

  return null;
}

module.exports = { initialize, authenticateUser };
