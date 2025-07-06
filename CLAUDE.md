# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Core Commands

- `npm run dev` - Start development server using Mastra
- `npm run build` - Build the project using Mastra
- `npm run start` - Start the production server
- `npm run start:mcp` - Start the MCP server directly

### Testing

- `npm run test` - Run all tests once
- `npm run test:watch` - Run tests in watch mode
- `npm run test:ui` - Run tests with UI interface
- `npm run test:coverage` - Run tests with coverage report
- `npm run test:ci` - Run tests in CI mode (no API key required)

### Code Quality

- `npm run lint` - Run ESLint
- `npm run lint:fix` - Run ESLint with auto-fix
- `npm run format` - Format code with Prettier
- `npm run format:check` - Check code formatting
- `npm run typecheck` - Run TypeScript type checking

## Architecture Overview

### Core Components

**Mastra Framework Integration**

- Built on top of Mastra framework (`@mastra/core`)
- Main entry point: `src/mastra/index.ts`
- Configures agents, logger, and API routes

**SQL Agent System**

- AI-powered SQL agent using OpenAI GPT-4o-mini
- Agent definition: `src/mastra/agents/sql-agent.ts`
- Converts natural language to SQL queries
- Includes extensive SQL generation instructions and examples

**MCP Server**

- Model Context Protocol server implementation
- Entry point: `src/mastra/mcp.ts`
- Supports multiple interfaces: stdio, SSE, HTTP
- Optional API key authentication for HTTP/SSE

**Database Management**

- Singleton pattern database manager: `src/database/database-manager.ts`
- Uses LibSQL client for SQLite/Turso compatibility
- Automated migration system via `src/database/migration-manager.ts`
- WAL mode enabled for performance

### Tool System

**SQL Query Handler** (`src/mastra/tools/sql-query-handler.ts`)

- Executes SQL queries with safety checks
- Allows SELECT operations immediately
- Requires confirmation for INSERT/UPDATE/DELETE operations
- Prohibits DDL operations (CREATE, DROP, etc.)

**Confirmation System**

- Token-based confirmation for destructive operations
- Token store: `src/mastra/services/sql-token-store.ts`
- Execution endpoint: `src/mastra/api/sql-confirm-execute.ts`
- Configurable token expiration (default: 5 minutes)

### Configuration System

**Environment Configuration** (`src/config/env.ts`)

- Centralized configuration management
- Validation with helpful error messages
- Test environment support
- Support for both local SQLite and Turso cloud databases

**Key Environment Variables**

- `OPENAI_API_KEY` - Required for SQL agent
- `DATABASE_URL` - Database connection string
- `DATABASE_AUTH_TOKEN` - For Turso cloud databases
- `MCP_API_KEY` - Optional API key for MCP authentication
- Interface toggles: `MCP_ENABLE_STDIO`, `MCP_ENABLE_SSE`, `MCP_ENABLE_HTTP`

## Development Patterns

### Database Operations

- Always use `DatabaseManager.getInstance()` for database access
- Database auto-initializes with migrations on first use
- Use `await ensureInitialized()` for explicit initialization
- Transaction support available via `executeTransaction()`

### SQL Safety

- All SQL queries go through validation in `sql-query-handler.ts`
- Only SELECT, INSERT, UPDATE, DELETE operations allowed
- DDL operations (CREATE, DROP, ALTER) are prohibited
- Confirmation tokens required for data-modifying operations

### Error Handling

- Comprehensive error handling with user-friendly messages
- Configuration validation prevents runtime errors
- Database connection verification on startup
- Graceful degradation for missing environment variables in tests

### Testing

- Vitest for testing framework
- Test setup in `tests/setup.ts`
- Database manager reset utilities for testing
- Environment variable mocking for CI/CD

## File Structure Notes

**Source Organization**

- `src/mastra/` - Core Mastra components (agents, tools, services)
- `src/database/` - Database management and migrations
- `src/config/` - Configuration and environment handling
- `tests/` - Test files mirroring source structure

**Key Files**

- `src/mastra/index.ts` - Main Mastra application
- `src/mastra/mcp.ts` - MCP server with multi-interface support
- `src/mastra/agents/sql-agent.ts` - AI agent with detailed SQL instructions
- `src/database/database-manager.ts` - Singleton database manager
- `src/config/env.ts` - Environment configuration with validation

## Turso Cloud Database Support

The project supports both local SQLite and Turso cloud databases:

- Local: `file:./example/database/app.db`
- Turso: `libsql://your-database-name-your-username.turso.io`
- Authentication token required for Turso cloud databases
- LibSQL client handles both connection types transparently
