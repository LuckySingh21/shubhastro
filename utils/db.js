const { MongoClient, ObjectId } = require('mongodb');
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
    console.log('Connected to MongoDB (read-only)');
    return this.db;
  }

  async getCollection(collectionName) {
    if (!this.db) await this.connect();
    return this.db.collection(collectionName);
  }

  // ---- User Queries ----

  async findUserByPhone(phone) {
    // Phone is stored with country code prefix (e.g., "917875250002")
    const phoneWithCode = phone.startsWith('91') ? phone : `91${phone}`;
    const collection = await this.getCollection('users');
    return await collection.findOne({ phoneNumber: phoneWithCode });
  }

  async findUserById(userId) {
    const collection = await this.getCollection('users');
    return await collection.findOne({ _id: userId });
  }

  // ---- Verification Helpers ----

  async verifyUserExists(phone) {
    const user = await this.findUserByPhone(phone);
    return user !== null;
  }

  async getUserProfile(phone) {
    const user = await this.findUserByPhone(phone);
    return user;
  }

  async getUserWallet(phone) {
    const user = await this.findUserByPhone(phone);
    if (!user) return null;
    const collection = await this.getCollection('wallets');
    return await collection.findOne({ userId: user._id });
  }

  async getUserWalletByUserId(userId) {
    const collection = await this.getCollection('wallets');
    // userId in wallets collection is stored as ObjectId
    const id = typeof userId === 'string' ? new ObjectId(userId) : userId;
    return await collection.findOne({ userId: id });
  }

  // ---- Generic Query ----

  async findOne(collectionName, query) {
    const collection = await this.getCollection(collectionName);
    return await collection.findOne(query);
  }

  async findMany(collectionName, query, options = {}) {
    const collection = await this.getCollection(collectionName);
    return await collection.find(query, options).toArray();
  }

  // ---- Cleanup ----

  async close() {
    if (this.client) {
      await this.client.close();
      console.log('MongoDB connection closed');
    }
  }
}

module.exports = new Database();
