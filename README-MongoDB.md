# MediConnect Backend - MongoDB Setup Guide

## Overview

The MediConnect backend has been migrated from PostgreSQL to MongoDB to take advantage of MongoDB's flexible document structure and better scalability for our healthcare platform.

## Prerequisites

- Node.js (>= 18.0.0)
- MongoDB (>= 6.0) - Local installation or MongoDB Atlas account
- npm or yarn package manager

## MongoDB Installation Options

### Option 1: Local MongoDB Installation

#### On Ubuntu/Debian:
```bash
# Install MongoDB Community Edition
curl -fsSL https://pgp.mongodb.com/server-7.0.asc | \
   sudo gpg -o /usr/share/keyrings/mongodb-server-7.0.gpg \
   --dearmor

echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list

sudo apt-get update
sudo apt-get install -y mongodb-org

# Start MongoDB service
sudo systemctl start mongod
sudo systemctl enable mongod
```

#### On macOS:
```bash
# Using Homebrew
brew tap mongodb/brew
brew install mongodb-community
brew services start mongodb/brew/mongodb-community
```

#### On Windows:
Download and install MongoDB Community Server from the official MongoDB website.

### Option 2: MongoDB Atlas (Cloud)

1. Sign up for a free MongoDB Atlas account at https://www.mongodb.com/atlas
2. Create a new cluster
3. Create a database user with read/write permissions
4. Whitelist your IP address or use `0.0.0.0/0` for development
5. Get your connection string from the "Connect" button

## Environment Configuration

### Local MongoDB Setup:
```env
# For local MongoDB without authentication
DATABASE_URL="mongodb://localhost:27017/mediconnect"

# For local MongoDB with authentication
DATABASE_URL="mongodb://username:password@localhost:27017/mediconnect?authSource=admin"
```

### MongoDB Atlas Setup:
```env
DATABASE_URL="mongodb+srv://username:password@cluster.mongodb.net/mediconnect?retryWrites=true&w=majority"
```

## Installation and Setup

1. **Clone the repository and install dependencies:**
```bash
cd backend
npm install
```

2. **Set up environment variables:**
```bash
cp .env.example .env
# Edit .env file with your MongoDB connection string
```

3. **Generate Prisma client:**
```bash
npm run db:generate
```

4. **Push the schema to MongoDB:**
```bash
npm run db:push
```

5. **Seed the database with sample data:**
```bash
npm run db:seed
```

6. **Start the development server:**
```bash
npm run dev
```

## Key Changes from PostgreSQL

### Schema Changes

1. **Object IDs**: All model IDs now use MongoDB ObjectIds
   ```prisma
   id String @id @default(auto()) @map("_id") @db.ObjectId
   ```

2. **Foreign Key References**: Updated to use ObjectId type
   ```prisma
   userId String @db.ObjectId
   ```

3. **Removed Sequential IDs**: MongoDB doesn't support auto-incrementing integers, so we use ObjectIds throughout

### Database Operations

- **No Migrations**: MongoDB with Prisma uses `db:push` instead of migrations
- **Flexible Schema**: MongoDB's document structure allows for more flexible data modeling
- **Embedded Documents**: JSON fields work seamlessly with MongoDB's document structure

## Available Scripts

```bash
# Development
npm run dev              # Start development server with nodemon
npm run start           # Start production server

# Database
npm run db:generate     # Generate Prisma client
npm run db:push         # Push schema to MongoDB
npm run db:studio       # Open Prisma Studio
npm run db:seed         # Seed database with sample data
npm run db:reset        # Reset database and reseed

# Testing
npm run test            # Run tests
npm run test:watch      # Run tests in watch mode
```

## MongoDB-Specific Considerations

### Performance Optimization

1. **Indexing**: MongoDB automatically creates indexes for unique fields
2. **Aggregation**: Use MongoDB's powerful aggregation pipeline for complex queries
3. **Connection Pooling**: Configured via environment variables

### Data Modeling Best Practices

1. **Embedded vs Referenced**: 
   - User operating hours are embedded (JSON)
   - Relationships like User-Inventory use references

2. **Array Fields**: 
   - Health tip tags are stored as string arrays
   - Message attachments are stored as JSON arrays

3. **Flexible Schema**: 
   - JSON fields for complex data (operating hours, notification data)
   - Easy to extend without schema migrations

## Monitoring and Administration

### Using MongoDB Compass
MongoDB Compass provides a GUI for database administration:
```bash
# Install MongoDB Compass
# Connect using your DATABASE_URL
```

### Using Prisma Studio
```bash
npm run db:studio
```

## Troubleshooting

### Common Issues

1. **Connection Issues**:
   - Verify MongoDB is running: `sudo systemctl status mongod`
   - Check connection string format
   - Ensure IP whitelist includes your address (Atlas)

2. **Authentication Errors**:
   - Verify username/password in connection string
   - Check user permissions in MongoDB

3. **Schema Sync Issues**:
   - Run `npm run db:push` after schema changes
   - Use `npm run db:reset` for complete reset

### Useful MongoDB Commands

```javascript
// Connect to MongoDB shell
mongosh

// List databases
show dbs

// Use MediConnect database
use mediconnect

// List collections
show collections

// Find all users
db.users.find().pretty()

// Find specific user
db.users.findOne({email: "marie.ngozi@email.com"})
```

## Migration Notes

### Data Migration from PostgreSQL

If migrating existing data from PostgreSQL:

1. Export data from PostgreSQL
2. Transform PostgreSQL UUIDs to MongoDB ObjectIds
3. Import data using MongoDB tools or custom scripts
4. Verify relationships and constraints

### API Compatibility

- API endpoints remain the same
- Response formats unchanged (ObjectIds are serialized as strings)
- Authentication and authorization work identically

## Production Deployment

### MongoDB Atlas (Recommended)
- Automatic backups
- Global clusters
- Built-in monitoring
- Security features

### Self-Hosted MongoDB
- Configure replica sets for high availability
- Set up monitoring (MongoDB Cloud Manager)
- Implement backup strategies
- Configure security (authentication, encryption)

## Support

For issues related to:
- **MongoDB setup**: MongoDB official documentation
- **Prisma + MongoDB**: Prisma MongoDB documentation
- **Application-specific issues**: Check application logs and error messages

## Sample Test Accounts

After running the seed script, you can use these test accounts:

**Patient Account:**
- Email: marie.ngozi@email.com
- Password: password123

**Pharmacy Account:**
- Email: contact@pharmaciecentrale.cm
- Password: pharmacy123

## Next Steps

1. Set up your MongoDB instance (local or Atlas)
2. Configure environment variables
3. Run the setup commands
4. Test API endpoints
5. Deploy to production environment

The migration to MongoDB provides better scalability, flexible schema design, and improved performance for the MediConnect healthcare platform.