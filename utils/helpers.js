/**
 * Generate a random 10-digit Indian phone number
 * Starts with 6, 7, 8, or 9
 */
function generateRandomPhone() {
  const prefixes = ['6', '7', '8', '9'];
  const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
  let number = prefix;
  for (let i = 0; i < 9; i++) {
    number += Math.floor(Math.random() * 10).toString();
  }
  return number;
}

/**
 * Generate a random name for signup
 * Only letters, spaces, and . ' - are allowed
 */
function generateRandomName() {
  const firstNames = ['Test', 'Astro', 'Star', 'Cosmic', 'Luna', 'Nova', 'Arjun', 'Priya', 'Rohan', 'Anita'];
  const lastNames = ['User', 'Gazer', 'Tester', 'Bot', 'Singh', 'Sharma', 'Patel', 'Kumar', 'Verma', 'Gupta'];
  const first = firstNames[Math.floor(Math.random() * firstNames.length)];
  const last = lastNames[Math.floor(Math.random() * lastNames.length)];
  return `${first} ${last}`;
}

/**
 * Generate a random email
 */
function generateRandomEmail(name) {
  return `${name.toLowerCase().replace(/\s+/g, '')}@testmail.com`;
}

module.exports = {
  generateRandomPhone,
  generateRandomName,
  generateRandomEmail,
};
