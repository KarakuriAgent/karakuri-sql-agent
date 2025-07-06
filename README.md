# Karakuri SQL Agent

An AI-powered SQL agent built on the Mastra framework that converts natural language queries into SQL operations with built-in safety mechanisms.

## Features

- 🤖 **Natural Language to SQL**: Convert plain English requests into SQLite queries
- 🔒 **Safety First**: Confirmation required for data-modifying operations (INSERT/UPDATE/DELETE)
- 🚫 **DDL Protection**: Prohibits dangerous schema operations (CREATE/DROP/ALTER)
- 🌐 **Multiple Interfaces**: Support for stdio, Server-Sent Events (SSE), and HTTP protocols
- 🔑 **Optional Authentication**: API key protection for HTTP/SSE interfaces
- 📊 **Database Flexibility**: Works with local SQLite and Turso cloud databases
- 🧪 **Comprehensive Testing**: Full test coverage with Vitest

## Quick Start

### Prerequisites

- OpenAI API key

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd karakuri-sql-agent

# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Edit .env with your configuration
# At minimum, set OPENAI_API_KEY
```

### Configuration

Edit `.env` file with your settings:

```bash
# Required
OPENAI_API_KEY=your-openai-api-key-here

# Database (defaults to local SQLite)
DATABASE_URL='file:./example/database/app.db'

# For Turso cloud database:
# DATABASE_URL='libsql://your-database-name-your-username.turso.io'
# DATABASE_AUTH_TOKEN=your-turso-auth-token-here

# MCP interfaces (all enabled by default)
MCP_ENABLE_STDIO=true
MCP_ENABLE_SSE=true
MCP_ENABLE_HTTP=true

# Optional API key for HTTP/SSE authentication
MCP_API_KEY=your-secret-api-key-here
```

### Running the Application

```bash
# Start MCP server (recommended for MCP clients)
npm run start:mcp

# Or start full Mastra development server
npm run dev
```

## Usage Examples

### Natural Language Queries

```
"Show me all users"
→ SELECT * FROM users

"Products with stock less than 10"
→ SELECT * FROM products WHERE stock < 10

"Top 5 selling products this month"
→ SELECT p.name, SUM(o.amount) as total_sales
  FROM products p
  JOIN orders o ON p.id = o.product_id
  WHERE o.order_date >= date('now', 'start of month')
  GROUP BY p.id, p.name
  ORDER BY total_sales DESC
  LIMIT 5
```

### Data Modification (Requires Confirmation)

```
"Add new user John Doe with email john@example.com"
→ Generates confirmation token for:
  INSERT INTO users (name, email, created_at)
  VALUES ('John Doe', 'john@example.com', datetime('now'))

"Update all products with 0 stock to 10"
→ Generates confirmation token for:
  UPDATE products SET stock = 10 WHERE stock = 0
```

## Development

### Commands

```bash
# Development
npm run dev              # Start development server
npm run build           # Build project
npm run start           # Start production server

# Testing
npm run test            # Run tests
npm run test:watch      # Watch mode
npm run test:coverage   # With coverage

# Code Quality
npm run lint            # ESLint
npm run format          # Prettier
npm run typecheck       # TypeScript
```

### Project Structure

```
src/
├── mastra/
│   ├── agents/         # AI agents
│   ├── tools/          # SQL query handlers
│   ├── services/       # Token store, executor
│   ├── api/            # REST endpoints
│   └── mcp.ts          # MCP server
├── database/
│   ├── database-manager.ts    # Database singleton
│   └── migration-manager.ts   # Schema migrations
└── config/
    └── env.ts          # Environment configuration
```

## MCP Integration

This application implements the Model Context Protocol (MCP) and can be used with MCP-compatible clients:

### Stdio Interface (Local)

```bash
npm run start:mcp
```

### HTTP Interface

```bash
# Server runs on http://localhost:4113/mcp
curl -X POST http://localhost:4113/mcp \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"method": "tools/call", "params": {...}}'
```

### SSE Interface

```bash
# Connect to http://localhost:4112/sse
```

## Safety Features

### Query Validation

- ✅ **Allowed**: SELECT, INSERT, UPDATE, DELETE
- ❌ **Forbidden**: CREATE, DROP, ALTER, TRUNCATE

### Confirmation System

- Data-modifying operations require user confirmation
- Time-limited confirmation tokens (5-minute expiration)
- Clear impact estimation before execution

### Error Handling

- Comprehensive SQL syntax validation
- User-friendly error messages
- Graceful degradation for configuration issues

## Database Support

### Local SQLite

```bash
DATABASE_URL='file:./example/database/app.db'
```

### Turso Cloud

```bash
DATABASE_URL='libsql://your-database-name-your-username.turso.io'
DATABASE_AUTH_TOKEN='your-auth-token'
```

Both configurations use the same LibSQL client with automatic compatibility.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Run tests: `npm run test`
4. Ensure code quality: `npm run lint && npm run format`
5. Submit a pull request

## License

MIT License - see LICENSE file for details.
