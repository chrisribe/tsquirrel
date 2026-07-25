#!/usr/bin/env node
/**
 * Create or Reset Admin Account
 *
 * Run: npm run create-user
 * Or:  docker compose exec server npm run create-user
 */

const readline = require('readline');
const { Pool } = require('pg');
const argon2 = require('argon2');
const UserDAO = require('../dao/UserDAO');

const VALID_ROLES = ['user', 'admin'];

function prompt(rl, question) {
  return new Promise(resolve => rl.question(question, resolve));
}

(async () => {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const userDAO = new UserDAO(pool);

  try {
    console.log('\n=== Create or Reset Admin Account ===\n');

    const username = await prompt(rl, 'Username: ');
    const email = await prompt(rl, 'Email: ');
    const password = await prompt(rl, 'Password (min 8 chars): ');
    const role = (await prompt(rl, `Role (${VALID_ROLES.join('/')}) [admin]: `)) || 'admin';

    if (!username || username.length < 3) {
      console.error('Error: Username must be at least 3 characters');
      process.exit(1);
    }
    if (!email || !email.includes('@')) {
      console.error('Error: Invalid email');
      process.exit(1);
    }
    if (!password || password.length < 8) {
      console.error('Error: Password must be at least 8 characters');
      process.exit(1);
    }
    if (!VALID_ROLES.includes(role)) {
      console.error(`Error: Role must be one of: ${VALID_ROLES.join(', ')}`);
      process.exit(1);
    }

    const hashedPassword = await argon2.hash(password);
    const { inserted } = await userDAO.upsertAdmin({
      username,
      email,
      password: hashedPassword,
      role,
    });

    console.log(inserted
      ? `\n✓ Account '${username}' created (${role})!`
      : `\n✓ Account '${username}' updated!`);
    console.log();
  } catch (err) {
    if (err.code === '23505') {
      console.error('Error: Email already used by another account');
    } else {
      console.error('Error:', err.message);
    }
    process.exit(1);
  } finally {
    rl.close();
    await pool.end();
  }
})();
