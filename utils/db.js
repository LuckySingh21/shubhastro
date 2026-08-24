const { MongoClient } = require('mongodb');
require('dotenv').config();

class Database {
  constructor() {
    this.client = null;
    this.db = null;
  }

  async connect() {
    this.client = new MongoClient(process.env.MONGO_URI);
    await this.client.connect();
    this.db = this.client.db(process.env.MONGO_DB_NAME);
    console.log('Connected to MongoDB');
    return this.db;
  }

  async getCollection(collectionName) {
    if (!this.db) await this.connect();
    return this.db.collection(collectionName);
  }

  async close() {
    if (this.client) {
      await this.client.close();
      console.log('MongoDB connection closed');
    }
  }
}

module.exports = new Database();
